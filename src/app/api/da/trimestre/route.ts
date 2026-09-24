/**
 * Rapport trimestriel d'ARRONDISSEMENT.
 *
 * Les DA produisent eux aussi un rapport trimestriel — ils le retapaient
 * jusqu'ici entièrement à la main, chacun dans sa forme, au point que sur les
 * six rapports réels du premier trimestre 2026, deux seuls en-têtes de tableau
 * étaient communs à tous. Il n'existait donc pas de canevas d'arrondissement de
 * fait : c'est le canevas départemental, ramené à un seul territoire.
 *
 * Le document produit ici est le même que celui du DD, à trois différences que
 * le générateur applique seul : une seule colonne territoriale au lieu de six,
 * les titres transposés (« DE L'ARRONDISSEMENT DE DSCHANG »), et les textes
 * fixes du DA — jamais ceux du Délégué départemental.
 *
 *   GET                             périodes disponibles + état de la sienne
 *   POST { annee, trimestre, apercu }   génère le .docx
 *
 * Un DA ne peut demander QUE son arrondissement : le sien est lu sur sa
 * session, jamais reçu du client. Le DD, lui, peut demander celui de n'importe
 * lequel de ses six — il en est le destinataire.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle, libelleOfficiel, libelleCourt } from "@/server/periodes/calendrier";
import { inspecterPeriode, PeriodeNonCalculableError } from "@/server/trimestre/agregation";
import { genererRapportCanevas } from "@/server/trimestre/rapportCanevas";
import { archiverRapportTrimestriel } from "@/server/trimestre/archivage";
import { arrondissementFige } from "@/server/trimestre/circuit";
import type { PrismaClient } from "@prisma/client";

/**
 * L'arrondissement du rapport demandé.
 *
 * Pour un DA, c'est le sien et rien d'autre : le nom n'est pas lu dans la
 * requête, sans quoi il suffirait de changer un paramètre pour lire le rapport
 * du voisin. Le DD peut nommer l'un des six.
 */
async function arrondissementDemande(
  user: { role: string; arrondissementId: string | null },
  db: PrismaClient,
  demande: string | null
): Promise<string> {
  if (user.role === "DA") {
    if (!user.arrondissementId) throw new Error("Compte sans arrondissement assigné.");
    const a = await db.arrondissement.findUnique({
      where: { id: user.arrondissementId },
      select: { nom: true },
    });
    if (!a) throw new Error("Arrondissement introuvable.");
    return a.nom;
  }
  if (!demande) throw new Error("Arrondissement non précisé.");
  const a = await db.arrondissement.findFirst({ where: { nom: demande }, select: { nom: true } });
  if (!a) throw new Error(`Arrondissement inconnu : « ${demande} ».`);
  return a.nom;
}

/** Les trimestres pour lesquels au moins un mois existe en base. */
async function trimestresDisponibles(db: PrismaClient) {
  const mois = await db.periodeReporting.findMany({
    where: { type: "MENSUEL" },
    select: { annee: true, mois: true },
    orderBy: [{ annee: "desc" }, { mois: "desc" }],
  });
  const vus = new Map<string, { annee: number; trimestre: number }>();
  for (const m of mois) {
    if (m.mois == null) continue;
    const t = Math.floor((m.mois - 1) / 3) + 1;
    vus.set(`${m.annee}-${t}`, { annee: m.annee, trimestre: t });
  }
  return Array.from(vus.values())
    .sort((a, b) => b.annee - a.annee || b.trimestre - a.trimestre)
    .map((t) => ({
      ...t,
      libelle: libelleOfficiel(trimestrielle(t.annee, t.trimestre)),
      court: libelleCourt(trimestrielle(t.annee, t.trimestre)),
    }));
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD"]);
    const db = user.db as PrismaClient;

    const url = new URL(req.url);
    const arrondissement = await arrondissementDemande(user, db, url.searchParams.get("arrondissement"));

    // `Number(null)` vaut 0 et `Number.isInteger(0)` est vrai : on vérifie la
    // présence du paramètre AVANT de convertir, sinon une requête sans période
    // passe pour une demande sur l'an 0.
    const anneeBrute = url.searchParams.get("annee");
    const trimestreBrut = url.searchParams.get("trimestre");

    const disponibles = await trimestresDisponibles(db);
    if (!anneeBrute || !trimestreBrut) {
      return NextResponse.json({ arrondissement, disponibles });
    }
    const annee = Number(anneeBrute);
    const trimestre = Number(trimestreBrut);
    if (!Number.isInteger(annee) || !Number.isInteger(trimestre) || trimestre < 1 || trimestre > 4) {
      return NextResponse.json({ message: "Période demandée invalide.", disponibles }, { status: 400 });
    }

    const p = trimestrielle(annee, trimestre);
    const etat = await inspecterPeriode(db, p);
    const sien = await db.arrondissement.findFirst({ where: { nom: arrondissement }, select: { id: true } });

    return NextResponse.json({
      arrondissement,
      disponibles,
      periode: { annee, trimestre, libelle: etat.libelle, court: libelleCourt(p) },
      mois: etat.mois.map((m) => ({
        libelle: `${String(m.mois).padStart(2, "0")}/${m.annee}`,
        present: Boolean(m.periodeId),
        complet: m.complet,
      })),
      calculable: etat.calculable,
      moisAbsents: etat.moisAbsents,
      moisIncomplets: etat.moisIncomplets,
      // Le circuit : le définitif est celui que le DA a transmis au DD.
      transmis: sien ? await arrondissementFige(db, p, sien.id) : false,
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD"]);
    const db = user.db as PrismaClient;

    const { annee, trimestre, apercu, arrondissement: demande } = (await req.json()) as {
      annee: number;
      trimestre: number;
      apercu?: boolean;
      arrondissement?: string;
    };
    const arrondissement = await arrondissementDemande(user, db, demande ?? null);

    const p = trimestrielle(annee, trimestre);
    const sien = await db.arrondissement.findFirst({
      where: { nom: arrondissement },
      select: { id: true },
    });
    // Le circuit : la version DÉFINITIVE du rapport d'un arrondissement est
    // celle que son DA a transmise au DD, après relecture.
    const transmis = await arrondissementFige(db, p, sien!.id);
    if (!apercu && !transmis) {
      return NextResponse.json(
        { message: "La version définitive est celle que le DA a transmise au DD. Transmettez d'abord le rapport, ou produisez un aperçu." },
        { status: 409 }
      );
    }
    const { buffer, nomFichier, etat, rubriquesAlimentees, valeursConsolidees } =
      await genererRapportCanevas(db, p, {
        autoriserIncomplet: Boolean(apercu),
        arrondissement,
        circuitIncomplet: transmis ? undefined : "rapport non encore transmis au Délégué départemental",
      });

    // Comme pour le rapport départemental : seul le définitif est conservé.
    // Un brouillon n'est transmis à personne.
    const archive = etat.calculable && transmis
      ? await archiverRapportTrimestriel(db, p, {
          buffer, nomFichier, auteurId: user.id, arrondissementId: sien!.id,
        })
      : null;

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "GENERATION_RAPPORT_TRIMESTRIEL_ARRONDISSEMENT",
        entite: "PeriodeReporting",
        entiteId: `${annee}-T${trimestre}`,
        details: {
          periode: libelleCourt(p),
          arrondissement,
          brouillon: !etat.calculable || !transmis,
          moisAbsents: etat.moisAbsents,
          moisIncomplets: etat.moisIncomplets,
          rubriquesAlimentees,
          valeursConsolidees,
          version: archive?.version ?? null,
          identiqueAuPrecedent: archive?.identiqueAuPrecedent ?? null,
        },
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (e) {
    if (e instanceof PeriodeNonCalculableError) {
      return NextResponse.json({ message: e.message, etat: e.etat }, { status: 409 });
    }
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

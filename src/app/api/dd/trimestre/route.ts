/**
 * Rapport trimestriel — état d'une période et génération du document (E9).
 *
 * Sous /api/dd : le middleware réserve déjà tout ce préfixe au Délégué
 * Départemental. La consolidation d'un trimestre engage le département entier ;
 * elle n'appartient ni au DA ni à l'agent de saisie.
 *
 *   GET  ?annee=2026&trimestre=3   état de la période, sans rien produire
 *   POST { annee, trimestre, apercu }   génère le .docx
 *
 * `apercu: true` autorise une période incomplète — le document produit porte
 * alors BROUILLON sur chaque page. Sans ce drapeau, une période incomplète est
 * refusée : un chiffre couvrant deux mois sur trois, présenté comme un
 * trimestre, est un faux.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle, libelleOfficiel, libelleCourt, memePeriodeAnneePrecedente } from "@/server/periodes/calendrier";
import { inspecterPeriode, PeriodeNonCalculableError } from "@/server/trimestre/agregation";
import { genererRapportCanevas, ControlesCroisesError } from "@/server/trimestre/rapportCanevas";
import { archiverRapportTrimestriel } from "@/server/trimestre/archivage";
import { etatCircuit, messageIncomplet, finaliserParLeDD, RefusCircuit } from "@/server/trimestre/circuit";
import { periodeTrimestrielle } from "@/server/trimestre/rubriques";
import { rassembler } from "@/server/trimestre/rapport-docx";
import type { PrismaClient } from "@prisma/client";

/** Les trimestres pour lesquels au moins un mois existe en base. */
async function trimestresDisponibles(db: PrismaClient) {
  const mois = await db.periodeReporting.findMany({
    where: { type: "MENSUEL" },
    select: { annee: true, mois: true },
    orderBy: [{ annee: "desc" }, { mois: "desc" }],
  });
  const vus = new Map<string, { annee: number; trimestre: number; moisPresents: number }>();
  for (const m of mois) {
    if (m.mois == null) continue;
    const t = Math.floor((m.mois - 1) / 3) + 1;
    const cle = `${m.annee}-${t}`;
    const e = vus.get(cle) ?? { annee: m.annee, trimestre: t, moisPresents: 0 };
    e.moisPresents++;
    vus.set(cle, e);
  }
  return Array.from(vus.values())
    .sort((a, b) => b.annee - a.annee || b.trimestre - a.trimestre)
    .map((t) => ({ ...t, libelle: libelleOfficiel(trimestrielle(t.annee, t.trimestre)), court: libelleCourt(trimestrielle(t.annee, t.trimestre)) }));
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db as PrismaClient;

    const url = new URL(req.url);
    // Attention : `Number(null)` vaut 0, et `Number.isInteger(0)` est vrai.
    // Convertir avant d'avoir vérifié la présence du paramètre ferait passer
    // une requête sans période pour une demande sur l'an 0.
    const anneeBrute = url.searchParams.get("annee");
    const trimestreBrut = url.searchParams.get("trimestre");

    const disponibles = await trimestresDisponibles(db);
    if (!anneeBrute || !trimestreBrut) {
      return NextResponse.json({ disponibles });
    }
    const annee = Number(anneeBrute);
    const trimestre = Number(trimestreBrut);
    if (!Number.isInteger(annee) || !Number.isInteger(trimestre) || trimestre < 1 || trimestre > 4) {
      return NextResponse.json({ message: "Période demandée invalide.", disponibles }, { status: 400 });
    }

    const p = trimestrielle(annee, trimestre);
    const etat = await inspecterPeriode(db, p);
    const etatN1 = await inspecterPeriode(db, memePeriodeAnneePrecedente(p));

    // Un aperçu des faits les plus notables, pour que le DD sache ce que le
    // document dira avant de le produire.
    let apercuFaits: { libelle: string; phrase: string; calcul: string }[] = [];
    if (etat.mois.some((m) => m.periodeId)) {
      const donnees = await rassembler(db, p, { autoriserIncomplet: true });
      apercuFaits = donnees.faits
        .filter((f) => f.type === "RUPTURE" || f.type === "EVOLUTION")
        .slice(0, 8)
        .map((f) => ({ libelle: f.libelle, phrase: f.phrase, calcul: f.calcul }));
    }

    return NextResponse.json({
      disponibles,
      periode: { annee, trimestre, libelle: etat.libelle, court: libelleCourt(p) },
      comparaison: { libelle: libelleOfficiel(memePeriodeAnneePrecedente(p)), disponible: etatN1.mois.some((m) => m.periodeId) },
      mois: etat.mois.map((m) => ({
        libelle: `${String(m.mois).padStart(2, "0")}/${m.annee}`,
        present: Boolean(m.periodeId),
        transmis: m.arrondissementsTransmis,
        complet: m.complet,
      })),
      calculable: etat.calculable,
      moisAbsents: etat.moisAbsents,
      moisIncomplets: etat.moisIncomplets,
      champsSansRegle: etat.champsSansRegle,
      apercuFaits,
      // Le circuit : six rapports transmis, quatre domaines validés.
      circuit: await etatCircuit(db, p).then((c) => ({ complet: c.complet, message: c.complet ? null : messageIncomplet(c) })),
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db as PrismaClient;

    const { annee, trimestre, apercu, exceptionnel, motif } = (await req.json()) as {
      annee: number;
      trimestre: number;
      apercu?: boolean;
      /** Le DD finalise lui-même ce qui reste du circuit (DA ou chef défaillant), motif à l'appui. */
      exceptionnel?: boolean;
      motif?: string;
    };

    const p = trimestrielle(annee, trimestre);
    // Le circuit de validation : la version DÉFINITIVE exige les six rapports
    // d'arrondissement transmis et les quatre domaines validés par leur chef.
    let circuit = await etatCircuit(db, p);
    // Exceptionnellement, le DD prend le relais : il franchit lui-même les
    // étapes restantes — marquées « par le DD », motif à l'appui — puis produit
    // le définitif. Comme « Valider en tant que DD » au mensuel.
    if (!apercu && !circuit.complet && exceptionnel) {
      try {
        const franchi = await finaliserParLeDD(db, user.transaction, await periodeTrimestrielle(db, p), p, motif ?? "", user.id);
        await db.auditLog.create({
          data: {
            userId: user.id,
            action: "CIRCUIT_TRIMESTRE_FINALISER",
            entite: "CircuitTrimestre",
            entiteId: `${annee}-T${trimestre}`,
            details: { ...franchi, motif, parLeDD: true },
          },
        });
      } catch (e) {
        if (e instanceof RefusCircuit) return NextResponse.json({ message: e.message }, { status: 409 });
        throw e;
      }
      circuit = await etatCircuit(db, p);
    }
    if (!apercu && !circuit.complet) {
      return NextResponse.json({ message: messageIncomplet(circuit), circuit }, { status: 409 });
    }
    // Le rendu suit le canevas : ce sont ses 78 tableaux qui sont dessinés, et
    // les valeurs consolidées viennent remplir les cases pour lesquelles une
    // liaison a été écrite. Voir src/server/trimestre/rapportCanevas.ts.
    const { buffer, nomFichier, etat, rubriquesAlimentees, valeursConsolidees } =
      await genererRapportCanevas(db, p, {
        autoriserIncomplet: Boolean(apercu),
        circuitIncomplet: circuit.complet ? undefined : "circuit de validation non achevé",
      });

    /*
     * Seul le rapport DÉFINITIF est conservé. Un brouillon se régénère dix fois
     * pendant la rédaction ; en garder chaque exemplaire remplirait la base de
     * documents que personne ne relira, sans rien apporter à la traçabilité —
     * un brouillon n'est transmis à personne. Sa production reste tracée dans
     * le journal d'activité.
     */
    const archive = etat.calculable && circuit.complet
      ? await archiverRapportTrimestriel(db, p, {
          buffer, nomFichier, auteurId: user.id, arrondissementId: null,
        })
      : null;

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "GENERATION_RAPPORT_TRIMESTRIEL",
        entite: "PeriodeReporting",
        entiteId: `${annee}-T${trimestre}`,
        details: {
          periode: libelleCourt(p),
          brouillon: !etat.calculable || !circuit.complet,
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
    // Un contrôle croisé du canevas a constaté une incohérence : ce n'est pas
    // une panne mais un refus motivé, et le Délégué doit lire quoi corriger.
    if (e instanceof ControlesCroisesError) {
      return NextResponse.json({ message: e.message }, { status: 409 });
    }
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

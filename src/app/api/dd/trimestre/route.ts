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
import { genererRapportTrimestriel } from "@/server/trimestre/rapport-docx";
import { rassembler } from "@/server/trimestre/rapport-docx";
import type { PrismaClient } from "@prisma/client";

/**
 * Le rendu .docx reproduit-il le canevas officiel ?
 *
 * NON à ce jour. Le premier générateur plaquait un format unique — trois
 * colonnes de mois, une colonne d'écart, une colonne de règle — sur un canevas
 * qui n'en a pas : il impose six colonnes d'arrondissement NOMMÉES, une colonne
 * TOTAL de la période, une colonne TOTAL de la même période l'an passé, et des
 * libellés de ligne fixes (CZV, DAEPIA, Centre de Contrôle de Pêche…). Une
 * seule de ses 81 tables porte une colonne « Écart ».
 *
 * Un document non conforme ne doit pas pouvoir quitter le SID : il partirait à
 * la DREPIA sous la signature du Délégué. La voie reste fermée tant que le rendu
 * n'est pas reconstruit sur docs/CANEVAS_TRIMESTRIEL.md, qui fait foi.
 *
 * Le moteur de consolidation et la base de faits ne sont PAS en cause : ils
 * restent exacts et continuent d'alimenter l'écran de préparation.
 */
const RENDU_CONFORME_AU_CANEVAS = false;

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

    const { annee, trimestre, apercu } = (await req.json()) as {
      annee: number;
      trimestre: number;
      apercu?: boolean;
    };

    if (!RENDU_CONFORME_AU_CANEVAS) {
      return NextResponse.json(
        {
          message:
            "La production du document trimestriel est suspendue : le rendu ne reproduit pas encore " +
            "le canevas officiel (colonnes et libellés de ligne imposés). Les chiffres consolidés et " +
            "les analyses restent consultables à l'écran.",
          conformiteCanevas: false,
        },
        { status: 503 }
      );
    }

    const p = trimestrielle(annee, trimestre);
    const { buffer, nomFichier, donnees } = await genererRapportTrimestriel(db, p, {
      autoriserIncomplet: Boolean(apercu),
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "GENERATION_RAPPORT_TRIMESTRIEL",
        entite: "PeriodeReporting",
        entiteId: `${annee}-T${trimestre}`,
        details: {
          periode: libelleCourt(p),
          brouillon: donnees.brouillon,
          moisAbsents: donnees.etat.moisAbsents,
          moisIncomplets: donnees.etat.moisIncomplets,
          faits: donnees.faits.length,
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

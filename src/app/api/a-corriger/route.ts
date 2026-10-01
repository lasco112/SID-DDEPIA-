/**
 * GET /api/a-corriger — ce que SEUL le serveur sait des points à corriger de
 * la personne connectée (décision du Délégué, 1er octobre 2026). Le reste —
 * saisies refusées, avertissements des grilles, analyses à revoir — est lu
 * sur l'appareil (lib/aCorriger.ts), pour que la liste existe aussi sans
 * réseau.
 *
 *  - DA et agent : les tableaux du mensuel encore « repris du mois
 *    précédent », un rapport mensuel renvoyé pour correction, le rapport
 *    trimestriel renvoyé ;
 *  - DD : les demandes de renvoi des DA en attente.
 *
 * Lecture seule.
 */
import { NextResponse } from "next/server";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle } from "@/server/periodes/calendrier";
import { etatCircuit } from "@/server/trimestre/circuit";
import { trimestreARapporter } from "@/lib/trimestreEchu";
import { verifierCompletudeDD } from "@/server/export/rapport-docx";
import type { PrismaClient } from "@prisma/client";

export interface MoisACorriger {
  periodeId: string;
  annee: number;
  mois: number;
  statut: string;
  motifRejet: string | null;
  /** Tableaux dont des valeurs reprises du mois précédent attendent confirmation. */
  aConfirmer: { code: string; numero: string; titre: string }[];
}

export interface DemandeDeRenvoi {
  periodeId: string;
  arrondissement: string;
  annee: number;
  mois: number;
  tableaux: string[];
  le: string;
}

/**
 * Un mois dont la date limite est passée et qui ne peut pas encore donner son
 * rapport départemental : qui n'a pas transmis, quelle section n'a pas validé.
 */
export interface MoisBloque {
  periodeId: string;
  annee: number;
  mois: number;
  /** Après la date limite, le DA ne peut plus transmettre sans déverrouillage. */
  verrouille: boolean;
  daManquants: string[];
  sectionsNonValidees: string[];
}

export interface ReponseACorriger {
  mensuel: MoisACorriger[];
  trimestreRenvoye: { annee: number; trimestre: number; motif: string | null } | null;
  demandes: DemandeDeRenvoi[];
  /** Phase 2 — ce qui empêche de produire le rapport départemental du mois. */
  production: MoisBloque[];
}

/**
 * Les mois en retard : date limite des DA passée, mois pas encore clôturé.
 * Avant la date limite, un rapport non transmis n'est pas une erreur.
 */
async function moisEnRetard(db: Awaited<ReturnType<typeof requireUser>>["db"]): Promise<MoisBloque[]> {
  const periodes = await db.periodeReporting.findMany({
    where: { type: "MENSUEL", statut: { not: "ARCHIVEE" }, dateLimiteDA: { lt: new Date() } },
    select: { id: true, annee: true, mois: true, statut: true },
    orderBy: [{ annee: "asc" }, { mois: "asc" }],
  });
  const sortie: MoisBloque[] = [];
  for (const p of periodes) {
    const c = await verifierCompletudeDD(db as PrismaClient, p.id);
    if (c.complet) continue;
    sortie.push({
      periodeId: p.id,
      annee: p.annee,
      mois: p.mois ?? 0,
      verrouille: p.statut === "VERROUILLEE_DA",
      daManquants: c.daManquants,
      sectionsNonValidees: c.sectionsNonValidees,
    });
  }
  return sortie;
}

export async function GET() {
  try {
    const user = await requireUser();
    const db = user.db;
    const reponse: ReponseACorriger = { mensuel: [], trimestreRenvoye: null, demandes: [], production: [] };

    // Les mois en retard, vus par chacun : le DD voit tout ; le DA, son
    // arrondissement ; le chef, sa section — et seulement quand les six
    // arrondissements ont transmis (avant, il n'a rien à valider).
    if (user.role === "DD" || user.role === "DA" || user.role.startsWith("CHEF_")) {
      const enRetard = await moisEnRetard(db);
      if (user.role === "DD") reponse.production = enRetard;
      else if (user.role === "DA" && user.arrondissementId) {
        const sien = (await db.arrondissement.findUnique({ where: { id: user.arrondissementId }, select: { nom: true } }))?.nom;
        reponse.production = enRetard
          .filter((m) => sien && m.daManquants.includes(sien))
          .map((m) => ({ ...m, daManquants: [sien!], sectionsNonValidees: [] }));
      } else if (user.sectionId) {
        const section = (await db.section.findUnique({ where: { id: user.sectionId }, select: { nom: true } }))?.nom;
        reponse.production = enRetard
          .filter((m) => section && m.daManquants.length === 0 && m.sectionsNonValidees.includes(section))
          .map((m) => ({ ...m, sectionsNonValidees: [section!] }));
      }
    }

    if ((user.role === "DA" || user.role === "AGENT_SAISIE") && user.arrondissementId) {
      const rapports = await db.rapportArrondissement.findMany({
        where: {
          arrondissementId: user.arrondissementId,
          statut: { in: ["EN_SAISIE", "REJETE"] },
          periode: { type: "MENSUEL", statut: { not: "ARCHIVEE" } },
        },
        include: { periode: { select: { annee: true, mois: true } } },
      });
      for (const r of rapports) {
        const [matrice, nominatif] = await Promise.all([
          db.saisieMatrice.findMany({
            where: { rapportId: r.id, reporte: true },
            select: { field: { select: { template: { select: { code: true, numero: true, titre: true, ordre: true } } } } },
          }),
          db.saisieNominative.findMany({
            where: { rapportId: r.id, reporte: true },
            select: { template: { select: { code: true, numero: true, titre: true, ordre: true } } },
          }),
        ]);
        const parCode = new Map<string, { code: string; numero: string; titre: string; ordre: number }>();
        for (const m of matrice) parCode.set(m.field.template.code, m.field.template);
        for (const n of nominatif) parCode.set(n.template.code, n.template);
        const aConfirmer = Array.from(parCode.values())
          .sort((a, b) => a.ordre - b.ordre)
          .map(({ code, numero, titre }) => ({ code, numero, titre }));
        if (aConfirmer.length === 0 && r.statut !== "REJETE") continue;
        reponse.mensuel.push({
          periodeId: r.periodeId,
          annee: r.periode.annee,
          mois: r.periode.mois ?? 0,
          statut: r.statut,
          motifRejet: r.motifRejet,
          aConfirmer,
        });
      }
      reponse.mensuel.sort((a, b) => a.annee - b.annee || a.mois - b.mois);

      const { annee, trimestre } = trimestreARapporter();
      const etat = await etatCircuit(db, trimestrielle(annee, trimestre));
      const sien = etat.arrondissements.find((a) => a.id === user.arrondissementId);
      if (sien?.statut === "RENVOYE") reponse.trimestreRenvoye = { annee, trimestre, motif: sien.motif };
    }

    if (user.role === "DD") {
      // Les rapports encore bloqués : transmis, ou dans un mois verrouillé sans déverrouillage.
      const transmis = await db.rapportArrondissement.findMany({
        where: {
          periode: { type: "MENSUEL", statut: { not: "ARCHIVEE" } },
          OR: [
            { statut: "SOUMIS" },
            { statut: { in: ["EN_SAISIE", "REJETE"] }, deverrouillePar: null, periode: { statut: "VERROUILLEE_DA" } },
          ],
        },
        include: { periode: { select: { annee: true, mois: true } }, arrondissement: { select: { nom: true } } },
      });
      if (transmis.length) {
        const journal = await db.auditLog.findMany({
          where: { action: "DEMANDE_RENVOI", entiteId: { in: transmis.map((r) => r.id) } },
          orderBy: { createdAt: "desc" },
          select: { entiteId: true, createdAt: true, details: true },
        });
        const vus = new Set<string>();
        for (const d of journal) {
          const r = transmis.find((x) => x.id === d.entiteId);
          if (!r || vus.has(r.id) || (r.statut === "SOUMIS" && r.dateSoumission && d.createdAt < r.dateSoumission)) continue;
          vus.add(r.id);
          const tableaux = (d.details as { tableaux?: unknown } | null)?.tableaux;
          reponse.demandes.push({
            periodeId: r.periodeId,
            arrondissement: r.arrondissement.nom,
            annee: r.periode.annee,
            mois: r.periode.mois ?? 0,
            tableaux: Array.isArray(tableaux) ? tableaux.filter((t): t is string => typeof t === "string") : [],
            le: d.createdAt.toISOString(),
          });
        }
      }
    }

    return NextResponse.json(reponse);
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

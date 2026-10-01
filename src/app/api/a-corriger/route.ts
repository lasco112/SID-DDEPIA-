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

export interface ReponseACorriger {
  mensuel: MoisACorriger[];
  trimestreRenvoye: { annee: number; trimestre: number; motif: string | null } | null;
  demandes: DemandeDeRenvoi[];
}

export async function GET() {
  try {
    const user = await requireUser();
    const db = user.db;
    const reponse: ReponseACorriger = { mensuel: [], trimestreRenvoye: null, demandes: [] };

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

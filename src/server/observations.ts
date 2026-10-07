/**
 * Les OBSERVATIONS d'un chef de section (ou du DD) sur une donnée précise du
 * rapport mensuel d'un arrondissement (demande du Délégué, 7 octobre 2026 :
 * « l'observation doit être claire, genre le chef de section dit que le nombre
 * d'étangs n'est pas correct », et « corriger » doit mener à la donnée).
 *
 * Plutôt que de corriger lui-même, le chef SIGNALE : la case, la valeur vue,
 * ce qui ne va pas. Le DA la retrouve dans « À corriger », menée droit à la
 * case ; il corrige, ou répond que le chiffre est juste. Le chef voit la
 * réponse.
 *
 * Rangées dans le journal (AuditLog) — action OBSERVATION, OBSERVATION_REPONSE,
 * OBSERVATION_CLOSE — : aucune table nouvelle, aucune migration.
 *
 * Une observation est RÉGLÉE quand :
 *  - la case a été renvoyée par le DA après l'observation (il l'a corrigée ou
 *    retapée) ;
 *  - ou un chef / le DD l'a corrigée lui-même après coup ;
 *  - ou le DA a répondu ; le chef la clôt alors en lisant la réponse.
 */
import type { PrismaClient } from "@prisma/client";

export interface DetailsObservation {
  famille: "MATRICE" | "NOMINATIF" | "EVENEMENT";
  saisieId: string;
  templateCode: string;
  numero: string;
  titre: string;
  fieldCode: string | null;
  etablissementId: string | null;
  /** Ligne d'événement visée (son identifiant d'appareil). */
  clientId: string | null;
  /** « Nombre d'étangs », « Ferme X — Poulets de chair ». */
  libelle: string;
  /** La valeur vue par le chef au moment de l'observation. */
  valeur: string;
  texte: string;
  auteurNom: string;
  auteurRole: string;
}

export interface Observation extends DetailsObservation {
  id: string;
  le: string;
  rapportId: string;
  arrondissement: string;
  periodeId: string;
  annee: number;
  mois: number;
  auteurId: string | null;
  reponse: { texte: string; le: string; par: string } | null;
  /** La case a changé depuis (corrigée par le DA, ou par un chef). */
  corrigee: boolean;
  close: boolean;
}

/** Les observations de ces rapports, avec leur état. */
export async function observationsDes(db: PrismaClient, rapportIds: string[]): Promise<Observation[]> {
  if (rapportIds.length === 0) return [];
  const [obs, rapports] = await Promise.all([
    db.auditLog.findMany({
      where: { action: "OBSERVATION", entite: "RapportArrondissement", entiteId: { in: rapportIds } },
      orderBy: { createdAt: "asc" },
      select: { id: true, createdAt: true, entiteId: true, details: true, userId: true },
    }),
    db.rapportArrondissement.findMany({
      where: { id: { in: rapportIds } },
      select: { id: true, periodeId: true, arrondissement: { select: { nom: true } }, periode: { select: { annee: true, mois: true } } },
    }),
  ]);
  if (obs.length === 0) return [];
  const ids = obs.map((o) => o.id);
  const suites = await db.auditLog.findMany({
    where: { action: { in: ["OBSERVATION_REPONSE", "OBSERVATION_CLOSE"] }, entite: "Observation", entiteId: { in: ids } },
    orderBy: { createdAt: "desc" },
    select: { action: true, entiteId: true, createdAt: true, details: true, user: { select: { nom: true } } },
  });

  const sortie: Observation[] = [];
  for (const o of obs) {
    const d = o.details as unknown as DetailsObservation;
    const r = rapports.find((x) => x.id === o.entiteId);
    if (!d || !r) continue;
    const reponse = suites.find((s) => s.entiteId === o.id && s.action === "OBSERVATION_REPONSE");
    const close = suites.some((s) => s.entiteId === o.id && s.action === "OBSERVATION_CLOSE");
    sortie.push({
      ...d,
      id: o.id,
      le: o.createdAt.toISOString(),
      rapportId: r.id,
      arrondissement: r.arrondissement.nom,
      periodeId: r.periodeId,
      annee: r.periode.annee,
      mois: r.periode.mois ?? 0,
      auteurId: o.userId,
      reponse: reponse
        ? { texte: String((reponse.details as { texte?: unknown } | null)?.texte ?? ""), le: reponse.createdAt.toISOString(), par: reponse.user?.nom ?? "le DA" }
        : null,
      corrigee: await caseModifieeDepuis(db, d, o.createdAt),
      close,
    });
  }
  return sortie;
}

/** La case a-t-elle été renvoyée par l'arrondissement, ou corrigée, après l'observation ? */
async function caseModifieeDepuis(db: PrismaClient, d: DetailsObservation, depuis: Date): Promise<boolean> {
  if (d.famille === "MATRICE") {
    const s = await db.saisieMatrice.findUnique({ where: { id: d.saisieId }, select: { syncedAt: true, modifieLe: true } });
    if (!s) return true; // la case n'existe plus : plus rien à observer
    if ((s.syncedAt && s.syncedAt > depuis) || (s.modifieLe && s.modifieLe > depuis)) return true;
    return (await db.correction.count({ where: { saisieMatriceId: d.saisieId, createdAt: { gt: depuis } } })) > 0;
  }
  if (d.famille === "NOMINATIF") {
    const s = await db.saisieNominative.findUnique({ where: { id: d.saisieId }, select: { syncedAt: true, modifieLe: true } });
    if (!s) return true;
    if ((s.syncedAt && s.syncedAt > depuis) || (s.modifieLe && s.modifieLe > depuis)) return true;
    return (await db.correction.count({ where: { saisieNominativeId: d.saisieId, createdAt: { gt: depuis } } })) > 0;
  }
  const s = await db.saisieEvenement.findUnique({ where: { id: d.saisieId }, select: { syncedAt: true, modifieLe: true } });
  if (!s) return true;
  if ((s.syncedAt && s.syncedAt > depuis) || (s.modifieLe && s.modifieLe > depuis)) return true;
  return (await db.correction.count({ where: { saisieEvenementId: d.saisieId, createdAt: { gt: depuis } } })) > 0;
}

/** Encore à traiter par le DA : ni corrigée, ni répondue, ni close. */
export const aTraiterParLeDA = (o: Observation) => !o.corrigee && !o.reponse && !o.close;

/** À relire par l'auteur : le DA a répondu (ou corrigé), et l'auteur ne l'a pas encore close. */
export const aRelireParLAuteur = (o: Observation) => !o.close && (Boolean(o.reponse) || o.corrigee);

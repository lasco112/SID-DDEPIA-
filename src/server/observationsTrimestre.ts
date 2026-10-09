/**
 * Les OBSERVATIONS sur le rapport TRIMESTRIEL (demande du Délégué, 7 octobre
 * 2026 — suite des observations du mensuel, server/observations.ts) :
 *
 *  - une CASE d'un tableau trimestriel, signalée par le DD ou le chef BAC à
 *    l'arrondissement qu'elle concerne ;
 *  - une ANALYSE ou un TEXTE du rapport départemental, signalés par le DD au
 *    chef de section qui les rédige.
 *
 * Même vie que celles du mensuel : à traiter par le destinataire tant qu'il
 * n'a ni corrigé ni répondu ; à relire par l'auteur ensuite ; réglées une fois
 * closes. Rangées au journal (action OBSERVATION_T ; réponses et clôtures
 * partagées avec le mensuel) : aucune migration.
 */
import type { PrismaClient } from "@prisma/client";

export type CibleTrimestre =
  | { type: "case"; numero: number; titreTableau: string; ligne: string; colonne: string; libelle: string; valeur: string }
  | { type: "analyse"; numero: number; titreTableau: string; libelle: string }
  | { type: "texte"; zone: string; libelle: string };

export interface DetailsObservationT {
  annee: number;
  trimestre: number;
  cible: CibleTrimestre;
  /** À qui elle s'adresse : un arrondissement, ou un chef de section. */
  destinataire: { arrondissementId: string; arrondissement: string } | { chef: string };
  texte: string;
  auteurNom: string;
  auteurRole: string;
}

export interface ObservationT extends DetailsObservationT {
  id: string;
  le: string;
  auteurId: string | null;
  reponse: { texte: string; le: string; par: string } | null;
  corrigee: boolean;
  close: boolean;
}

/** Les observations du trimestre, filtrées par le journal, avec leur état. */
export async function observationsTrimestre(
  db: PrismaClient,
  filtre: { auteurId?: string; arrondissementId?: string; chef?: string }
): Promise<ObservationT[]> {
  const lignes = await db.auditLog.findMany({
    where: { action: "OBSERVATION_T", ...(filtre.auteurId ? { userId: filtre.auteurId } : {}) },
    // Les plus récentes d'abord : au-delà de 500, ce sont les anciennes qui tombent.
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, details: true, userId: true },
    take: 500,
  });
  const retenues = lignes.reverse().filter((l) => {
    const d = l.details as unknown as DetailsObservationT | null;
    if (!d) return false;
    if (filtre.arrondissementId) return "arrondissementId" in d.destinataire && d.destinataire.arrondissementId === filtre.arrondissementId;
    if (filtre.chef) return "chef" in d.destinataire && d.destinataire.chef === filtre.chef;
    return true;
  });
  if (retenues.length === 0) return [];
  const suites = await db.auditLog.findMany({
    where: { action: { in: ["OBSERVATION_REPONSE", "OBSERVATION_CLOSE"] }, entite: "Observation", entiteId: { in: retenues.map((r) => r.id) } },
    orderBy: { createdAt: "desc" },
    select: { action: true, entiteId: true, createdAt: true, details: true, user: { select: { nom: true } } },
  });
  const sortie: ObservationT[] = [];
  for (const l of retenues) {
    const d = l.details as unknown as DetailsObservationT;
    const reponse = suites.find((s) => s.entiteId === l.id && s.action === "OBSERVATION_REPONSE");
    sortie.push({
      ...d,
      id: l.id,
      le: l.createdAt.toISOString(),
      auteurId: l.userId,
      reponse: reponse
        ? { texte: String((reponse.details as { texte?: unknown } | null)?.texte ?? ""), le: reponse.createdAt.toISOString(), par: reponse.user?.nom ?? "" }
        : null,
      corrigee: await modifieeDepuis(db, d, l.createdAt),
      close: suites.some((s) => s.entiteId === l.id && s.action === "OBSERVATION_CLOSE"),
    });
  }
  return sortie;
}

/** La case, l'analyse ou le texte a-t-il été modifié après l'observation ? */
async function modifieeDepuis(db: PrismaClient, d: DetailsObservationT, depuis: Date): Promise<boolean> {
  const periode = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: d.annee, trimestre: d.trimestre },
    select: { id: true },
  });
  if (!periode) return false;
  const c = d.cible;
  if (c.type === "case") {
    const s = await db.saisieCanevas.findFirst({
      where: { periodeId: periode.id, numeroTableau: c.numero, ligne: c.ligne, colonne: c.colonne, portee: "" },
      select: { updatedAt: true },
    });
    return Boolean(s && s.updatedAt > depuis);
  }
  if (c.type === "analyse") {
    const a = await db.analyseCanevas.findFirst({
      where: { periodeId: periode.id, numeroTableau: c.numero, portee: "" },
      select: { updatedAt: true },
    });
    return Boolean(a && a.updatedAt > depuis);
  }
  const r = await db.rubriqueNarrative.findFirst({
    where: { periodeId: periode.id, arrondissementId: null, cle: c.zone },
    select: { updatedAt: true },
  });
  return Boolean(r && r.updatedAt > depuis);
}

export const aTraiterT = (o: ObservationT) => !o.corrigee && !o.reponse && !o.close;
export const aRelireT = (o: ObservationT) => !o.close && (Boolean(o.reponse) || o.corrigee);

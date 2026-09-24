/**
 * Le circuit de validation du rapport trimestriel (décision du Délégué,
 * 24 septembre 2026).
 *
 *   AGENT DE SAISIE  prépare le rapport de son arrondissement : saisie
 *                    trimestrielle, analyses, textes.
 *   DA               relit l'ensemble, corrige s'il le juge utile, puis
 *                    TRANSMET au DD. Le rapport de l'arrondissement est alors
 *                    figé — pour l'agent comme pour le DA.
 *   CHEF DE SECTION  une fois les six arrondissements transmis, VALIDE son
 *                    domaine du rapport départemental (analyses et textes).
 *                    Son domaine est alors figé. Il peut RENVOYER le rapport
 *                    d'un arrondissement à son DA, motif à l'appui.
 *   DD               relit le document final et n'intervient que s'il le veut.
 *                    Il ne le produit en version DÉFINITIVE que lorsque les six
 *                    arrondissements ont transmis et les quatre sections validé.
 *
 * LE DD PREND LE RELAIS (décision du Délégué, 24 septembre 2026, comme
 * « Valider en tant que DD » au mensuel) : face à un DA ou un chef défaillant,
 * il franchit l'étape lui-même — transmettre un arrondissement, valider un
 * domaine, ou tout finaliser d'un coup. Toujours avec un motif ; l'étape est
 * marquée « par le DD » à l'écran et au journal, et l'intéressé est prévenu.
 *
 * Un renvoi rouvre le rapport de l'arrondissement ET annule les validations
 * de section : les chiffres départementaux vont changer, ce que les chefs ont
 * validé ne tient plus.
 *
 * Même logique que le mensuel (soumission du DA, validation par section,
 * validation du DD), dans une table à part pour ne rien changer au mensuel.
 */
import type { PrismaClient } from "@prisma/client";
import type { Transactionnelle } from "@/lib/dbCloisonne";
import type { Periode } from "../periodes/calendrier";
import { listerArrondissements } from "@/lib/arrondissements";
import type { ChefDeSection } from "./canevas/sections";
import { notifierEvenement } from "@/server/notifications/evenements";

export const SECTIONS_CIRCUIT: { code: string; chef: ChefDeSection; nom: string }[] = [
  { code: "BAC", chef: "CHEF_BAC", nom: "Bureau des Affaires Communes" },
  { code: "PSA", chef: "CHEF_PSA", nom: "Productions et Statistiques Animales" },
  { code: "SPAIH", chef: "CHEF_SPAIH", nom: "Pêches, Aquaculture et Industries Halieutiques" },
  { code: "SSV", chef: "CHEF_SSV", nom: "Services Vétérinaires" },
];

export const codeSection = (chef: string) => SECTIONS_CIRCUIT.find((s) => s.chef === chef)?.code ?? null;

export type StatutArrondissement = "EN_PREPARATION" | "TRANSMIS" | "RENVOYE";
export type StatutSection = "EN_ATTENTE" | "A_VALIDER" | "VALIDE";

export interface EtatCircuit {
  periodeId: string | null;
  arrondissements: {
    id: string;
    nom: string;
    statut: StatutArrondissement;
    date: string | null;
    auteur: string | null;
    motif: string | null;
    /** Transmis par le DD, à la place du DA. */
    parLeDD: boolean;
  }[];
  sections: {
    code: string;
    chef: ChefDeSection;
    nom: string;
    statut: StatutSection;
    date: string | null;
    auteur: string | null;
    /** Validé par le DD, à la place du chef — et pourquoi. */
    parLeDD: boolean;
    motif: string | null;
  }[];
  tousTransmis: boolean;
  /** Six arrondissements transmis et quatre sections validées : le DD peut produire la version définitive. */
  complet: boolean;
}

async function periodeIdDe(db: PrismaClient, periode: Periode): Promise<string | null> {
  const p = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: periode.annee, trimestre: periode.rang },
    select: { id: true },
  });
  return p?.id ?? null;
}

export async function etatCircuit(db: PrismaClient, periode: Periode): Promise<EtatCircuit> {
  const periodeId = await periodeIdDe(db, periode);
  const lignes = periodeId
    ? await db.circuitTrimestre.findMany({
        where: { periodeId },
        select: { niveau: true, cle: true, statut: true, motif: true, parLeDD: true, date: true, auteur: { select: { nom: true } } },
      })
    : [];
  const ligne = (niveau: string, cle: string) => lignes.find((l) => l.niveau === niveau && l.cle === cle);

  const arrondissements = (await listerArrondissements(db)).map((a) => {
    const l = ligne("ARRONDISSEMENT", a.id);
    return {
      id: a.id,
      nom: a.nom,
      statut: (l?.statut ?? "EN_PREPARATION") as StatutArrondissement,
      date: l ? l.date.toISOString() : null,
      auteur: l?.auteur?.nom ?? null,
      motif: l?.statut === "RENVOYE" || l?.parLeDD ? l.motif : null,
      parLeDD: Boolean(l?.parLeDD),
    };
  });
  const tousTransmis = arrondissements.length > 0 && arrondissements.every((a) => a.statut === "TRANSMIS");
  const sections = SECTIONS_CIRCUIT.map((s) => {
    const l = ligne("SECTION", s.code);
    const statut: StatutSection = l?.statut === "VALIDE" ? "VALIDE" : tousTransmis ? "A_VALIDER" : "EN_ATTENTE";
    return {
      ...s,
      statut,
      date: l ? l.date.toISOString() : null,
      auteur: l?.auteur?.nom ?? null,
      parLeDD: Boolean(l?.parLeDD),
      motif: l?.parLeDD ? l.motif : null,
    };
  });
  return {
    periodeId,
    arrondissements,
    sections,
    tousTransmis,
    complet: tousTransmis && sections.every((s) => s.statut === "VALIDE"),
  };
}

/** Le rapport de cet arrondissement est-il figé (transmis au DD) ? */
export async function arrondissementFige(db: PrismaClient, periode: Periode, arrondissementId: string): Promise<boolean> {
  const periodeId = await periodeIdDe(db, periode);
  if (!periodeId) return false;
  const l = await db.circuitTrimestre.findFirst({
    where: { periodeId, niveau: "ARRONDISSEMENT", cle: arrondissementId },
    select: { statut: true },
  });
  return l?.statut === "TRANSMIS";
}

/** Le domaine de ce chef est-il figé (validé) ? */
export async function sectionFigee(db: PrismaClient, periode: Periode, chef: string): Promise<boolean> {
  const code = codeSection(chef);
  const periodeId = await periodeIdDe(db, periode);
  if (!code || !periodeId) return false;
  const l = await db.circuitTrimestre.findFirst({ where: { periodeId, niveau: "SECTION", cle: code }, select: { statut: true } });
  return l?.statut === "VALIDE";
}

export const MESSAGE_ARRONDISSEMENT_FIGE =
  "Le rapport trimestriel de votre arrondissement a été transmis au Délégué départemental : il n'est plus modifiable. " +
  "Si une correction est nécessaire, demandez-lui de vous le renvoyer.";
export const MESSAGE_SECTION_FIGEE =
  "Vous avez validé votre domaine du rapport trimestriel : il n'est plus modifiable. Annulez d'abord votre validation.";

/**
 * Le motif pour lequel ce profil ne peut plus écrire dans le rapport de ce
 * périmètre, ou null. `arrondissementId` : la portée de l'écriture (celle de
 * l'agent ou du DA) ; `chef` : le domaine d'un chef de section. Le DD n'est
 * jamais bloqué : il garde la main sur le rapport, comme au mensuel.
 */
export async function motifDeVerrou(
  db: PrismaClient,
  periode: Periode,
  profil: { role: string; arrondissementId?: string | null }
): Promise<string | null> {
  if ((profil.role === "DA" || profil.role === "AGENT_SAISIE") && profil.arrondissementId) {
    return (await arrondissementFige(db, periode, profil.arrondissementId)) ? MESSAGE_ARRONDISSEMENT_FIGE : null;
  }
  if (profil.role.startsWith("CHEF_")) {
    return (await sectionFigee(db, periode, profil.role)) ? MESSAGE_SECTION_FIGEE : null;
  }
  return null;
}

async function ecrire(
  transaction: Transactionnelle,
  periodeId: string,
  niveau: "ARRONDISSEMENT" | "SECTION",
  cle: string,
  statut: string,
  auteurId: string,
  motif: string | null = null,
  parLeDD = false
) {
  await transaction(async (tx) => {
    const l = await tx.circuitTrimestre.findFirst({ where: { periodeId, niveau, cle }, select: { id: true } });
    const data = { statut, motif, auteurId, date: new Date(), parLeDD };
    if (l) await tx.circuitTrimestre.update({ where: { id: l.id }, data });
    else await tx.circuitTrimestre.create({ data: { periodeId, niveau, cle, ...data } });
  });
}

export class RefusCircuit extends Error {}

/** Le DA transmet le rapport de son arrondissement au DD. */
export async function transmettre(db: PrismaClient, transaction: Transactionnelle, periodeId: string, periode: Periode, arrondissementId: string, auteurId: string) {
  if (await arrondissementFige(db, periode, arrondissementId)) throw new RefusCircuit("Ce rapport est déjà transmis.");
  await ecrire(transaction, periodeId, "ARRONDISSEMENT", arrondissementId, "TRANSMIS", auteurId);
}

/**
 * Renvoie le rapport d'un arrondissement à son DA, pour correction. Les
 * validations de section tombent : les chiffres du département vont changer.
 */
export async function renvoyer(
  db: PrismaClient,
  transaction: Transactionnelle,
  periodeId: string,
  periode: Periode,
  arrondissementId: string,
  motif: string,
  auteurId: string
) {
  if (!motif.trim()) throw new RefusCircuit("Indiquez le motif du renvoi : le DA doit savoir quoi corriger.");
  if (!(await arrondissementFige(db, periode, arrondissementId))) throw new RefusCircuit("Ce rapport n'a pas été transmis : il n'y a rien à renvoyer.");
  await ecrire(transaction, periodeId, "ARRONDISSEMENT", arrondissementId, "RENVOYE", auteurId, motif.trim());
  await transaction(async (tx) => {
    await tx.circuitTrimestre.deleteMany({ where: { periodeId, niveau: "SECTION" } });
  });
}

/** Le chef de section valide son domaine — une fois les six arrondissements transmis. */
export async function validerSection(db: PrismaClient, transaction: Transactionnelle, periodeId: string, periode: Periode, chef: string, auteurId: string) {
  const code = codeSection(chef);
  if (!code) throw new RefusCircuit("Seul un chef de section valide un domaine.");
  const etat = await etatCircuit(db, periode);
  if (!etat.tousTransmis) {
    const manquants = etat.arrondissements.filter((a) => a.statut !== "TRANSMIS").map((a) => a.nom);
    throw new RefusCircuit(
      `Tous les arrondissements n'ont pas transmis leur rapport (${manquants.join(", ")}) : les chiffres du département ne sont pas encore définitifs.`
    );
  }
  await ecrire(transaction, periodeId, "SECTION", code, "VALIDE", auteurId);
}

/** Le chef de section — ou le DD — annule la validation d'un domaine. */
export async function annulerValidationSection(transaction: Transactionnelle, periodeId: string, code: string) {
  await transaction(async (tx) => {
    await tx.circuitTrimestre.deleteMany({ where: { periodeId, niveau: "SECTION", cle: code } });
  });
}

/** Ce qui manque pour la version définitive, en clair. */
export function messageIncomplet(etat: EtatCircuit): string {
  const manquants = etat.arrondissements.filter((a) => a.statut !== "TRANSMIS").map((a) => a.nom);
  const sections = etat.sections.filter((s) => s.statut !== "VALIDE").map((s) => s.code);
  const parties = [
    manquants.length ? `rapport non transmis : ${manquants.join(", ")}` : "",
    sections.length ? `domaine non validé : ${sections.join(", ")}` : "",
  ].filter(Boolean);
  return `La version définitive n'est pas encore possible (${parties.join(" ; ")}). Vous pouvez produire un aperçu, ou — exceptionnellement — finaliser le rapport en tant que DD.`;
}

// ------------------------------------------------------------------ le DD prend le relais

function motifExige(motif: string): string {
  const m = motif.trim();
  if (!m) throw new RefusCircuit("Indiquez le motif : l'étape franchie à la place d'un DA ou d'un chef doit être justifiée.");
  return m;
}

/** Le DD transmet le rapport d'un arrondissement à la place de son DA. */
export async function transmettreParLeDD(
  db: PrismaClient,
  transaction: Transactionnelle,
  periodeId: string,
  periode: Periode,
  arrondissementId: string,
  motif: string,
  auteurId: string
) {
  const m = motifExige(motif);
  if (await arrondissementFige(db, periode, arrondissementId)) throw new RefusCircuit("Ce rapport est déjà transmis.");
  await ecrire(transaction, periodeId, "ARRONDISSEMENT", arrondissementId, "TRANSMIS", auteurId, m, true);
  await notifierEvenement(db, { arrondissementId, saufUserId: auteurId }, {
    declencheur: "TRANSMISSION_TRIMESTRE_PAR_DD",
    message: `Le Délégué départemental a transmis le rapport trimestriel de votre arrondissement à votre place — motif : ${m}.`,
    lien: "/trimestre/circuit",
  });
}

/** Le DD valide un domaine à la place de son chef de section. */
export async function validerSectionParLeDD(
  db: PrismaClient,
  transaction: Transactionnelle,
  periodeId: string,
  code: string,
  motif: string,
  auteurId: string
) {
  const m = motifExige(motif);
  if (!SECTIONS_CIRCUIT.some((s) => s.code === code)) throw new RefusCircuit("Domaine inconnu.");
  await ecrire(transaction, periodeId, "SECTION", code, "VALIDE", auteurId, m, true);
  const section = await db.section.findFirst({ where: { code }, select: { id: true } });
  if (section) {
    await notifierEvenement(db, { sectionId: section.id, saufUserId: auteurId }, {
      declencheur: "VALIDATION_TRIMESTRE_PAR_DD",
      message: `Le Délégué départemental a validé votre domaine du rapport trimestriel à votre place — motif : ${m}.`,
      lien: "/trimestre/circuit",
    });
  }
}

/**
 * Le DD finalise le rapport d'un coup : il transmet les arrondissements qui ne
 * l'ont pas fait et valide les domaines restants, avec un seul motif. Rend ce
 * qu'il a franchi, pour le journal.
 */
export async function finaliserParLeDD(
  db: PrismaClient,
  transaction: Transactionnelle,
  periodeId: string,
  periode: Periode,
  motif: string,
  auteurId: string
): Promise<{ arrondissements: string[]; sections: string[] }> {
  const m = motifExige(motif);
  const etat = await etatCircuit(db, periode);
  const arrondissements: string[] = [];
  const sections: string[] = [];
  for (const a of etat.arrondissements.filter((x) => x.statut !== "TRANSMIS")) {
    await transmettreParLeDD(db, transaction, periodeId, periode, a.id, m, auteurId);
    arrondissements.push(a.nom);
  }
  for (const s of etat.sections.filter((x) => x.statut !== "VALIDE")) {
    await validerSectionParLeDD(db, transaction, periodeId, s.code, m, auteurId);
    sections.push(s.code);
  }
  return { arrondissements, sections };
}

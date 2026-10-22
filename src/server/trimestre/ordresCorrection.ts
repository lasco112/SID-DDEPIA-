/**
 * LA RÉVISION DES TABLEAUX par les chefs de section — un processus encadré,
 * ouvert par le DD (décisions du Délégué, 20 et 21 octobre 2026) :
 *
 *  1. Les DA DÉPOSENT leur rapport (circuit.ts). Avant, aucun chef ne touche
 *     aux cases des arrondissements : il relit et signale.
 *  2. Le DD OUVRE LA RÉVISION — section par section, ou pour toutes d'un coup —
 *     de lui-même, ou à la DEMANDE d'un chef, qu'il accepte ou refuse. Jamais
 *     avant le dépôt des rapports de TOUS les DA. Il choisit le MODE (22
 *     octobre 2026) :
 *       - RELECTURE : le chef relit et REJETTE au DA, motif à l'appui — c'est
 *         le DA qui corrige ;
 *       - CORRECTION DIRECTE : quand le temps presse et qu'un renvoi au DA en
 *         ferait perdre, le chef corrige lui-même.
 *     Il peut passer de l'un à l'autre en cours de route.
 *  3. En correction directe, le chef corrige dans les tableaux de SA section,
 *     pour tous les arrondissements : cases remplies ou vides, listes des DA,
 *     et cases grises des listes du mensuel et de la pisciculture
 *     (corrigerCase.ts). Chaque changement est au journal.
 *  4. La révision se FERME quand le chef valide sa section, ou quand le DD la
 *     ferme. Chaque DA reçoit alors le bilan de ce qui a changé chez lui.
 *
 * Le chef BAC n'est pas concerné : il complète et corrige librement les
 * tableaux du BAC.
 *
 * Ouvrir la révision FAIT TOMBER la validation de la section : on ne finalise
 * pas sur des chiffres en cours de révision.
 *
 * L'état se lit dans le journal (ouverture, fermeture, demande, refus) : chaque
 * décision y reste, avec son auteur, sa date et son motif — sans table nouvelle.
 * Les noms d'actions (« ORDRE_CORRECTION_CHEF »…) datent de la première version.
 */
import type { PrismaClient, Role } from "@prisma/client";
import type { Transactionnelle } from "@/lib/dbCloisonne";
import type { Periode } from "../periodes/calendrier";
import { libelleCourt } from "../periodes/calendrier";
import { SECTIONS_CIRCUIT, RefusCircuit, annulerValidationSection, etatCircuit } from "./circuit";
import { notifierEvenement } from "@/server/notifications/evenements";
import { listerArrondissements, graphieCanevas } from "@/lib/arrondissements";

/** L'ouverture de la révision d'une section. */
export const ACTION_ORDRE = "ORDRE_CORRECTION_CHEF";
/** Les chefs dont la révision des tableaux des arrondissements s'ouvre par le DD. */
export const CHEFS_SOUS_ORDRE = ["CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"];
/** La fermeture de la révision d'une section. */
export const ACTION_REVOCATION = "REVOCATION_ORDRE_CORRECTION_CHEF";
/** La demande d'ouverture, par le chef. */
export const ACTION_DEMANDE = "DEMANDE_ORDRE_CORRECTION";
/** Le refus de la demande, par le DD. */
export const ACTION_REFUS = "REFUS_DEMANDE_ORDRE_CORRECTION";

/** Relecture (le chef rejette au DA) ou correction directe (le chef corrige). */
export type ModeRevision = "relecture" | "correction";
export const estModeRevision = (m: unknown): m is ModeRevision => m === "relecture" || m === "correction";
export const LIBELLE_MODE: Record<ModeRevision, string> = { relecture: "relecture", correction: "correction directe" };

export interface OrdreCorrection {
  /** « PSA ». */
  section: string;
  /** « CHEF_PSA ». */
  chef: string;
  motif: string;
  /** Le dernier changement (ouverture ou changement de mode). */
  le: string;
  /** L'ouverture de la révision en cours : le bilan part de là. */
  ouverteLe: string;
  mode: ModeRevision;
  auteur: string | null;
}

const cleTrimestre = (p: Periode) => `${p.annee}-${p.rang}`;
const sectionDe = (code: string) => SECTIONS_CIRCUIT.find((x) => x.code === code);

async function journal(db: PrismaClient, periode: Periode, actions: string[]) {
  return db.auditLog.findMany({
    where: { action: { in: actions }, entite: "Trimestre", entiteId: cleTrimestre(periode) },
    orderBy: { createdAt: "asc" },
    select: { action: true, details: true, createdAt: true, user: { select: { nom: true, username: true } } },
  });
}

/** Les révisions OUVERTES pour ce trimestre, par rôle de chef. */
export async function ordresEnCours(db: PrismaClient, periode: Periode): Promise<Map<string, OrdreCorrection>> {
  const ordres = new Map<string, OrdreCorrection>();
  for (const l of await journal(db, periode, [ACTION_ORDRE, ACTION_REVOCATION])) {
    const d = l.details as { chef?: string; section?: string; motif?: string; mode?: string } | null;
    if (!d?.chef) continue;
    if (l.action === ACTION_REVOCATION) {
      ordres.delete(d.chef);
      continue;
    }
    const avant = ordres.get(d.chef);
    const le = l.createdAt.toISOString();
    ordres.set(d.chef, {
      section: d.section ?? "",
      chef: d.chef,
      motif: d.motif ?? "",
      le,
      ouverteLe: avant?.ouverteLe ?? le,
      // Avant le 22 octobre 2026, une ouverture valait correction.
      mode: estModeRevision(d.mode) ? d.mode : "correction",
      auteur: l.user?.nom ?? null,
    });
  }
  return ordres;
}

/** Le chef peut-il CORRIGER (révision ouverte en correction directe), pour ce trimestre ? */
export async function aOrdreDeCorrection(db: PrismaClient, periode: Periode, chef: string): Promise<boolean> {
  if (!CHEFS_SOUS_ORDRE.includes(chef)) return false;
  return (await ordresEnCours(db, periode)).get(chef)?.mode === "correction";
}

/** Les arrondissements dont le DA n'a pas encore déposé le rapport. Vide : la révision peut s'ouvrir. */
export async function depotsManquants(db: PrismaClient, periode: Periode): Promise<string[]> {
  return (await etatCircuit(db, periode)).arrondissements.filter((a) => a.statut !== "TRANSMIS").map((a) => a.nom);
}

export const messageDepotsManquants = (manquants: string[]) =>
  `La révision s'ouvre après le dépôt des rapports de tous les DA. Pas encore déposé : ${manquants.join(", ")}.`;

async function exigerDepots(db: PrismaClient, periode: Periode) {
  const manquants = await depotsManquants(db, periode);
  if (manquants.length) throw new RefusCircuit(messageDepotsManquants(manquants));
}

const MOTIF_PAR_DEFAUT = "Révision des tableaux de la section, après le dépôt des rapports des DA.";

async function notifierSection(db: PrismaClient, code: string, saufUserId: string, declencheur: string, message: string, lien: string) {
  const s = await db.section.findFirst({ where: { code }, select: { id: true } });
  if (s) await notifierEvenement(db, { sectionId: s.id, saufUserId }, { declencheur, message, lien });
}

const CE_QUE_PERMET: Record<ModeRevision, string> = {
  relecture:
    "Relisez les tableaux de votre section : ce qui est faux, rejetez-le au DA concerné avec un motif (« À revoir », puis « Rejeter au DA ») — c'est lui qui corrige.",
  correction:
    "Corrigez vous-même les tableaux de votre section, pour tous les arrondissements (« À revoir » vous mène point par point).",
};

/**
 * Le DD ouvre la révision des tableaux d'une section, pour ce trimestre, dans
 * le mode choisi — ou change le mode d'une révision déjà ouverte.
 */
export async function donnerOrdreCorrection(
  db: PrismaClient,
  transaction: Transactionnelle,
  periodeId: string,
  periode: Periode,
  section: string,
  motif: string,
  auteurId: string,
  mode: ModeRevision = "correction"
): Promise<{ validationAnnulee: boolean }> {
  const s = sectionDe(section);
  if (!s) throw new RefusCircuit("Section inconnue.");
  if (!CHEFS_SOUS_ORDRE.includes(s.chef)) throw new RefusCircuit("Le chef BAC complète et corrige déjà librement les tableaux du BAC : il n'y a pas de révision à ouvrir.");
  const enCours = (await ordresEnCours(db, periode)).get(s.chef);
  if (enCours?.mode === mode) throw new RefusCircuit(`La révision de la section ${section} est déjà ouverte en ${LIBELLE_MODE[mode]}.`);
  // Le dépôt de tous les DA conditionne l'OUVERTURE ; un changement de mode en
  // cours de route n'y est pas soumis (une relecture a pu renvoyer un rapport).
  if (!enCours) await exigerDepots(db, periode);
  const demande = (await demandesEnCours(db, periode)).get(s.chef);
  const m = motif.trim() || demande?.motif || (enCours ? enCours.motif : MOTIF_PAR_DEFAUT);

  // La validation de la section tombe : on ne finalise pas sur des chiffres en cours de révision.
  const etat = await etatCircuit(db, periode);
  const validee = etat.sections.find((x) => x.code === section)?.statut === "VALIDE";
  if (validee) await annulerValidationSection(transaction, periodeId, section);

  await db.auditLog.create({
    data: {
      userId: auteurId,
      action: ACTION_ORDRE,
      entite: "Trimestre",
      entiteId: cleTrimestre(periode),
      details: {
        chef: s.chef, section, motif: m, mode, periode: libelleCourt(periode), validationAnnulee: validee,
        aLaDemande: Boolean(demande), ...(enCours ? { modeAvant: enCours.mode } : {}),
      },
    },
  });
  await notifierSection(
    db,
    section,
    auteurId,
    ACTION_ORDRE,
    (enCours
      ? `Le Délégué départemental passe la révision de votre section en ${LIBELLE_MODE[mode]} (${libelleCourt(periode)}). `
      : `Le Délégué départemental a ouvert la révision des tableaux de votre section en ${LIBELLE_MODE[mode]} (${libelleCourt(periode)}) — ${m} `) +
      `${CE_QUE_PERMET[mode]} Validez votre section une fois fini : la révision se fermera.` +
      (validee ? " Votre validation est levée." : ""),
    "/trimestre/saisie"
  );
  return { validationAnnulee: validee };
}

/**
 * Le DD ouvre la révision à toutes les sections techniques d'un coup, dans ce
 * mode — et y fait passer celles déjà ouvertes dans l'autre. Rend les sections touchées.
 */
export async function ouvrirRevisionPourTous(
  db: PrismaClient,
  transaction: Transactionnelle,
  periodeId: string,
  periode: Periode,
  motif: string,
  auteurId: string,
  mode: ModeRevision = "correction"
): Promise<string[]> {
  const ouvertes = await ordresEnCours(db, periode);
  const aOuvrir = SECTIONS_CIRCUIT.filter((s) => CHEFS_SOUS_ORDRE.includes(s.chef) && ouvertes.get(s.chef)?.mode !== mode);
  if (aOuvrir.some((s) => !ouvertes.has(s.chef))) await exigerDepots(db, periode);
  if (aOuvrir.length === 0) throw new RefusCircuit(`La révision est déjà ouverte en ${LIBELLE_MODE[mode]} pour toutes les sections.`);
  for (const s of aOuvrir) await donnerOrdreCorrection(db, transaction, periodeId, periode, s.code, motif, auteurId, mode);
  return aOuvrir.map((s) => s.code);
}

// ------------------------------------------------------------------ bilan

/** Ce que le chef a changé pendant sa révision : en tout, et par arrondissement. */
export interface BilanRevision {
  cases: number;
  tableaux: number[];
  parArrondissement: Record<string, { cases: number; tableaux: number[] }>;
}

const ACTIONS_REVISION = [
  "SAISIE_TRIMESTRIELLE",
  "EFFACEMENT_SAISIE_TRIMESTRIELLE",
  "CORRECTION_CASE_TRIMESTRE",
  "CORRECTION_CASE_TRIMESTRE_MODIFIEE",
  "CORRECTION_CASE_TRIMESTRE_ANNULEE",
  "CORRECTION_AN_PASSE",
];

/** Le bilan de la révision d'un chef depuis son ouverture, lu au journal. */
export async function bilanRevision(db: PrismaClient, periode: Periode, chef: string, depuis: Date): Promise<BilanRevision> {
  const lignes = await db.auditLog.findMany({
    where: { action: { in: ACTIONS_REVISION }, createdAt: { gte: depuis }, user: { role: chef as Role } },
    select: { details: true },
  });
  const cles = new Set<string>();
  const tableaux = new Set<number>();
  const parArr = new Map<string, { cles: Set<string>; tableaux: Set<number> }>();
  for (const l of lignes) {
    const d = l.details as { annee?: number; trimestre?: number; numeroTableau?: number; ligne?: string; colonne?: string; arrondissement?: string; liste?: string } | null;
    if (!d || d.annee !== periode.annee || d.trimestre !== periode.rang || d.numeroTableau == null) continue;
    const cle = `${d.numeroTableau}|${d.ligne}|${d.colonne}|${d.liste ?? ""}`;
    cles.add(cle);
    tableaux.add(d.numeroTableau);
    const arr = d.arrondissement ?? d.liste;
    if (arr) {
      const a = parArr.get(arr) ?? { cles: new Set<string>(), tableaux: new Set<number>() };
      a.cles.add(cle);
      a.tableaux.add(d.numeroTableau);
      parArr.set(arr, a);
    }
  }
  const trier = (s: Set<number>) => Array.from(s).sort((x, y) => x - y);
  return {
    cases: cles.size,
    tableaux: trier(tableaux),
    parArrondissement: Object.fromEntries(Array.from(parArr, ([nom, a]) => [nom, { cases: a.cles.size, tableaux: trier(a.tableaux) }])),
  };
}

const enClair = (b: { cases: number; tableaux: number[] }) =>
  b.cases === 0
    ? "aucune case modifiée"
    : `${b.cases} case${b.cases > 1 ? "s" : ""} modifiée${b.cases > 1 ? "s" : ""} — tableau${b.tableaux.length > 1 ? "x" : ""} n° ${b.tableaux.join(", ")}`;

/**
 * Ferme la révision d'une section : par le DD (cause « DD »), ou d'elle-même
 * quand la section est validée (cause « validation »). Chaque DA concerné reçoit
 * le bilan de ce qui a changé chez lui. Rend le bilan, ou null si rien n'était ouvert.
 */
export async function revoquerOrdreCorrection(
  db: PrismaClient,
  periode: Periode,
  section: string,
  auteurId: string,
  cause: "DD" | "validation" = "DD"
): Promise<BilanRevision | null> {
  const s = sectionDe(section);
  if (!s) throw new RefusCircuit("Section inconnue.");
  const o = (await ordresEnCours(db, periode)).get(s.chef);
  if (!o) {
    if (cause === "validation") return null;
    throw new RefusCircuit(`La révision n'est pas ouverte pour la section ${section}.`);
  }
  const bilan = await bilanRevision(db, periode, s.chef, new Date(o.ouverteLe));
  await db.auditLog.create({
    data: {
      userId: auteurId,
      action: ACTION_REVOCATION,
      entite: "Trimestre",
      entiteId: cleTrimestre(periode),
      details: { chef: s.chef, section, periode: libelleCourt(periode), cause, cases: bilan.cases, tableaux: bilan.tableaux },
    },
  });
  if (cause === "DD") {
    await notifierSection(
      db,
      section,
      auteurId,
      ACTION_REVOCATION,
      `Le Délégué départemental a fermé la révision des tableaux de votre section (${libelleCourt(periode)}) : ${enClair(bilan)}.`,
      "/trimestre/circuit"
    );
  } else {
    await notifierEvenement(db, { roles: ["DD"], saufUserId: auteurId }, {
      declencheur: ACTION_REVOCATION,
      message: `Section ${section} validée : la révision des tableaux est close (${libelleCourt(periode)}) — ${enClair(bilan)}.`,
      lien: "/trimestre/circuit",
    });
  }
  // Chaque DA apprend ce que le chef a changé dans SES tableaux.
  const arrondissements = await listerArrondissements(db);
  for (const [nom, b] of Object.entries(bilan.parArrondissement)) {
    const arr = arrondissements.find((a) => a.nom === nom || a.nomCanevas === graphieCanevas(nom));
    if (!arr) continue;
    await notifierEvenement(db, { arrondissementId: arr.id, saufUserId: auteurId }, {
      declencheur: "BILAN_REVISION_CHEF",
      message:
        `Révision du chef ${section} (${libelleCourt(periode)}) : ${b.cases} case${b.cases > 1 ? "s" : ""} de vos tableaux modifiée${b.cases > 1 ? "s" : ""} ` +
        `(tableau${b.tableaux.length > 1 ? "x" : ""} n° ${b.tableaux.join(", ")}). Le détail est au journal d'activité.`,
      lien: "/trimestre/saisie",
    });
  }
  return bilan;
}

/** Le DD ferme toutes les révisions ouvertes. Rend les sections fermées. */
export async function fermerRevisionPourTous(db: PrismaClient, periode: Periode, auteurId: string): Promise<string[]> {
  const ouvertes = await ordresEnCours(db, periode);
  if (ouvertes.size === 0) throw new RefusCircuit("Aucune révision n'est ouverte.");
  const fermees: string[] = [];
  for (const o of Array.from(ouvertes.values())) {
    await revoquerOrdreCorrection(db, periode, o.section, auteurId);
    fermees.push(o.section);
  }
  return fermees;
}

// ------------------------------------------------------------------ demandes

export interface DemandeOrdre {
  chef: string;
  section: string;
  motif: string;
  le: string;
  auteur: string | null;
}

/** Les demandes en attente pour ce trimestre, par rôle de chef. */
export async function demandesEnCours(db: PrismaClient, periode: Periode): Promise<Map<string, DemandeOrdre>> {
  const demandes = new Map<string, DemandeOrdre>();
  for (const l of await journal(db, periode, [ACTION_DEMANDE, ACTION_ORDRE, ACTION_REVOCATION, ACTION_REFUS])) {
    const d = l.details as { chef?: string; section?: string; motif?: string } | null;
    if (!d?.chef) continue;
    if (l.action === ACTION_DEMANDE) {
      demandes.set(d.chef, { chef: d.chef, section: d.section ?? "", motif: d.motif ?? "", le: l.createdAt.toISOString(), auteur: l.user?.nom?.trim() || l.user?.username || null });
    } else {
      demandes.delete(d.chef); // ouverte, fermée ou refusée : la demande a sa réponse
    }
  }
  return demandes;
}

/**
 * Le chef demande au DD d'ouvrir la révision des tableaux de sa section — ou,
 * en relecture, de passer en correction directe.
 */
export async function demanderOrdreCorrection(db: PrismaClient, periode: Periode, chef: string, motif: string, auteurId: string) {
  const s = SECTIONS_CIRCUIT.find((x) => x.chef === chef);
  if (!s || !CHEFS_SOUS_ORDRE.includes(chef)) throw new RefusCircuit("Seul un chef de section technique (PSA, SSV, SPAIH) demande la révision.");
  const enCours = (await ordresEnCours(db, periode)).get(chef);
  if (enCours?.mode === "correction") throw new RefusCircuit("La correction directe de votre section est déjà ouverte.");
  if ((await demandesEnCours(db, periode)).has(chef)) throw new RefusCircuit("Votre demande est déjà chez le DD : il vous répondra.");
  if (!enCours) await exigerDepots(db, periode);
  const m = motif.trim() || (enCours ? "Je souhaite corriger moi-même : le temps manque pour renvoyer au DA." : "Je souhaite réviser les tableaux de ma section.");
  await db.auditLog.create({
    data: {
      userId: auteurId, action: ACTION_DEMANDE, entite: "Trimestre", entiteId: cleTrimestre(periode),
      details: { chef, section: s.code, motif: m, periode: libelleCourt(periode), ...(enCours ? { passerEnCorrection: true } : {}) },
    },
  });
  await notifierEvenement(db, { roles: ["DD"], saufUserId: auteurId }, {
    declencheur: ACTION_DEMANDE,
    message: enCours
      ? `Le chef ${s.code}, en relecture, vous demande la correction directe des tableaux de sa section (${libelleCourt(periode)}) — ${m}`
      : `Le chef ${s.code} vous demande d'ouvrir la révision des tableaux de sa section (${libelleCourt(periode)}) — ${m}`,
    lien: "/trimestre/circuit",
  });
}

/** Le DD refuse la demande d'un chef — le chef est prévenu, avec le motif. */
export async function refuserDemande(db: PrismaClient, periode: Periode, section: string, motif: string, auteurId: string) {
  const s = sectionDe(section);
  if (!s) throw new RefusCircuit("Section inconnue.");
  if (!(await demandesEnCours(db, periode)).has(s.chef)) throw new RefusCircuit(`Aucune demande du chef ${section} n'attend de réponse.`);
  const m = motif.trim();
  await db.auditLog.create({
    data: { userId: auteurId, action: ACTION_REFUS, entite: "Trimestre", entiteId: cleTrimestre(periode), details: { chef: s.chef, section, motif: m, periode: libelleCourt(periode) } },
  });
  await notifierSection(
    db,
    section,
    auteurId,
    ACTION_REFUS,
    `Le Délégué départemental n'a pas ouvert la révision de votre section (${libelleCourt(periode)})${m ? ` — ${m}` : ""}. Signalez à l'arrondissement ce qui ne va pas.`,
    "/trimestre/circuit"
  );
}

export const MESSAGE_SANS_ORDRE =
  "Cette case appartient à l'arrondissement : vous ne la modifiez que pendant la correction directe ouverte par le Délégué départemental. " +
  "Touchez la case pour la signaler ou la rejeter au DA, ou demandez au DD la correction directe.";

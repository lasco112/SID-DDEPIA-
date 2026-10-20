/**
 * LES ORDRES DE CORRECTION DU DD aux chefs de section (décision du Délégué,
 * 20 octobre 2026).
 *
 * Le chef BAC n'est PAS concerné : il complète et corrige librement les
 * tableaux du BAC, comme avant (décision du Délégué, 20 octobre 2026).
 *
 * Sans ordre, un chef de section technique (PSA, SSV, SPAIH) RELIT les tableaux de sa section, SIGNALE à
 * l'arrondissement ce qui ne va pas, et COMPLÈTE les cases encore vides. Il ne
 * modifie pas une case qu'un arrondissement a remplie — en 2026 comme pour le
 * chiffre de 2025.
 *
 * Avec l'ordre du DD — par chef et par trimestre, motivé, révocable — il
 * corrige aussi ces cases. Donner l'ordre FAIT TOMBER la validation du domaine
 * s'il était validé : le rapport départemental ne se finalise pas sur des
 * chiffres en cours de correction ; le chef revalide une fois fini.
 *
 * Ce qui ne change JAMAIS ici : les cases calculées à partir du mensuel ne se
 * corrigent pas dans le trimestriel (elles se corrigent dans le rapport
 * mensuel, par son propre circuit, et le trimestre se recalcule seul).
 *
 * L'état se lit dans le journal (ordre, révocation) : chaque décision du DD y
 * reste, avec son auteur, sa date et son motif — sans table nouvelle.
 */
import type { PrismaClient } from "@prisma/client";
import type { Transactionnelle } from "@/lib/dbCloisonne";
import type { Periode } from "../periodes/calendrier";
import { libelleCourt } from "../periodes/calendrier";
import { SECTIONS_CIRCUIT, RefusCircuit, annulerValidationSection, etatCircuit } from "./circuit";
import { notifierEvenement } from "@/server/notifications/evenements";

export const ACTION_ORDRE = "ORDRE_CORRECTION_CHEF";
/** Les chefs dont la correction des cases des arrondissements demande l'ordre du DD. */
export const CHEFS_SOUS_ORDRE = ["CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"];
export const ACTION_REVOCATION = "REVOCATION_ORDRE_CORRECTION_CHEF";

export interface OrdreCorrection {
  /** « PSA ». */
  section: string;
  /** « CHEF_PSA ». */
  chef: string;
  motif: string;
  le: string;
  auteur: string | null;
}

const cleTrimestre = (p: Periode) => `${p.annee}-${p.rang}`;

/** Les ordres EN COURS pour ce trimestre, par rôle de chef. */
export async function ordresEnCours(db: PrismaClient, periode: Periode): Promise<Map<string, OrdreCorrection>> {
  const lignes = await db.auditLog.findMany({
    where: { action: { in: [ACTION_ORDRE, ACTION_REVOCATION] }, entite: "Trimestre", entiteId: cleTrimestre(periode) },
    orderBy: { createdAt: "asc" },
    select: { action: true, details: true, createdAt: true, user: { select: { nom: true } } },
  });
  const ordres = new Map<string, OrdreCorrection>();
  for (const l of lignes) {
    const d = l.details as { chef?: string; section?: string; motif?: string } | null;
    if (!d?.chef) continue;
    if (l.action === ACTION_REVOCATION) ordres.delete(d.chef);
    else ordres.set(d.chef, { section: d.section ?? "", chef: d.chef, motif: d.motif ?? "", le: l.createdAt.toISOString(), auteur: l.user?.nom ?? null });
  }
  return ordres;
}

/** Ce chef a-t-il, pour ce trimestre, l'ordre du DD de corriger ? */
export async function aOrdreDeCorrection(db: PrismaClient, periode: Periode, chef: string): Promise<boolean> {
  if (!CHEFS_SOUS_ORDRE.includes(chef)) return false;
  return (await ordresEnCours(db, periode)).has(chef);
}

/** Le DD ordonne à un chef de corriger les tableaux de sa section, pour ce trimestre. */
export async function donnerOrdreCorrection(
  db: PrismaClient,
  transaction: Transactionnelle,
  periodeId: string,
  periode: Periode,
  section: string,
  motif: string,
  auteurId: string
): Promise<{ validationAnnulee: boolean }> {
  const s = SECTIONS_CIRCUIT.find((x) => x.code === section);
  if (!s) throw new RefusCircuit("Section inconnue.");
  if (!CHEFS_SOUS_ORDRE.includes(s.chef)) throw new RefusCircuit("Le chef BAC complète et corrige déjà librement les tableaux du BAC : aucun ordre n'est nécessaire.");
  const m = motif.trim();
  if (!m) throw new RefusCircuit("Indiquez le motif : ce que le chef doit corriger, et pourquoi.");
  if ((await ordresEnCours(db, periode)).has(s.chef)) throw new RefusCircuit("Un ordre de correction est déjà en cours pour ce chef.");

  // La validation du domaine tombe : on ne finalise pas sur des chiffres en cours de correction.
  const etat = await etatCircuit(db, periode);
  const validee = etat.sections.find((x) => x.code === section)?.statut === "VALIDE";
  if (validee) await annulerValidationSection(transaction, periodeId, section);

  await db.auditLog.create({
    data: {
      userId: auteurId,
      action: ACTION_ORDRE,
      entite: "Trimestre",
      entiteId: cleTrimestre(periode),
      details: { chef: s.chef, section, motif: m, periode: libelleCourt(periode), validationAnnulee: validee },
    },
  });
  const sectionEnBase = await db.section.findFirst({ where: { code: section }, select: { id: true } });
  if (sectionEnBase) {
    await notifierEvenement(db, { sectionId: sectionEnBase.id, saufUserId: auteurId }, {
      declencheur: ACTION_ORDRE,
      message:
        `Le Délégué départemental vous demande de corriger les tableaux de votre section (${libelleCourt(periode)}) — motif : ${m}.` +
        (validee ? " Votre validation est levée : validez à nouveau une fois les corrections faites." : ""),
      lien: "/trimestre/saisie",
    });
  }
  return { validationAnnulee: validee };
}

/** Le DD révoque l'ordre : le chef ne corrige plus les cases remplies par les arrondissements. */
export async function revoquerOrdreCorrection(db: PrismaClient, periode: Periode, section: string, auteurId: string) {
  const s = SECTIONS_CIRCUIT.find((x) => x.code === section);
  if (!s) throw new RefusCircuit("Section inconnue.");
  if (!(await ordresEnCours(db, periode)).has(s.chef)) throw new RefusCircuit("Aucun ordre de correction en cours pour ce chef.");
  await db.auditLog.create({
    data: { userId: auteurId, action: ACTION_REVOCATION, entite: "Trimestre", entiteId: cleTrimestre(periode), details: { chef: s.chef, section, periode: libelleCourt(periode) } },
  });
  const sectionEnBase = await db.section.findFirst({ where: { code: section }, select: { id: true } });
  if (sectionEnBase) {
    await notifierEvenement(db, { sectionId: sectionEnBase.id, saufUserId: auteurId }, {
      declencheur: ACTION_REVOCATION,
      message: `Le Délégué départemental a levé l'ordre de correction des tableaux de votre section (${libelleCourt(periode)}).`,
      lien: "/trimestre/circuit",
    });
  }
}

export const MESSAGE_SANS_ORDRE =
  "Cette case a été remplie par l'arrondissement : vous ne la corrigez que sur ordre du Délégué départemental. " +
  "Touchez « Signaler une case à l'arrondissement » pour la lui faire corriger, ou demandez au DD un ordre de correction.";

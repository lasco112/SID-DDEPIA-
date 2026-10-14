/**
 * Les textes PERMANENTS du rapport trimestriel d'un département (décision du
 * Délégué, 14 octobre 2026) : situation et relief, pédologie, démographie,
 * missions, vision, organisation, introduction, bibliographie — pour le
 * département et pour chacun de ses arrondissements.
 *
 * Qui les écrit : le DD de son département, et l'administrateur du système
 * pour n'importe lequel. Pas le DA, même pour son arrondissement.
 *
 * D'où ils viennent : de la table `TexteDepartement`. Pour la Menoua, les
 * textes extraits de ses rapports réels (canevas/textesFixes.ts,
 * canevas/textesArrondissements.ts) restent le point de départ tant que rien
 * n'est écrit par-dessus — son rapport ne change donc pas d'un caractère.
 *
 * Le client reçu est cloisonné : il désigne le département.
 */
import type { PrismaClient } from "@prisma/client";
import { textesFixesDe } from "./canevas/textesFixes";
import { TEXTES_ARRONDISSEMENTS, type CleTexteArrondissement } from "./canevas/textesArrondissements";
import { zonesTexte } from "./rapportCanevas";

/** Les zones permanentes, dans l'ordre du rapport. */
export const CLES_TEXTES_PERMANENTS: CleTexteArrondissement[] = [
  "I.introduction",
  "I.geo.relief",
  "I.geo.pedologie",
  "I.geo.demographie",
  "I1.missions",
  "I1.vision",
  "I1.organisation",
  "bibliographie",
];

/** Le plus long texte accepté : une rubrique, pas un rapport entier. */
export const LONGUEUR_MAX = 20_000;

/** "" pour le département, l'identifiant d'un arrondissement sinon. */
export type Portee = string;

async function lire(db: PrismaClient, portee: Portee): Promise<Map<string, string>> {
  const lignes = await db.texteDepartement.findMany({ where: { portee }, select: { cle: true, texte: true } });
  return new Map(lignes.map((l) => [l.cle, l.texte]));
}

/** Les textes de référence que le SID fournit déjà : ceux de la Menoua, et seulement pour elle. */
function references(codeDepartement: string, arrondissement: { nom: string } | null): Partial<Record<string, string>> {
  if (codeDepartement !== "MEN") return {};
  if (!arrondissement) return Object.fromEntries(textesFixesDe(codeDepartement));
  return TEXTES_ARRONDISSEMENTS.get(arrondissement.nom) ?? {};
}

/** Les textes effectivement repris dans le rapport du DÉPARTEMENT. */
export async function textesDuDepartement(db: PrismaClient, codeDepartement: string): Promise<Map<string, string>> {
  const ecrits = await lire(db, "");
  return new Map([...Object.entries(references(codeDepartement, null)), ...Array.from(ecrits)].filter((e): e is [string, string] => Boolean(e[1]?.trim())));
}

/** Les textes effectivement repris dans le rapport d'un ARRONDISSEMENT. */
export async function textesDeLArrondissement(
  db: PrismaClient,
  codeDepartement: string,
  arrondissement: { id: string; nom: string }
): Promise<Map<string, string>> {
  const ecrits = await lire(db, arrondissement.id);
  return new Map([...Object.entries(references(codeDepartement, arrondissement)), ...Array.from(ecrits)].filter((e): e is [string, string] => Boolean(e[1]?.trim())));
}

export interface ZonePermanente {
  cle: string;
  /** « a) Situation et relief ». */
  titre: string;
  consigne: string;
  /** Ce qui a été écrit dans le SID, ou null. */
  texte: string | null;
  /** Le texte de référence du SID (Menoua), utilisé tant que rien n'est écrit. */
  reference: string | null;
  modifieLe: string | null;
}

/** L'écran : les zones d'une portée, avec ce qui est écrit et ce qui sert à défaut. */
export async function zonesPermanentes(
  db: PrismaClient,
  codeDepartement: string,
  arrondissement: { id: string; nom: string } | null
): Promise<ZonePermanente[]> {
  const portee = arrondissement?.id ?? "";
  const lignes = await db.texteDepartement.findMany({ where: { portee }, select: { cle: true, texte: true, modifieLe: true } });
  const refs = references(codeDepartement, arrondissement);
  const inventaire = zonesTexte();
  return CLES_TEXTES_PERMANENTS.map((cle) => {
    const z = inventaire.find((x) => x.cle === cle);
    const l = lignes.find((x) => x.cle === cle);
    return {
      cle,
      titre: z?.contexte ?? cle,
      consigne: z?.consigne ?? "",
      texte: l?.texte ?? null,
      reference: refs[cle] ?? null,
      modifieLe: l?.modifieLe.toISOString() ?? null,
    };
  });
}

export class TexteRefuse extends Error {
  status = 400;
}

/**
 * Écrit (ou efface, texte vide) une zone permanente. Effacer rend la main au
 * texte de référence, s'il en existe un.
 */
export async function ecrireTextePermanent(
  db: PrismaClient,
  portee: Portee,
  cle: string,
  texte: string,
  auteurId: string
): Promise<"ecrit" | "efface"> {
  if (!(CLES_TEXTES_PERMANENTS as string[]).includes(cle)) throw new TexteRefuse("Zone de texte inconnue.");
  if (texte.length > LONGUEUR_MAX) throw new TexteRefuse(`Texte trop long (${LONGUEUR_MAX} caractères au plus).`);
  if (portee) {
    // L'arrondissement doit être du département : le client cloisonné ne voit que les siens.
    const arr = await db.arrondissement.findUnique({ where: { id: portee }, select: { id: true } });
    if (!arr) throw new TexteRefuse("Cet arrondissement n'appartient pas au département.");
  }
  const existant = await db.texteDepartement.findFirst({ where: { portee, cle }, select: { id: true } });
  if (!texte.trim()) {
    if (existant) await db.texteDepartement.delete({ where: { id: existant.id } });
    return "efface";
  }
  if (existant) {
    await db.texteDepartement.update({ where: { id: existant.id }, data: { texte, modifieParId: auteurId } });
  } else {
    await db.texteDepartement.create({ data: { portee, cle, texte, modifieParId: auteurId } });
  }
  return "ecrit";
}

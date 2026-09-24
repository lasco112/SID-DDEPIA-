/**
 * Les analyses des tableaux : la proposition calculée, ce qu'un humain en a
 * fait, et ce qui part au rapport.
 *
 * Qui fait quoi (décision du Délégué, 24 septembre 2026)
 * -----------------------------------------------------
 *  - Rapport d'un arrondissement : l'AGENT DE SAISIE valide les analyses ; le
 *    DA relit l'ensemble et corrige ce qu'il juge utile.
 *  - Rapport départemental : chaque CHEF DE SECTION valide les analyses de
 *    son domaine ; le DD relit le document final et n'intervient que s'il
 *    le veut.
 *
 * Aucun texte n'est officiel sans validation, mais aucun rapport n'est bloqué
 * faute de validation : le document porte alors le texte calculé.
 */
import type { PrismaClient } from "@prisma/client";
import type { Transactionnelle } from "@/lib/dbCloisonne";
import type { Bloc, ContexteCanevas } from "../canevas/types";
import type { FournisseurValeur } from "../canevas/rendu";
import { SECTIONS_CANEVAS, chefDeSection, type ChefDeSection } from "../canevas/sections";
import { analyserTableau, type PhraseAnalyse } from "./analyseTableau";
import { SUJETS } from "./sujets";

type BlocTableau = Extract<Bloc, { type: "tableau" }>;

export type { ChefDeSection };

export interface Proposition {
  numero: number;
  titre: string;
  section: string;
  chef: ChefDeSection;
  phrases: PhraseAnalyse[];
  /** Les phrases, bout à bout : le texte proposé. */
  texte: string;
  /** Le tableau est vide : rien à analyser, rien à valider. */
  vide: boolean;
  sansComparaison: boolean;
  /** L'évolution du total sur un an, en % — pour la conclusion. */
  evolution: number | null;
  /** Le total de la période — pour la conclusion. */
  total: number | null;
}

/** L'analyse calculée de chaque tableau analysable, dans l'ordre du canevas. */
export function propositions(ctx: ContexteCanevas, valeur: FournisseurValeur): Proposition[] {
  const sortie: Proposition[] = [];
  for (const section of SECTIONS_CANEVAS) {
    for (const bloc of section.blocs) {
      if (bloc.type !== "tableau" || bloc.numero == null || !SUJETS[bloc.numero]) continue;
      const a = analyserTableau(bloc as BlocTableau, ctx, valeur, SUJETS[bloc.numero]);
      if (!a) continue;
      const vide = a.phrases.length === 1 && /^Aucune donnée n’a été renseignée pour ce tableau/.test(a.phrases[0].texte);
      sortie.push({
        numero: bloc.numero,
        titre: bloc.titre,
        section: section.titre,
        chef: chefDeSection(section.cle),
        phrases: a.phrases,
        texte: a.phrases.map((p) => p.texte).join(" "),
        vide,
        sansComparaison: a.sansComparaison,
        evolution: a.evolution,
        total: a.total,
      });
    }
  }
  return sortie;
}

export type StatutAnalyse = "vide" | "a_valider" | "valide" | "a_revoir";

export interface AnalyseEnregistree {
  texteCalcule: string;
  texte: string;
  explication: string | null;
  valideLe: Date;
  validePar: string | null;
}

/** Ce que l'humain a validé, par tableau, pour une portée. */
export async function lireAnalyses(
  db: PrismaClient,
  periodeId: string | null,
  portee: string
): Promise<Map<number, AnalyseEnregistree>> {
  if (!periodeId) return new Map();
  const lignes = await db.analyseCanevas.findMany({
    where: { periodeId, portee },
    select: {
      numeroTableau: true, texteCalcule: true, texte: true, explication: true, valideLe: true,
      validePar: { select: { nom: true } },
    },
  });
  return new Map(
    lignes.map((l) => [
      l.numeroTableau,
      {
        texteCalcule: l.texteCalcule,
        texte: l.texte,
        explication: l.explication,
        valideLe: l.valideLe,
        validePar: l.validePar?.nom ?? null,
      },
    ])
  );
}

/**
 * L'état d'une analyse : validée tant que les chiffres n'ont pas bougé depuis
 * la validation ; à revoir s'ils ont changé — le texte validé décrirait
 * alors d'autres chiffres que ceux du tableau.
 */
export function statutDe(p: Proposition, e: AnalyseEnregistree | undefined): StatutAnalyse {
  if (p.vide) return "vide";
  if (!e) return "a_valider";
  return e.texteCalcule === p.texte ? "valide" : "a_revoir";
}

/**
 * Le texte qui part au rapport, sous le tableau. Validé : celui de l'auteur.
 * À revoir : le texte recalculé — jamais un texte qui contredirait le
 * tableau —, avec l'explication de l'auteur. Non validé : le texte calculé.
 * Tableau vide : rien.
 */
export function texteAuRapport(p: Proposition, e: AnalyseEnregistree | undefined): string | null {
  const statut = statutDe(p, e);
  if (statut === "vide") return null;
  const corps = statut === "valide" ? e!.texte : p.texte;
  const explication = e?.explication?.trim();
  return explication ? `${corps} ${explication}` : corps;
}

/** Les textes d'analyse d'un rapport, par numéro de tableau. */
export async function analysesDuRapport(
  db: PrismaClient,
  periodeId: string | null,
  portee: string,
  ctx: ContexteCanevas,
  valeur: FournisseurValeur
): Promise<Map<number, string>> {
  const enregistrees = await lireAnalyses(db, periodeId, portee);
  const sortie = new Map<number, string>();
  for (const p of propositions(ctx, valeur)) {
    const t = texteAuRapport(p, enregistrees.get(p.numero));
    if (t) sortie.set(p.numero, t);
  }
  return sortie;
}

/**
 * Valide (ou corrige) l'analyse d'un tableau. `texteCalcule` est la
 * proposition au moment de la validation : c'est elle qui permettra de savoir
 * si les chiffres ont changé depuis.
 */
export async function validerAnalyse(
  transaction: Transactionnelle,
  periodeId: string,
  portee: string,
  numeroTableau: number,
  contenu: { texteCalcule: string; texte: string; explication: string | null },
  auteurId: string,
  /** Validée hors ligne : la date de l'appareil. Une validation plus récente sur le serveur est conservée. */
  modifieLe?: Date
): Promise<{ ignoree: boolean }> {
  return transaction(async (tx) => {
    const existante = await tx.analyseCanevas.findFirst({ where: { periodeId, numeroTableau, portee }, select: { id: true, updatedAt: true } });
    if (existante && modifieLe && existante.updatedAt > modifieLe) return { ignoree: true };
    const data = {
      texteCalcule: contenu.texteCalcule,
      texte: contenu.texte.trim() || contenu.texteCalcule,
      explication: contenu.explication?.trim() || null,
      valideParId: auteurId,
      valideLe: new Date(),
    };
    if (existante) await tx.analyseCanevas.update({ where: { id: existante.id }, data });
    else await tx.analyseCanevas.create({ data: { periodeId, numeroTableau, portee, ...data } });
    return { ignoree: false };
  });
}

/** Retire une validation : le tableau reprend le texte calculé. */
export async function retirerAnalyse(
  transaction: Transactionnelle,
  periodeId: string,
  portee: string,
  numeroTableau: number
): Promise<void> {
  await transaction(async (tx) => {
    await tx.analyseCanevas.deleteMany({ where: { periodeId, numeroTableau, portee } });
  });
}

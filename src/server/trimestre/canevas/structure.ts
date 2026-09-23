/**
 * La structure d'un tableau du canevas, telle que la saisie et les totaux en
 * ont besoin : où sont les territoires, quelles cases sont des totaux, comment
 * repérer une ligne de façon stable.
 *
 * Tout se déduit de la DESCRIPTION du tableau — aucune liste parallèle.
 */
import type { Bloc, ContexteCanevas } from "./types";
import { lignesDe } from "./rendu";

type BlocTableau = Extract<Bloc, { type: "tableau" }>;

/**
 * Où sont les arrondissements : en colonnes, en lignes, ou nulle part (un
 * tableau de niveau départemental — budget, liste des vétérinaires…).
 */
export function axeTerritorial(bloc: BlocTableau): "lignes" | "colonnes" | null {
  if (bloc.kind === "arrondissements") return "colonnes";
  if (bloc.entetes.includes("{ARRONDISSEMENTS}")) return "colonnes";
  if (bloc.lignes.includes("{ARRONDISSEMENTS}")) return "lignes";
  return null;
}

/**
 * Une case de total ou d'écart : « TOTAL T3 2026 », « TOTAL CUMULE », « Total »,
 * « ÉCART ». Elle se CALCULE, elle ne se saisit jamais : un total saisi à la
 * main finit toujours par contredire ses composantes.
 */
export const estTotal = (libelle: string) => /^\s*(TOTAL|ÉCART)\b/i.test(libelle);
export const estEcart = (libelle: string) => /^\s*ÉCART\b/i.test(libelle);

/**
 * Le repère STABLE de chaque ligne, sous lequel ses cases sont enregistrées.
 *
 * C'est le libellé de la ligne — sauf aux tableaux du budget-programme, où
 * plusieurs lignes n'ont pas de libellé propre (le code d'action n'est écrit
 * qu'une fois) : leur repère est alors l'activité, pré-remplie, qui est unique.
 */
export function clesLignes(bloc: BlocTableau, ctx: ContexteCanevas): string[] {
  const libelles = lignesDe(bloc, ctx);
  if (bloc.kind !== "libre" || !bloc.prerempli) return libelles;
  const vus = new Set<string>();
  return libelles.map((libelle, i) => {
    const cases = bloc.prerempli?.[i] ?? [];
    const activite = [...cases].reverse().find((c) => c && c.trim());
    let cle = activite?.trim() || libelle.trim() || `Ligne ${i + 1}`;
    if (vus.has(cle)) cle = `${cle} (${i + 1})`;
    vus.add(cle);
    return cle;
  });
}

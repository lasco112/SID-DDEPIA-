/**
 * Les GRAPHIQUES du rapport trimestriel (décision D3 du Délégué, 23 septembre
 * 2026 ; précisée le 13 octobre 2026).
 *
 * Le canevas départemental (docs/canevas/canevas de rapport a prendre.docx)
 * porte huit graphiques en barres, chacun sous son tableau ; le rapport réel
 * du premier trimestre 2026 en portait un neuvième, sur les recettes. Ils sont
 * DESSINÉS À PARTIR DU TABLEAU, par les mêmes fonctions que le tableau : un
 * graphique ne peut pas dire autre chose que les chiffres au-dessus de lui.
 *
 * Les intitulés sont ceux du canevas. Le rapport d'un arrondissement porte les
 * mêmes graphiques, sur ses seuls chiffres : une barre par catégorie.
 */
import type { Bloc, ContexteCanevas } from "./types";
import { resoudre } from "./types";
import { axeTerritorial, clesLignes, estTotal } from "./structure";

type BlocTableau = Extract<Bloc, { type: "tableau" }>;

export interface GraphiqueCanevas {
  /** Le tableau dont il dessine les chiffres ; il se place juste dessous. */
  tableau: number;
  /** L'intitulé du canevas (rapport départemental). Jetons de période admis. */
  titre: string;
  /** Le même, pour le rapport d'un arrondissement : sans « par arrondissement ». */
  titreArrondissement: string;
  /**
   * « categories » : les catégories du tableau, arrondissement par
   * arrondissement. « comparaison » : le total de la période face à celui de
   * l'an passé, régie par régie.
   */
  genre: "categories" | "comparaison";
}

export const GRAPHIQUES_CANEVAS: GraphiqueCanevas[] = [
  {
    tableau: 13,
    titre: "Étude comparative des recettes par régie, {P-1} et {P}",
    titreArrondissement: "Étude comparative des recettes, {P-1} et {P}",
    genre: "comparaison",
  },
  { tableau: 14, titre: "Cheptel bovin", titreArrondissement: "Cheptel bovin", genre: "categories" },
  { tableau: 16, titre: "Données d'abattages par Arrondissement", titreArrondissement: "Données d'abattages", genre: "categories" },
  { tableau: 23, titre: "Situation du cheptel ovin par Arrondissement", titreArrondissement: "Situation du cheptel ovin", genre: "categories" },
  { tableau: 28, titre: "Situation du cheptel caprin par Arrondissement", titreArrondissement: "Situation du cheptel caprin", genre: "categories" },
  {
    tableau: 33,
    titre: "Situation du cheptel Asins et Equins par Arrondissement",
    titreArrondissement: "Situation du cheptel Asins et Equins",
    genre: "categories",
  },
  { tableau: 37, titre: "Situation du cheptel porcins par Arrondissement", titreArrondissement: "Situation du cheptel porcins", genre: "categories" },
  {
    tableau: 42,
    titre: "La distribution du cheptel avicole, têtes par Arrondissements",
    titreArrondissement: "La distribution du cheptel avicole, en têtes",
    genre: "categories",
  },
  { tableau: 47, titre: "Production des Oeufs de table", titreArrondissement: "Production des Oeufs de table", genre: "categories" },
];

/** Le repère posé par le rendu à la place du graphique n° `rang` (à partir de 1) ; graphiquesWord.ts le remplace par le dessin. */
export const repereGraphique = (rang: number) => `@@SID-GRAPHIQUE-${rang}@@`;

export const graphiqueDe = (numeroTableau: number | null) =>
  numeroTableau == null ? undefined : GRAPHIQUES_CANEVAS.find((g) => g.tableau === numeroTableau);

/** Ce qu'il faut pour dessiner un graphique : son titre, l'axe, les séries. */
export interface DonneesGraphique {
  titre: string;
  /** Les libellés de l'axe horizontal. */
  categories: string[];
  /** Une série par couleur ; `null` : pas de chiffre — jamais un zéro inventé. */
  series: { nom: string; valeurs: (number | null)[] }[];
}

/** « 1 991 », « 339,9 » → nombre. Un pourcentage ou un texte ne se dessine pas. */
function nombre(s: string | null): number | null {
  if (s == null || /%/.test(s)) return null;
  const n = Number(s.replace(/[\s  ]/g, "").replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
}

/**
 * Les données d'un graphique, lues dans le tableau tel qu'il sera imprimé.
 * `null` si le tableau ne porte aucun chiffre : pas de cadre vide au rapport.
 *
 * `valeur` et `colonnes` viennent du rendu (rendu.ts) : le graphique ne
 * connaît aucune autre source que le tableau.
 */
export function donneesGraphique(
  g: GraphiqueCanevas,
  bloc: BlocTableau,
  ctx: ContexteCanevas,
  colonnesDuTableau: string[],
  lire: (ligne: string, colonne: string, indexColonne: number) => string | null
): DonneesGraphique | null {
  const [, ...colonnes] = colonnesDuTableau;
  const lignes = clesLignes(bloc, ctx);
  const v = (ligne: string, colonne: string) => nombre(lire(ligne, colonne, colonnes.indexOf(colonne) + 1));
  const titre = resoudre(ctx.arrondissement ? g.titreArrondissement : g.titre, ctx);

  let categories: string[];
  let series: DonneesGraphique["series"];

  if (g.genre === "comparaison") {
    // Les régies en abscisse ; deux séries : la période, et la même l'an passé.
    const regies = colonnes.filter((c) => !estTotal(c));
    const courant = `TOTAL ${ctx.periodeCourt}`;
    const passe = `TOTAL ${ctx.periodeCourtN1}`;
    if (!lignes.includes(courant) || !lignes.includes(passe)) return null;
    categories = regies;
    series = [
      { nom: ctx.periodeCourt, valeurs: regies.map((r) => v(courant, r)) },
      { nom: ctx.periodeCourtN1, valeurs: regies.map((r) => v(passe, r)) },
    ];
  } else {
    const lignesUtiles = lignes.filter((l) => !estTotal(l));
    const colonnesUtiles = colonnes.filter((c) => !estTotal(c));
    // Arrondissements en lignes : ils vont en abscisse, une série par
    // catégorie — sauf dans le rapport d'un arrondissement, qui n'a qu'une
    // ligne : ses catégories vont en abscisse, une barre chacune.
    const arrondissementsEnAbscisse = axeTerritorial(bloc) === "lignes" && lignesUtiles.length > 1;
    if (arrondissementsEnAbscisse) {
      categories = lignesUtiles;
      series = colonnesUtiles.map((c) => ({ nom: c, valeurs: lignesUtiles.map((l) => v(l, c)) }));
    } else if (axeTerritorial(bloc) === "lignes") {
      categories = colonnesUtiles;
      series = lignesUtiles.map((l) => ({ nom: l, valeurs: colonnesUtiles.map((c) => v(l, c)) }));
    } else {
      // Arrondissements en colonnes (les bandes) : les catégories en abscisse.
      categories = lignesUtiles;
      series = colonnesUtiles.map((c) => ({ nom: c, valeurs: lignesUtiles.map((l) => v(l, c)) }));
    }
  }

  // Une série sans aucun chiffre n'encombre pas la légende.
  series = series.filter((s) => s.valeurs.some((x) => x != null));
  // Une catégorie sans aucun chiffre n'encombre pas l'axe (dix-huit catégories
  // de volaille, dont la moitié vide). Un ARRONDISSEMENT sans chiffre, lui,
  // reste : son absence se verrait moins qu'une place vide.
  const gardees = categories.map((c, k) => ctx.arrondissements.includes(c) || series.some((s) => s.valeurs[k] != null));
  if (gardees.some((g) => !g)) {
    categories = categories.filter((_, k) => gardees[k]);
    series = series.map((s) => ({ ...s, valeurs: s.valeurs.filter((_, k) => gardees[k]) }));
  }
  // Une seule barre ne compare rien : pas de graphique pour un seul chiffre.
  const points = series.reduce((n, s) => n + s.valeurs.filter((x) => x != null).length, 0);
  if (points < 2 || categories.length === 0) return null;
  return { titre, categories, series };
}

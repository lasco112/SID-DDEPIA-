/**
 * Description de la mise en page du canevas trimestriel officiel.
 *
 * RÈGLE ABSOLUE : ce fichier et ceux des sections décrivent le canevas TEL
 * QU'IL EST, pas tel qu'il serait commode. Pas une colonne en plus, pas une en
 * moins, pas un libellé reformulé. La référence est docs/CANEVAS_TRIMESTRIEL.md,
 * extrait automatiquement du .docx du Délégué ; toute divergence est une faute
 * du code, jamais du canevas.
 *
 * Les libellés dépendant de la période portent des jetons, remplacés au rendu :
 *   {P}    la période      — « T3 2026 »
 *   {P-1}  la même, un an plus tôt — « T3 2025 »
 *   {A}    l'année millésime — « 2026 »
 *   {A-1}  l'année précédente — « 2025 »
 *   {M1} {M2} {M3}  les trois mois en majuscules — « JUILLET »…
 */

export interface ContexteCanevas {
  /** « T3 2026 » */
  periodeCourt: string;
  /** « T3 2025 » */
  periodeCourtN1: string;
  /** L'année de la période — 2026. */
  annee: number;
  /** Les trois mois de la période, en majuscules. */
  mois: string[];
  /** Les six arrondissements, dans l'ordre du canevas. */
  arrondissements: string[];
}

/** Remplace les jetons de période dans un libellé du canevas. */
export function resoudre(libelle: string, ctx: ContexteCanevas): string {
  return libelle
    .replace(/\{P-1\}/g, ctx.periodeCourtN1)
    .replace(/\{P\}/g, ctx.periodeCourt)
    .replace(/\{A-1\}/g, String(ctx.annee - 1))
    .replace(/\{A\}/g, String(ctx.annee))
    .replace(/\{M1\}/g, ctx.mois[0] ?? "")
    .replace(/\{M2\}/g, ctx.mois[1] ?? "")
    .replace(/\{M3\}/g, ctx.mois[2] ?? "");
}

/**
 * Un tableau dont les colonnes sont les six arrondissements — le modèle
 * dominant du canevas : 29 tableaux sur 81 le suivent.
 * Colonnes : libellé, les six arrondissements, TOTAL {P}, TOTAL {P-1}.
 */
export interface TableauArrondissements {
  kind: "arrondissements";
  /** Numéro imprimé dans le canevas : « Tableau n° 3 ». */
  numero: number;
  titre: string;
  /** Intitulé de la première colonne, tel quel : « STRUCTURES », « NATURE »… */
  enteteLibelle: string;
  /** Libellés de ligne imposés, dans l'ordre, y compris la ligne TOTAL. */
  lignes: string[];
}

/** Un tableau dont les colonnes ne sont pas les arrondissements. */
export interface TableauLibre {
  kind: "libre";
  numero: number | null;
  titre: string;
  entetes: string[];
  lignes: string[];
}

export type Tableau = TableauArrondissements | TableauLibre;

export type Bloc =
  // Le canevas descend jusqu'au niveau 4 : « a) Les abattages contrôlés »,
  // « b) Rendement moyen viande / carcasse »…
  | { type: "titre"; niveau: 1 | 2 | 3 | 4; texte: string }
  /**
   * Zone de texte du canevas. `consigne` est la mention entre crochets du
   * document officiel ; elle indique au rédacteur ce qui est attendu.
   * `cle` identifie la zone de façon stable pour stocker le texte saisi.
   */
  | { type: "zoneTexte"; cle: string; consigne: string }
  | ({ type: "tableau" } & Tableau);

export interface SectionCanevas {
  /** Identifiant stable, pour la validation section par section. */
  cle: string;
  /** Intitulé tel qu'il figure au canevas. */
  titre: string;
  blocs: Bloc[];
}

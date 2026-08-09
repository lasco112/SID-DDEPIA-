/**
 * champsDerives.ts — cases du canevas qui ne se saisissent pas, mais se
 * déduisent d'un autre tableau.
 *
 * Règle métier (demande du DD) : l'effectif « élevage moderne » du tableau 1.2
 * correspond exactement aux fermes recensées nommément dans les tableaux 1.4
 * et 1.5. Le saisir une seconde fois à la main, c'est prendre le risque que
 * les deux tableaux se contredisent dans le rapport.
 *
 *   1.2 « Pondeuse — élevage moderne »     = Σ 1.4 « Effectif de pondeuses en début de mois »
 *   1.2 « Poulet chair — élevage moderne » = Σ 1.5 « Poulets présents en début de mois »
 *
 * La somme porte sur TOUS les établissements de l'arrondissement pour la
 * période de travail : le tableau 1.2 est un total d'arrondissement, 1.4 et
 * 1.5 sont des listes d'établissements.
 *
 * Ce fichier ne contient que la déclaration, sans dépendance : il est lu
 * aussi bien par l'appareil (calcul hors ligne, lib/derivationLocale.ts) que
 * par le serveur (recalcul après correction, server/derivation).
 */

export interface RegleChampDerive {
  /** Tableau MATRICE portant la case calculée. */
  templateCible: string;
  /** Case calculée. */
  champCible: string;
  /** Tableau NOMINATIF dont on somme les lignes. */
  templateSource: string;
  /** Champ sommé sur toutes les lignes du tableau source. */
  champSource: string;
  /** Phrase affichée à l'agent sous la case, pour qu'il sache d'où vient le chiffre. */
  explication: string;
}

export const CHAMPS_DERIVES: RegleChampDerive[] = [
  {
    templateCible: "T12",
    champCible: "T12_VOL_MOD_PONDEUSE",
    templateSource: "T14",
    champSource: "T14_PONDEUSES_DEBUT",
    explication:
      "Calculé automatiquement : somme des effectifs de pondeuses en début de mois déclarés au tableau 1.4 (Production d'œufs de table).",
  },
  {
    templateCible: "T12",
    champCible: "T12_VOL_MOD_POULET_CHAIR",
    templateSource: "T15",
    champSource: "T15_POULETS_DEBUT",
    explication:
      "Calculé automatiquement : somme des poulets présents en début de mois déclarés au tableau 1.5 (Production de poulets de chair).",
  },
];

/** Règle portant sur une case donnée, s'il y en a une. */
export function regleDuChamp(fieldCode: string): RegleChampDerive | undefined {
  return CHAMPS_DERIVES.find((r) => r.champCible === fieldCode);
}

/** Règles à recalculer lorsqu'un tableau vient d'être modifié. */
export function reglesAlimenteesPar(templateCode: string): RegleChampDerive[] {
  return CHAMPS_DERIVES.filter((r) => r.templateSource === templateCode);
}

/** Vrai si ce tableau contient au moins une case calculée. */
export function contientDesChampsDerives(templateCode: string): boolean {
  return CHAMPS_DERIVES.some((r) => r.templateCible === templateCode);
}

/** Règle dont ce champ, dans ce tableau, est la source à sommer. */
export function regleAlimenteeParLeChamp(templateCode: string, fieldCode: string): RegleChampDerive | undefined {
  return CHAMPS_DERIVES.find((r) => r.templateSource === templateCode && r.champSource === fieldCode);
}

/** Numéro affichable d'un tableau à partir de son code (T14 → 1.4). */
export function numeroTableau(code: string): string {
  const m = /^T(\d)(\d+)$/.exec(code);
  return m ? `${m[1]}.${m[2]}` : code;
}

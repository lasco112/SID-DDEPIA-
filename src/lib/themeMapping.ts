/**
 * themeMapping.ts — étiquetage explicite des 28 tableaux du canevas par
 * "espèce" pour le rapport thématique (fonction additionnelle DD, jamais
 * touchée : le bouton de génération du rapport mensuel classique reste
 * inchangé à tous les niveaux — voir rapport-thematique.ts).
 *
 * Étiquetage volontairement EXPLICITE plutôt qu'inféré depuis les codes de
 * champ : la convention de nommage du dictionnaire n'est pas uniforme
 * (ex. T21_ABAT_PORCIN vs T22_NBABAT_PORC — même espèce, suffixe différent),
 * une inférence automatique par correspondance de texte donnerait des
 * résultats faux ou incomplets. Vérifié tableau par tableau sur
 * canevasLayout.ts.
 *
 * ESPECE_TOUTES : deux pseudo-espèces (VOLAILLE_TOUTES, POISSON_TOUTES) pour
 * les tableaux qui suivent la volaille/le poisson en bloc plutôt que par
 * sous-espèce (1.2, 1.3-1.5, 1.6, 1.7, 2.1 colonne volaille...).
 */

import { suffixeDepuisCode } from "./categoriesStructurelles";

export const ESPECE_TOUTES_VOLAILLE = "VOLAILLE_TOUTES";
export const ESPECE_TOUTES_POISSON = "POISSON_TOUTES";

/** Options d'espèce "de bloc" à toujours proposer dans le filtre, en plus des ReferentielItem(ESPECE) réels. */
export const ESPECES_BLOC = [
  { code: ESPECE_TOUTES_VOLAILLE, libelle: "Volailles (toutes)" },
  { code: ESPECE_TOUTES_POISSON, libelle: "Poissons / pisciculture (tous)" },
];

type TagEspece =
  | { mode: "AUCUNE" } // pas de dimension espèce (fourrage, transformation générique, champs texte...)
  | { mode: "TABLE"; especes: string[] } // toute la table appartient à une (ou plusieurs) espèce(s)
  | { mode: "COLONNE"; parChamp: Record<string, string[]> } // un champ MATRICE précis → 1+ espèce(s)
  | { mode: "COLONNE_PREFIXE"; prefixe: string } // champs dynamiques (T11/T17, extensibles via validation DD) : suffixe de code = suffixe du code espèce (ESP_BOVIN → BOVIN)
  | { mode: "REF_EVENEMENT"; cle: string }; // tableau ÉVÉNEMENT : filtrer sur payload[cle] === code espèce référentiel

/** Normalise un code espèce sélectionné dans le filtre ("ESP_PORCIN", "VOLAILLE_TOUTES"...) en suffixe comparable aux tags ci-dessous ("PORCIN", "VOLAILLE"). */
export function suffixeEspeceFiltre(code: string): string {
  if (code === ESPECE_TOUTES_VOLAILLE) return "VOLAILLE";
  if (code === ESPECE_TOUTES_POISSON) return "POISSON";
  return suffixeDepuisCode(code); // "ESP_PORCIN" -> "PORCIN"
}

export const THEME_ESPECE: Record<string, TagEspece> = {
  T11: { mode: "COLONNE_PREFIXE", prefixe: "T11_CHEPTEL_" },
  T12: { mode: "TABLE", especes: ["VOLAILLE"] },
  T13: { mode: "TABLE", especes: ["VOLAILLE"] },
  T14: { mode: "TABLE", especes: ["VOLAILLE"] },
  T15: { mode: "TABLE", especes: ["VOLAILLE"] },
  T16: { mode: "TABLE", especes: ["POISSON"] },
  T17: { mode: "TABLE", especes: ["POISSON"] },

  T21: {
    mode: "COLONNE",
    parChamp: {
      T21_ABAT_BOVIN: ["BOVIN"],
      T21_ABAT_OVIN: ["OVIN"],
      T21_ABAT_CAPRIN: ["CAPRIN"],
      T21_ABAT_PORCIN: ["PORCIN"],
      T21_ABAT_VOLAILLE: ["VOLAILLE"],
    },
  },
  T22: {
    mode: "COLONNE",
    parChamp: {
      T22_NBABAT_BOVIN: ["BOVIN"],
      T22_NBABAT_OVIN: ["OVIN"],
      T22_NBABAT_CAPRIN: ["CAPRIN"],
      T22_NBABAT_PORC: ["PORCIN"],
      T22_NBABAT_VOLAILLE: ["VOLAILLE"],
      T22_VIANDE_BOVIN: ["BOVIN"],
      T22_VIANDE_OVIN: ["OVIN"],
      T22_VIANDE_CAPRIN: ["CAPRIN"],
      T22_VIANDE_PORC: ["PORCIN"],
      T22_VIANDE_VOLAILLE: ["VOLAILLE"],
      T22_ABATS_BOVIN: ["BOVIN"],
      T22_ABATS_OVIN: ["OVIN"],
      T22_ABATS_CAPRIN: ["CAPRIN"],
      T22_ABATS_PORC: ["PORCIN"],
      T22_ABATS_VOLAILLE: ["VOLAILLE"],
    },
  },
  T23: {
    mode: "COLONNE",
    parChamp: {
      T23_PROV_POULET_CHAIR: ["VOLAILLE"],
      T23_PROV_POULET_PONTE: ["VOLAILLE"],
      T23_PROV_PORC: ["PORCIN"],
      T23_PROV_BOVIN: ["BOVIN"],
      T23_PROV_POISSON: ["POISSON"],
    },
  },
  T24: { mode: "AUCUNE" },
  T25: {
    mode: "COLONNE",
    parChamp: {
      T25_PEAUX_BOVIN: ["BOVIN"],
      T25_PEAUX_PETITS_RUM: ["OVIN", "CAPRIN"],
    },
  },
  T26: { mode: "AUCUNE" },

  T31: { mode: "AUCUNE" },
  T32: { mode: "REF_EVENEMENT", cle: "espece" },
  T33: { mode: "REF_EVENEMENT", cle: "espece" },
  T34: {
    mode: "COLONNE",
    parChamp: {
      T34_INSP_ABATS_BOVINS: ["BOVIN"],
      T34_SAISIE_ABATS_BOVINS: ["BOVIN"],
      T34_INSP_VIANDE_BOVINE_FRAICHE: ["BOVIN"],
      T34_SAISIE_VIANDE_BOVINE_FRAICHE: ["BOVIN"],
      T34_INSP_VIANDE_PETITS_RUM: ["OVIN", "CAPRIN"],
      T34_SAISIE_VIANDE_PETITS_RUM: ["OVIN", "CAPRIN"],
      T34_INSP_VIANDE_PORCINE: ["PORCIN"],
      T34_SAISIE_VIANDE_PORCINE: ["PORCIN"],
      T34_INSP_VIANDE_VOLAILLE: ["VOLAILLE"],
      T34_SAISIE_VIANDE_VOLAILLE: ["VOLAILLE"],
      T34_INSP_POISSON_FRAIS: ["POISSON"],
      T34_SAISIE_POISSON_FRAIS: ["POISSON"],
      T34_INSP_POISSON_FUME: ["POISSON"],
      T34_SAISIE_POISSON_FUME: ["POISSON"],
      T34_INSP_POISSON_CONGELE: ["POISSON"],
      T34_SAISIE_POISSON_CONGELE: ["POISSON"],
    },
  },
  T35: { mode: "AUCUNE" },

  T41: { mode: "REF_EVENEMENT", cle: "espece" },
  T42: { mode: "REF_EVENEMENT", cle: "espece" },
  T43: { mode: "REF_EVENEMENT", cle: "espece" },
  T44: { mode: "AUCUNE" }, // especeOuProduit est un champ texte libre, pas une référence fiable

  T51: { mode: "TABLE", especes: ["BOVIN"] },
  T52: { mode: "TABLE", especes: ["OVIN"] },
  T53: { mode: "TABLE", especes: ["CAPRIN"] },
  T54: { mode: "TABLE", especes: ["PORCIN"] },
  T55: { mode: "TABLE", especes: ["VOLAILLE"] },
  T56: { mode: "TABLE", especes: ["ASIN", "EQUIN"] },
};

/**
 * Un champ MATRICE (code de FormField) appartient-il à l'espèce demandée ?
 * especeSuffixes : les suffixes déjà normalisés (ex. ["PORCIN"]) des espèces sélectionnées dans le filtre.
 */
export function champCorrespondEspece(tableCode: string, champCode: string, especeSuffixes: string[]): boolean {
  const tag = THEME_ESPECE[tableCode];
  if (!tag) return false;
  switch (tag.mode) {
    case "AUCUNE":
      return false;
    case "TABLE":
      return tag.especes.some((e) => especeSuffixes.includes(e));
    case "COLONNE":
      return (tag.parChamp[champCode] ?? []).some((e) => especeSuffixes.includes(e));
    case "COLONNE_PREFIXE":
      if (!champCode.startsWith(tag.prefixe)) return false;
      return especeSuffixes.includes(champCode.slice(tag.prefixe.length));
    case "REF_EVENEMENT":
      return false; // géré séparément pour les tableaux ÉVÉNEMENT (voir evenementCorrespondEspece)
  }
}

/** Une table entière (sans distinction de colonne) est-elle concernée par au moins une des espèces demandées ? */
export function tableCorrespondEspece(tableCode: string, especeSuffixes: string[]): boolean {
  const tag = THEME_ESPECE[tableCode];
  if (!tag) return false;
  if (tag.mode === "TABLE") return tag.especes.some((e) => especeSuffixes.includes(e));
  if (tag.mode === "COLONNE") return Object.values(tag.parChamp).some((es) => es.some((e) => especeSuffixes.includes(e)));
  if (tag.mode === "COLONNE_PREFIXE") return true; // dépend des champs réels en base, vérifié champ par champ à l'agrégation
  return false;
}

/** Tableau ÉVÉNEMENT : la clé de payload à comparer (ex. "espece") pour ce tableau, si applicable. */
export function cleRefEvenement(tableCode: string): string | undefined {
  const tag = THEME_ESPECE[tableCode];
  return tag?.mode === "REF_EVENEMENT" ? tag.cle : undefined;
}

/** Tableau ÉVÉNEMENT : la valeur brute de payload (code référentiel, ex. "ESP_PORCIN") correspond-elle à l'espèce demandée ? */
export function refCorrespondEspece(payloadValeurBrute: unknown, especeSuffixes: string[]): boolean {
  if (typeof payloadValeurBrute !== "string" || !payloadValeurBrute) return false;
  return especeSuffixes.includes(suffixeDepuisCode(payloadValeurBrute));
}

export function tableSuitEspece(tableCode: string): boolean {
  const tag = THEME_ESPECE[tableCode];
  return !!tag && tag.mode !== "AUCUNE";
}

export function modeEspece(tableCode: string): TagEspece["mode"] | undefined {
  return THEME_ESPECE[tableCode]?.mode;
}

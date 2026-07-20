/**
 * categoriesStructurelles.ts — catégories de référentiel qui, une fois
 * validées par le DD, créent automatiquement de nouvelles colonnes dans les
 * tableaux MATRICE du canevas (au lieu de rester une simple liste de menu
 * déroulant). C'est pourquoi elles passent par un circuit d'approbation,
 * contrairement aux autres catégories (maladies, vaccins...) qui restent
 * immédiatement effectives.
 *
 * Portée volontairement limitée à ESPECE (1.1), VOLAILLE (1.2),
 * ESPECE_HALIEUTIQUE (1.7) — CATEGORIE_ANIMALE (5.x) est exclue pour l'instant
 * : elle nécessiterait de savoir à quelle espèce (bovin/ovin/...) rattacher
 * une nouvelle catégorie, une métadonnée qui n'existe pas encore.
 */

export interface MappingChamp {
  templateCode: string;
  codePrefix: string; // ex. "T11_CHEPTEL_" — le suffixe vient du code du référentiel (ESP_BOVIN -> BOVIN)
  typeValeur: "ENTIER" | "DECIMAL";
  uniteCode: string;
  libelleSuffixe?: string; // ex. " (alevins)" pour distinguer deux champs générés depuis le même item
}

export const CATEGORIES_STRUCTURELLES: Record<string, MappingChamp[]> = {
  ESPECE: [{ templateCode: "T11", codePrefix: "T11_CHEPTEL_", typeValeur: "ENTIER", uniteCode: "UNITE_TETE" }],
  VOLAILLE: [
    { templateCode: "T12", codePrefix: "T12_VOL_MOD_", typeValeur: "ENTIER", uniteCode: "UNITE_TETE", libelleSuffixe: " (élevage moderne)" },
    { templateCode: "T12", codePrefix: "T12_VOL_TRAD_", typeValeur: "ENTIER", uniteCode: "UNITE_TETE", libelleSuffixe: " (élevage traditionnel)" },
  ],
  ESPECE_HALIEUTIQUE: [
    { templateCode: "T17", codePrefix: "T17_ALEVINS_", typeValeur: "ENTIER", uniteCode: "UNITE_UNITE", libelleSuffixe: " (production d'alevins)" },
    { templateCode: "T17", codePrefix: "T17_POISSON_", typeValeur: "DECIMAL", uniteCode: "UNITE_TONNE", libelleSuffixe: " (production de poissons)" },
  ],
};

/** Dérive le suffixe de code à partir du code du référentiel : "ESP_BOVIN" -> "BOVIN". */
export function suffixeDepuisCode(code: string): string {
  const i = code.indexOf("_");
  return i === -1 ? code : code.slice(i + 1);
}

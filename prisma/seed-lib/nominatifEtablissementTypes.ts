/**
 * Association FormTemplate (famille NOMINATIF) → type d'établissement du
 * registre (ReferentielItem catégorie TYPE_ETABLISSEMENT). Donnée par les
 * notes du dictionnaire de données (colonne "Libellé à corriger" des lignes
 * d'en-tête de tableau), déclarée ici une fois pour toutes plutôt que
 * reparsée depuis du texte libre.
 */
export const NOMINATIF_ETABLISSEMENT_TYPE: Record<string, string> = {
  T13: "ETAB_COUVOIR", // 1.3 Production locale de poussins d'un jour
  T14: "ETAB_FERME_PONTE", // 1.4 Production d'œufs de table
  T15: "ETAB_FERME_CHAIR", // 1.5 Production de poulets de chair
  T23: "ETAB_PROVENDERIE", // 2.3 Production et consommation de provende
};

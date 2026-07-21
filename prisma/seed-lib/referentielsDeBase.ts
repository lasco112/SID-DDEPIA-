/**
 * referentielsDeBase.ts — listes de référentiels de démarrage (espèces,
 * maladies, vaccins, actes vétérinaires, motifs de saisie, types
 * d'établissement), partagées entre le seed de production (seed.ts) et le
 * seed de démonstration (seed-demo.ts) pour qu'elles ne divergent jamais.
 */

export const ESPECES = [
  ["ESP_BOVIN", "Bovins"], ["ESP_OVIN", "Ovins"], ["ESP_CAPRIN", "Caprins"],
  ["ESP_PORCIN", "Porcins"], ["ESP_CAMELIN", "Camelins"], ["ESP_ASIN", "Asins"],
  ["ESP_EQUIN", "Equins"], ["ESP_CANIN", "Canins"], ["ESP_LAPIN", "Lapins"],
  ["ESP_AULACODE", "Aulacodes"], ["ESP_FELIN", "Félins"], ["ESP_COBAYE", "Cobayes"],
  ["ESP_PRIMATE", "Primates"],
] as const;

export const MALADIES = [
  ["MAL_PPR", "Peste des petits ruminants"],
  ["MAL_FIEVRE_APHTEUSE", "Fièvre aphteuse"],
  ["MAL_PESTE_PORCINE_AFRICAINE", "Peste porcine africaine"],
  ["MAL_NEWCASTLE", "Maladie de Newcastle"],
  ["MAL_CHARBON_BACTERIDIEN", "Charbon bactéridien"],
  ["MAL_PASTEURELLOSE", "Pasteurellose"],
  ["MAL_RAGE", "Rage"],
  ["MAL_TRYPANOSOMOSE", "Trypanosomose"],
  ["MAL_DERMATOSE_NODULAIRE", "Dermatose nodulaire contagieuse"],
  ["MAL_CLAVELEE", "Clavelée"],
  ["MAL_COLIBACILLOSE_AVIAIRE", "Colibacillose aviaire"],
  ["MAL_COCCIDIOSE", "Coccidiose"],
  ["MAL_GUMBORO", "Maladie de Gumboro"],
  ["MAL_AUTRE", "Autre maladie"],
] as const;

export const VACCINS = [
  ["VAC_PPR", "Vaccin PPR"],
  ["VAC_NEWCASTLE", "Vaccin Newcastle"],
  ["VAC_CHARBON_BACTERIDIEN", "Vaccin charbon bactéridien"],
  ["VAC_PASTEURELLOSE", "Vaccin pasteurellose"],
  ["VAC_RAGE", "Vaccin antirabique"],
  ["VAC_GUMBORO", "Vaccin Gumboro"],
  ["VAC_CLAVELEE", "Vaccin clavelée"],
] as const;

export const ACTES_VETERINAIRES = [
  ["ACTE_CONSULTATION", "Consultation"],
  ["ACTE_DEPARASITAGE", "Déparasitage"],
  ["ACTE_CASTRATION", "Castration"],
  ["ACTE_VACCINATION_PRIVEE", "Vaccination (privé)"],
  ["ACTE_CHIRURGIE", "Chirurgie"],
  ["ACTE_VELAGE_ASSISTE", "Vêlage assisté"],
  ["ACTE_AUTRE", "Autre acte"],
] as const;

export const MOTIFS_SAISIE = [
  ["MOTIF_TUBERCULOSE", "Tuberculose"],
  ["MOTIF_CYSTICERCOSE", "Cysticercose"],
  ["MOTIF_DISTOMATOSE", "Distomatose"],
  ["MOTIF_PUTREFACTION", "Putréfaction"],
  ["MOTIF_ABCES_GENERALISE", "Abcès généralisé"],
  ["MOTIF_CACHEXIE", "Cachexie"],
  ["MOTIF_AUTRE", "Autre motif"],
] as const;

export const TYPES_ETABLISSEMENT = [
  ["ETAB_COUVOIR", "Couvoir"],
  ["ETAB_FERME_PONTE", "Ferme de ponte"],
  ["ETAB_FERME_CHAIR", "Ferme de poulets de chair"],
  ["ETAB_PROVENDERIE", "Provenderie"],
  ["ETAB_ABATTOIR", "Abattoir"],
  ["ETAB_AIRE_ABATTAGE", "Aire d'abattage aménagée"],
  ["ETAB_MARCHE", "Marché à bétail"],
  ["ETAB_ETANG", "Étang piscicole"],
  ["ETAB_CLINIQUE_PRIVEE", "Clinique vétérinaire privée"],
] as const;

export const GROUPES_REFERENTIELS: Array<{ categorie: string; items: readonly (readonly [string, string])[] }> = [
  { categorie: "ESPECE", items: ESPECES },
  { categorie: "MALADIE", items: MALADIES },
  { categorie: "VACCIN", items: VACCINS },
  { categorie: "ACTE_VETERINAIRE", items: ACTES_VETERINAIRES },
  { categorie: "MOTIF_SAISIE", items: MOTIFS_SAISIE },
  { categorie: "TYPE_ETABLISSEMENT", items: TYPES_ETABLISSEMENT },
];

export const ARRONDISSEMENTS = [
  { code: "DSC", nom: "Dschang", ordre: 1 },
  { code: "FOK", nom: "Fokoué", ordre: 2 },
  { code: "FGT", nom: "Fongo-Tongo", ordre: 3 },
  { code: "NKN", nom: "Nkong-Ni", ordre: 4 },
  { code: "PKM", nom: "Penka-Michel", ordre: 5 },
  { code: "STC", nom: "Santchou", ordre: 6 },
] as const;

export const SECTIONS = [
  { code: "BAC", nom: "Bureau des Affaires Communes", ordre: 1 },
  { code: "PSA", nom: "Productions et Statistiques Animales", ordre: 2 },
  { code: "SSV", nom: "Services Vétérinaires", ordre: 3 },
  { code: "SPAIH", nom: "Pêches, Aquaculture et Industries Halieutiques", ordre: 4 },
] as const;

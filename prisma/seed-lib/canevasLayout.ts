/**
 * canevasLayout.ts — Description fidèle de la mise en page de chaque tableau
 * du canevas officiel (CANEVAS STAT MENOUA.doc, transcription exacte fournie
 * par le DD). Source unique de vérité partagée par les générateurs de
 * templates et les moteurs d'agrégation : ne JAMAIS réorganiser un tableau
 * sans mettre à jour tous les consommateurs.
 *
 * Principe (demande explicite du DD) : chaque tableau du rapport généré doit
 * reprendre EXACTEMENT l'organisation lignes/colonnes du canevas papier — pas
 * une présentation uniforme "lignes = indicateurs, colonnes = arrondissements".
 */

export interface ColDef {
  code: string; // code FormField (ou clé de payload événement)
  label: string;
  texte?: boolean; // champ typeValeur=TEXTE (ex. T21_LIEUX) : valeur par arrondissement, jamais sommée
}

export type TableLayout =
  // Lignes = 6 arrondissements + TOTAL + TOTAL MOIS PRÉCÉDENT ; colonnes = 1 champ par catégorie.
  // groups : en-tête à 2 niveaux du canevas (ex. 2.6 "Viande"/"Lait"/"Peaux"/"Cuirs"/"Poisson fumé"
  // regroupant les colonnes ci-dessous) — chaque span doit correspondre à des cols consécutifs.
  | { kind: "ARR_ROWS"; cols: ColDef[]; groups?: { label: string; span: number }[] }
  // Comme ARR_ROWS mais avec un sous-groupe de lignes par arrondissement (ex : régime moderne/traditionnel).
  | { kind: "ARR_ROWS_GROUPED"; subRows: { label: string; cols: ColDef[] }[] }
  // Tableau départemental unique (pas de colonne par arrondissement), lignes = catégories fixes.
  // showTotalRow : le canevas ajoute une ligne "Total Mois Courant"/"Total Mois Précédent" = somme des lignes.
  | { kind: "DEPT_TABLE"; colHeaders: string[]; rows: { label: string; codes: (string | null)[] }[]; showTotalRow?: boolean }
  // Comme DEPT_TABLE mais avec doublement des colonnes (mois courant / mois précédent), pas de ligne total (canevas).
  // unite : colonne "Unité de Mesure" dédiée du canevas (3.4) — jamais concaténée dans le libellé du produit.
  | { kind: "DEPT_TABLE_PREC"; colHeaders: string[]; rows: { label: string; unite?: string; codes: (string | null)[] }[] }
  // Section 5 (commercialisation) : en-tête à 3 niveaux du canevas — Catégories/Prix moyen fusionnés
  // verticalement sur les 3 lignes, "Nombre (Mois courant)" scindé en MIS EN VENTE/VENDUS puis décades.
  | { kind: "COMMERCIALISATION"; rows: { label: string; codes: string[] }[] }
  // Lignes dynamiques = un établissement par ligne (boucle docxtemplater), avec Nom + Localité.
  | { kind: "NOMINATIF_LOOP"; cols: ColDef[] }
  // Lignes dynamiques = un événement par ligne (boucle docxtemplater).
  // numeric : colonnes sommables pour la ligne "Total Mois Courant/Précédent" du canevas (entier/décimal) ; absent = texte/référentiel, non sommé.
  | { kind: "EVENEMENT_LOOP"; cols: { key: string; label: string; ref?: string; numeric?: boolean }[] }
  // Cas particuliers non génériques.
  | { kind: "T16_SPECIAL" }
  | { kind: "T17_SPECIAL" };

export const CANEVAS_LAYOUTS: Record<string, TableLayout> = {
  T11: {
    kind: "ARR_ROWS",
    cols: [
      { code: "T11_CHEPTEL_BOVIN", label: "Bovins" },
      { code: "T11_CHEPTEL_OVIN", label: "Ovins" },
      { code: "T11_CHEPTEL_CAPRIN", label: "Caprins" },
      { code: "T11_CHEPTEL_PORCIN", label: "Porcins" },
      { code: "T11_CHEPTEL_CAMELIN", label: "Camelins" },
      { code: "T11_CHEPTEL_ASIN", label: "Asins" },
      { code: "T11_CHEPTEL_EQUIN", label: "Equins" },
      { code: "T11_CHEPTEL_CANIN", label: "Canins" },
      { code: "T11_CHEPTEL_LAPIN", label: "Lapins" },
      { code: "T11_CHEPTEL_AULACODE", label: "Aulacodes" },
      { code: "T11_CHEPTEL_FELIN", label: "Félins" },
      { code: "T11_CHEPTEL_COBAYE", label: "Cobayes" },
      { code: "T11_CHEPTEL_PRIMATE", label: "Primates" },
    ],
  },

  T12: {
    kind: "ARR_ROWS_GROUPED",
    subRows: [
      {
        label: "Elevage moderne",
        cols: [
          { code: "T12_VOL_MOD_POULET_CHAIR", label: "Poulet de chair" },
          { code: "T12_VOL_MOD_PONDEUSE", label: "Pondeuse" },
          { code: "T12_VOL_MOD_POULET_VILLAGEOIS", label: "Poulet villageois" },
          { code: "T12_VOL_MOD_CANARD", label: "Canard" },
          { code: "T12_VOL_MOD_OIE", label: "Oies" },
          { code: "T12_VOL_MOD_DINDE", label: "Dinde" },
          { code: "T12_VOL_MOD_CAILLE", label: "Caille" },
          { code: "T12_VOL_MOD_PIGEON", label: "Pigeon" },
          { code: "T12_VOL_MOD_PINTADE", label: "Pintade" },
          { code: "T12_VOL_MOD_PAON", label: "Paon" },
        ],
      },
      {
        label: "Elevage traditionnel",
        cols: [
          { code: "T12_VOL_TRAD_POULET_CHAIR", label: "Poulet de chair" },
          { code: "T12_VOL_TRAD_PONDEUSE", label: "Pondeuse" },
          { code: "T12_VOL_TRAD_POULET_VILLAGEOIS", label: "Poulet villageois" },
          { code: "T12_VOL_TRAD_CANARD", label: "Canard" },
          { code: "T12_VOL_TRAD_OIE", label: "Oies" },
          { code: "T12_VOL_TRAD_DINDE", label: "Dinde" },
          { code: "T12_VOL_TRAD_CAILLE", label: "Caille" },
          { code: "T12_VOL_TRAD_PIGEON", label: "Pigeon" },
          { code: "T12_VOL_TRAD_PINTADE", label: "Pintade" },
          { code: "T12_VOL_TRAD_PAON", label: "Paon" },
        ],
      },
    ],
  },

  T13: {
    kind: "NOMINATIF_LOOP",
    cols: [
      { code: "T13_REPRO_PONTE_DEBUT", label: "Reproducteurs présents début (ponte)" },
      { code: "T13_REPRO_CHAIR_DEBUT", label: "Reproducteurs présents début (chair)" },
      { code: "T13_OEUFS_COUVER_PONTE", label: "Œufs à couver produits (ponte)" },
      { code: "T13_OEUFS_COUVER_CHAIR", label: "Œufs à couver produits (chair)" },
      { code: "T13_POUSSINS_PONTE", label: "Poussins d'un jour produits (ponte)" },
      { code: "T13_POUSSINS_CHAIR", label: "Poussins d'un jour produits (chair)" },
    ],
  },

  T14: {
    kind: "NOMINATIF_LOOP",
    cols: [
      { code: "T14_PONDEUSES_DEBUT", label: "Effectif de pondeuses présentes au début du mois" },
      { code: "T14_POULES_REFORMEES", label: "Effectif de poules réformées au cours du mois" },
      { code: "T14_OEUFS_PRODUITS", label: "Nombre d'œufs produits au cours du mois" },
    ],
  },

  T15: {
    kind: "NOMINATIF_LOOP",
    cols: [
      { code: "T15_POULETS_DEBUT", label: "Nombre de poulets présents au début du mois" },
      { code: "T15_POULETS_SORTIS", label: "Nombre de poulets sortis au cours du mois" },
    ],
  },

  T16: { kind: "T16_SPECIAL" },
  T17: { kind: "T17_SPECIAL" },

  T21: {
    kind: "ARR_ROWS",
    cols: [
      { code: "T21_LIEUX", label: "Lieux", texte: true },
      { code: "T21_ABAT_BOVIN", label: "Bovins" },
      { code: "T21_ABAT_OVIN", label: "Ovins" },
      { code: "T21_ABAT_CAPRIN", label: "Caprins" },
      { code: "T21_ABAT_PORCIN", label: "Porcins" },
      { code: "T21_ABAT_VOLAILLE", label: "Volailles" },
    ],
  },

  T22: {
    kind: "ARR_ROWS_GROUPED",
    subRows: [
      {
        label: "Nombre d'animaux abattus",
        cols: [
          { code: "T22_NBABAT_BOVIN", label: "Bovin" },
          { code: "T22_NBABAT_OVIN", label: "Ovin" },
          { code: "T22_NBABAT_CAPRIN", label: "Caprin" },
          { code: "T22_NBABAT_PORC", label: "Porc" },
          { code: "T22_NBABAT_VOLAILLE", label: "Volaille" },
        ],
      },
      {
        label: "Viande",
        cols: [
          { code: "T22_VIANDE_BOVIN", label: "Bovin" },
          { code: "T22_VIANDE_OVIN", label: "Ovin" },
          { code: "T22_VIANDE_CAPRIN", label: "Caprin" },
          { code: "T22_VIANDE_PORC", label: "Porc" },
          { code: "T22_VIANDE_VOLAILLE", label: "Volaille" },
        ],
      },
      {
        label: "Abats",
        cols: [
          { code: "T22_ABATS_BOVIN", label: "Bovin" },
          { code: "T22_ABATS_OVIN", label: "Ovin" },
          { code: "T22_ABATS_CAPRIN", label: "Caprin" },
          { code: "T22_ABATS_PORC", label: "Porc" },
          { code: "T22_ABATS_VOLAILLE", label: "Volaille" },
        ],
      },
    ],
  },

  T23: {
    kind: "NOMINATIF_LOOP",
    cols: [
      { code: "T23_PROV_POULET_CHAIR", label: "Poulet chair" },
      { code: "T23_PROV_POULET_PONTE", label: "Poulet ponte" },
      { code: "T23_PROV_PORC", label: "Porc" },
      { code: "T23_PROV_BOVIN", label: "Bovins" },
      { code: "T23_PROV_POISSON", label: "Poisson" },
    ],
  },

  T24: {
    kind: "DEPT_TABLE",
    colHeaders: ["Nombre de champs fourragers", "Superficie totale (ha)", "Production de foin estimée (T)"],
    showTotalRow: true,
    rows: [
      { label: "Bracharia", codes: ["T24_BRACHARIA_NBCHAMPS", "T24_BRACHARIA_SUPERFICIE", "T24_BRACHARIA_FOIN"] },
      { label: "Stylosanthèse", codes: ["T24_STYLOSANTHES_NBCHAMPS", "T24_STYLOSANTHES_SUPERFICIE", "T24_STYLOSANTHES_FOIN"] },
      { label: "Guatemala", codes: ["T24_GUATEMALA_NBCHAMPS", "T24_GUATEMALA_SUPERFICIE", "T24_GUATEMALA_FOIN"] },
    ],
  },

  T25: {
    kind: "ARR_ROWS",
    cols: [
      { code: "T25_LAIT_FRAIS", label: "Lait frais (litres)" },
      { code: "T25_PEAUX_BOVIN", label: "Cuirs et peaux — bovins" },
      { code: "T25_PEAUX_PETITS_RUM", label: "Cuirs et peaux — petits ruminants" },
      { code: "T25_MIEL", label: "Miel (litres)" },
    ],
  },

  T26: {
    kind: "ARR_ROWS",
    groups: [
      { label: "Viande", span: 2 },
      { label: "Lait", span: 4 },
      { label: "Peaux", span: 1 },
      { label: "Cuirs", span: 1 },
      { label: "Poisson fumé", span: 1 },
    ],
    cols: [
      { code: "T26_VIANDE_BRAISEE", label: "Braisé (kg)" },
      { code: "T26_VIANDE_FUMEE", label: "Fumé (kg)" },
      { code: "T26_LAIT_CAILLE", label: "Caillé (litre)" },
      { code: "T26_YAOURT", label: "Yaourt (litre)" },
      { code: "T26_BEURRE", label: "Beurre (kg)" },
      { code: "T26_FROMAGE", label: "Fromage (kg)" },
      { code: "T26_PEAUX_TRANSF", label: "(unité)" },
      { code: "T26_CUIRS_TRANSF", label: "(unité)" },
      { code: "T26_POISSON_FUME", label: "(T)" },
    ],
  },

  T31: {
    kind: "EVENEMENT_LOOP",
    cols: [
      { key: "maladie", label: "Maladie", ref: "MALADIE" },
      { key: "localisation", label: "Localisation" },
      { key: "nbFoyers", label: "Nombre de foyers", numeric: true },
      { key: "effectifTouche", label: "Effectif touché", numeric: true },
      { key: "morts", label: "Animaux morts", numeric: true },
      { key: "mesurePrise", label: "Mesure prise" },
      { key: "animauxSaisis", label: "Animaux saisis", numeric: true },
    ],
  },

  T32: {
    kind: "EVENEMENT_LOOP",
    cols: [
      { key: "maladie", label: "Maladie", ref: "MALADIE" },
      { key: "espece", label: "Espèces", ref: "ESPECE" },
      { key: "vaccin", label: "Vaccin utilisé", ref: "VACCIN" },
      { key: "effectifVaccine", label: "Effectifs vaccinés", numeric: true },
      { key: "localites", label: "Localités" },
    ],
  },

  T33: {
    kind: "EVENEMENT_LOOP",
    cols: [
      { key: "activite", label: "Activité", ref: "ACTE_VETERINAIRE" },
      { key: "espece", label: "Espèce", ref: "ESPECE" },
      { key: "maladie", label: "Maladie", ref: "MALADIE" },
      { key: "effectif", label: "Effectif", numeric: true },
    ],
  },

  T35: {
    kind: "EVENEMENT_LOOP",
    cols: [
      { key: "affection", label: "Affections", ref: "MOTIF_SAISIE" },
      { key: "produitSaisi", label: "Produits saisis" },
      { key: "quantiteKg", label: "Quantités saisies en Kg", numeric: true },
      { key: "coutPerteFCFA", label: "Coût de la perte", numeric: true },
    ],
  },

  T41: {
    kind: "EVENEMENT_LOOP",
    cols: [
      { key: "espece", label: "Espèces", ref: "ESPECE" },
      { key: "destination", label: "Destination" },
      { key: "effectif", label: "Effectifs", numeric: true },
    ],
  },

  T42: {
    kind: "EVENEMENT_LOOP",
    cols: [
      { key: "espece", label: "Espèces", ref: "ESPECE" },
      { key: "paysOrigine", label: "Pays d'origine" },
      { key: "effectif", label: "Effectifs", numeric: true },
    ],
  },

  T43: {
    kind: "EVENEMENT_LOOP",
    cols: [
      { key: "espece", label: "Espèces", ref: "ESPECE" },
      { key: "paysProvenance", label: "Pays de Provenance" },
      { key: "paysDestination", label: "Pays de Destination" },
      { key: "effectif", label: "Effectif", numeric: true },
    ],
  },

  T44: {
    kind: "EVENEMENT_LOOP",
    cols: [
      { key: "especeOuProduit", label: "Espèces" },
      { key: "pointDepart", label: "Point de départ" },
      { key: "destination", label: "Destination" },
      { key: "modeDeplacement", label: "Mode de déplacement" },
      { key: "effectif", label: "Effectifs", numeric: true },
    ],
  },

  T34: {
    kind: "DEPT_TABLE_PREC",
    colHeaders: ["Quantité Inspectée", "Quantité Saisie"],
    rows: [
      ["ABATS_BOVINS", "Abats Bovins", "T"],
      ["VIANDE_BOVINE_FRAICHE", "Viande Bovine fraiche", "T"],
      ["VIANDE_FUMEE", "Viande Fumée", "T"],
      ["VIANDE_BRAISEE", "Viande Braisée", "KG"],
      ["VIANDE_PETITS_RUM", "Viande des Petits Ruminants", "T"],
      ["VIANDE_PORCINE", "Viande Porcine", "T"],
      ["VIANDE_VOLAILLE", "Viande Volaille", "T"],
      ["POISSON_FRAIS", "Poissons Frais", "T"],
      ["POISSON_FUME", "Poissons Fumés", "T"],
      ["POISSON_CONGELE", "Poissons congelés", "T"],
      ["GIBIER_FRAIS", "Gibiers frais", "T"],
      ["CONSERVES_POISSON", "Conserves de Poissons", "BOITE"],
      ["LAIT_CONCENTRE", "Lait concentré", "BOITE"],
      ["LAIT_POUDRE", "Lait en poudre", "T"],
      ["LAIT_FRAIS", "Lait frais", "L"],
      ["LAIT_CAILLE", "Lait caillée", "L"],
      ["MAYONNAISE", "Mayonnaise", "BOITE"],
      ["BISCUITS_LAIT", "Biscuits au lait", "PAQUET"],
      ["BEURRE", "Beurre", "BOITE (1KG)"],
      ["OEUFS", "Œufs", "ALVEOLES"],
      ["MIEL", "Miel", "LITRE"],
      ["JAMBON", "Jambon", "KG"],
      ["GIBIER_FUME", "Gibier fumé", "KG"],
      ["ECREVISSES", "Ecrevisses", "KG"],
      ["SAUCISSES", "Saucisses", "KG"],
      ["FROMAGES", "Fromages", "KG"],
      ["YAOURT", "Yaourt", "POT"],
      ["GLACE_LAIT", "Glace au lait", "L"],
      ["SARDINES", "Sardines", "BOITE"],
      ["CRUSTACES", "Crustacés", "KG"],
      ["PEAUX", "Peaux", "UNITE"],
      ["CUIRS", "Cuirs", "UNITE"],
      ["PROVENDE_CHAIR", "Provende chair", "T"],
      ["PROVENDE_PONTE", "Provende Ponte", "T"],
      ["PROVENDE_PORC", "Provende Porc", "T"],
      ["TOURTEAU_SOJA", "Tourteau soja", "T"],
      ["TOURTEAU_COTON", "Tourteau coton", "T"],
      ["TOURTEAU_ARACHIDE", "Tourteau arachide", "T"],
      ["FARINE_POISSON", "Farine poisson", "T"],
      ["ALIMENT_POISSON", "Aliment poisson", "T"],
      ["REMOULAGE", "Remoulage", "T"],
      ["CONCENTRE", "Concentré", "T"],
    ].map(([suffix, label, unite]) => ({ label, unite, codes: [`T34_INSP_${suffix}`, `T34_SAISIE_${suffix}`] })),
  },

  T51: commercialisationLayout("T51", "BOVIN", [
    ["TAURILLON", "Taurillons"],
    ["GENISSE", "Génisses"],
    ["CASTRE", "Castrés"],
    ["TAUREAU", "Taureaux"],
    ["VACHE", "Vaches"],
    ["VEAU", "Veaux"],
  ]),
  T52: commercialisationLayout("T52", "OVIN", [
    ["BELIER", "Béliers"],
    ["BREBIS", "Brebis"],
    ["CASTRE", "Castrés"],
    ["AGNEAU", "Agneaux"],
  ]),
  T53: commercialisationLayout("T53", "CAPRIN", [
    ["BOUC", "Boucs"],
    ["CHEVRE", "Chèvres"],
    ["CASTRE", "Castrés"],
    ["CHEVREAU", "Chevreaux"],
  ]),
  T54: commercialisationLayout("T54", "PORCIN", [
    ["VERRAT", "Verrats"],
    ["TRUIE", "Truies"],
    ["CASTRE", "Castrés"],
    ["PORCELET", "Porcelets"],
  ]),
  T55: commercialisationLayout("T55", "VOLAILLE", [
    ["POULET_CHAIR", "Poulet de chair"],
    ["PONDEUSE", "Pondeuse"],
    ["POULET_VILLAGEOIS", "Poulet villageois"],
    ["CANARD", "Canard"],
    ["OIE", "Oies"],
    ["DINDE", "Dinde"],
    ["CAILLE", "Caille"],
    ["PIGEON", "Pigeon"],
    ["PINTADE", "Pintade"],
  ]),
  T56: {
    kind: "COMMERCIALISATION",
    rows: [
      ["ANE", "Ânes"],
      ["ETALON", "Étalons"],
      ["JUMENT", "Juments"],
      ["POULAIN", "Poulains"],
    ].map(([suffix, label]) => ({
      label,
      codes: ["MEV_D1", "MEV_D2", "MEV_D3", "VENDU_D1", "VENDU_D2", "VENDU_D3", "PRIX_MOYEN"].map((s) => `T56_${suffix}_${s}`),
    })),
  },
};

function commercialisationLayout(
  templateCode: string,
  espece: string,
  categories: [string, string][]
): TableLayout {
  return {
    kind: "COMMERCIALISATION",
    rows: categories.map(([suffix, label]) => ({
      label,
      codes: ["MEV_D1", "MEV_D2", "MEV_D3", "VENDU_D1", "VENDU_D2", "VENDU_D3", "PRIX_MOYEN"].map(
        (s) => `${templateCode}_${espece}_${suffix}_${s}`
      ),
    })),
  };
}

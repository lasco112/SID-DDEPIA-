/**
 * Fin du CHAPITRE II (II-7 à II-9) et CHAPITRE III (production et industries
 * halieutiques).
 *
 * Tableaux n° 51 à 63 du canevas, plus ceux que le régional porte sans légende
 * — organisations d'aquaculteurs, production d'alevins, import-substitution.
 *
 * DEUX ERREURS DE L'ANCIENNE ADAPTATION DÉPARTEMENTALE SONT CORRIGÉES d'après
 * le régional, qui fait foi :
 *   - le tableau n° 52 de l'apiculture portait les colonnes de la
 *     pisciculture ; il porte désormais celles du régional — miel, cire,
 *     propolis, gelée royale, ruches, ruchers, apiculteurs, organisations ;
 *   - le tableau n° 53 des produits de la ruche portait « Animaux sur pied /
 *     Viande » ; il porte désormais miel, cire, propolis et total.
 *
 * Le tableau des alevins (n° 62) suit aussi le régional : une colonne par
 * espèce (tilapia, clarias, carpe) et la maille territoriale ordinaire, au lieu
 * d'une ligne unique titrée « semestrielle » quelle que soit la période.
 */
import type { Bloc, SectionCanevas } from "./types";

const PIED = ["TOTAL {P}", "TOTAL {P-1}", "ÉCART"];
const TOTAUX = ["TOTAL {P}", "TOTAL {P-1}"];
const LIGNES_ARRONDISSEMENTS = ["{ARRONDISSEMENTS}", ...PIED];

const NEANT = "Néant si aucune activité enregistrée.";

/** Une sous-partie sans tableau : un titre et sa zone de texte. */
const rubrique = (texte: string, cle: string, consigne = NEANT, niveau: 3 | 4 = 3): Bloc[] => [
  { type: "titre", niveau, texte },
  { type: "zoneTexte", cle, consigne },
];

/** Colonnes de la pisciculture, au tableau n° 61. */
const COLONNES_PISCICULTURE = [
  "Nombre de pisciculteurs",
  "Nombre étangs actifs",
  "Superficie",
  "Bacs hors sol",
  "Volume (m3)",
  "Stations d’alevinage",
];

// ============================================================================
// II-7 à II-9 — non conventionnels, apiculture, animaux de compagnie
// ============================================================================

export const SECTION_II_AUTRES: SectionCanevas = {
  cle: "II-7-9",
  titre: "Deuxième partie, II-7 à II-9 — Élevages non conventionnels, apicole, animaux de compagnie",
  blocs: [
    { type: "titre", niveau: 2, texte: "II-7. LES ÉLEVAGES NON CONVENTIONNELS" },
    { type: "zoneTexte", cle: "II7.cheptel", consigne: "Présentation des élevages non conventionnels et de leurs cheptels." },
    {
      type: "tableau",
      kind: "libre",
      numero: 51,
      titre: "Situation des cheptels d’élevage non conventionnels",
      entetes: [
        "Arrondissement",
        "Aulacodes",
        "Lapins",
        "Cochons d’inde",
        "Rat de Gambie",
        "Cobayes",
        "Escargots",
        "Autres (à préciser)",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    ...rubrique("II-7-1. Infrastructures d'exploitation", "II7.infrastructures"),
    ...rubrique("II-7-2. Animation et vulgarisation", "II7.animation", "a) L'encadrement — b) Les initiatives paysannes."),
    ...rubrique("II-7-3. Exploitation du cheptel", "II7.exploitation", "Commercialisation des animaux."),

    { type: "titre", niveau: 2, texte: "II-8. L'ÉLEVAGE APICOLE" },
    { type: "zoneTexte", cle: "II8.presentation", consigne: "Présentation de l'apiculture dans le territoire." },
    {
      type: "tableau",
      kind: "libre",
      numero: 52,
      titre: "La situation de l’apiculture",
      // Colonnes du régional, espaces rétablis (« Cire(enkg) » y est collé).
      // Pas de colonne de total : les unités diffèrent d'une colonne à l'autre.
      entetes: [
        "Arrondissement",
        "Quantité de miel récolté (en litres)",
        "Cire (en kg)",
        "Propolis (en kg)",
        "Gelée royale (en kg)",
        "Nombre de ruches",
        "Ruchers",
        "Nombre d'apiculteurs",
        "Nombre d'organisations",
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    ...rubrique("II-8-1. Infrastructures d'exploitation", "II8.infrastructures"),
    ...rubrique("II-8-2. Animation et vulgarisation", "II8.animation", "a) Encadrement — b) Initiatives paysannes."),
    { type: "titre", niveau: 3, texte: "II-8-3. Exploitation des produits d'apiculture" },
    {
      type: "tableau",
      kind: "libre",
      numero: 53,
      titre: "Synthèse des activités de vente des produits de la ruche",
      entetes: ["Produits/Arrondissement", "Miel", "Cire", "Propolis", "Total"],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    { type: "titre", niveau: 2, texte: "II-9. LES ANIMAUX DE COMPAGNIE ET ÉLEVAGES CANINS ET FÉLINS" },
    { type: "zoneTexte", cle: "II9.presentation", consigne: "Présentation des animaux de compagnie dans le territoire." },
    {
      type: "tableau",
      kind: "libre",
      numero: 54,
      titre: "Situation des cheptels des élevages canins et félins et autres animaux de compagnie",
      entetes: ["Arrondissement", "Canins", "Félins", "Porc-épic", "Singes", "Crocodiles", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 2, texte: "CONCLUSION DU CHAPITRE II" },
    { type: "zoneTexte", cle: "II.conclusion", consigne: "Synthèse des productions animales de la période." },
  ],
};

// ============================================================================
// CHAPITRE III — production et industries halieutiques, tableaux n° 55 à 63
// ============================================================================

export const SECTION_III_PECHE: SectionCanevas = {
  cle: "III",
  titre: "Chapitre III — Production et industries halieutiques",
  blocs: [
    { type: "titre", niveau: 1, texte: "CHAPITRE III : PRODUCTION ET INDUSTRIES HALIEUTIQUES" },

    // ---- III-1. Pêche artisanale continentale ----
    { type: "titre", niveau: 2, texte: "III-1. LA PÊCHE ARTISANALE CONTINENTALE" },
    { type: "zoneTexte", cle: "III1.presentation", consigne: "Présentation de la pêche dans le territoire : plans d'eau, acteurs." },
    { type: "titre", niveau: 3, texte: "III-1-1. Situation des pêcheurs par nationalité" },
    {
      type: "tableau",
      kind: "libre",
      numero: 55,
      titre: "Situation des pêcheurs par nationalité",
      entetes: [
        "Nationalité Arrondissement",
        "Camerounais",
        "Maliens",
        "Nigérians",
        "Béninois",
        "Total",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    // Le régional numérote par erreur « II-1-2 » : c'est III-1-2. Il y place
    // les équipements ET les engins, en deux tableaux.
    { type: "titre", niveau: 3, texte: "III-1-2. Situation des équipements et engins de pêche par type" },
    {
      type: "tableau",
      kind: "libre",
      numero: 56,
      titre: "Situation des équipements de pêche par type",
      entetes: [
        "Equipements Arrondissement",
        "Pirogues monoxyles à pagaies/voile",
        "Pirogues à planches + moteur",
        "Pirogues en tôle",
        "Pirogues en planches sans moteur",
        "Total",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 57,
      titre: "Situation des engins de pêche par type",
      enteteLibelle: "Arrondissement Engins de pêches",
      lignes: [
        "Cannes à pêche",
        "Epervier",
        "Filets maillants de fond",
        "Filets maillants de surface",
        "Lignes et hameçons",
        "Nasses en grillage",
        "Nasses en bambou",
        "Nasses en rotin",
        "Goura malien",
        "Palangres appâtées",
        "Palangres non appâtées",
        "TOTAL",
      ],
    },
    ...rubrique(
      "III-1-3. Infrastructures d'exploitation",
      "III1.infrastructures",
      "a) Infrastructures privées — b) Infrastructures publiques."
    ),
    { type: "titre", niveau: 3, texte: "III-1-4. Animation et vulgarisation" },
    ...rubrique("a) Encadrement", "III1.encadrement", "Encadrement des pêcheurs.", 4),
    { type: "titre", niveau: 4, texte: "b) Initiatives paysannes" },
    {
      type: "tableau",
      kind: "libre",
      numero: 58,
      titre: "Organisations paysannes de pêche",
      entetes: ["Arrondissement", "Groupes d’Initiative Commune (GIC)", "Activités"],
      lignes: ["{ARRONDISSEMENTS}", "TOTAL"],
    },
    { type: "titre", niveau: 3, texte: "III-1-5. Exploitation des ressources halieutiques" },
    { type: "titre", niveau: 4, texte: "a) Situation générale des captures" },
    {
      type: "tableau",
      kind: "libre",
      numero: 59,
      titre: "Situation générale des captures en tonnes",
      entetes: ["Espèces Arrondissement", "Hemichromis", "Silures", "Tilapia", "Carpes", "Capture", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "b) Ressources générées" },
    {
      type: "tableau",
      kind: "libre",
      numero: 60,
      titre: "Etat des ressources générées par les captures de pêche",
      entetes: ["Arrondissement", "Poissons frais", "Poissons fumés", "Total", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    ...rubrique("c) Exploitation des produits dérivés", "III1.produitsDerives", NEANT, 4),
    { type: "titre", niveau: 3, texte: "III-1-6. Difficultés rencontrées" },
    { type: "zoneTexte", cle: "III1.difficultes", consigne: "Rubrique imposée." },

    // ---- III-2. Aquaculture ----
    // Le régional numérote « III-2.1 » et « III-2-1 » en double, et place
    // III-3 avant les difficultés de l'aquaculture : la suite est ici continue.
    { type: "titre", niveau: 2, texte: "III-2. L'AQUACULTURE" },
    { type: "zoneTexte", cle: "III2.presentation", consigne: "Présentation de l'aquaculture dans le territoire : faits marquants de la période." },
    { type: "titre", niveau: 3, texte: "III-2-1. Initiatives paysannes" },
    {
      type: "tableau",
      kind: "libre",
      numero: 110,
      titre: "Organisations de producteurs impliquées dans l’activité aquacole",
      entetes: ["Arrondissement", "Groupes d’Initiative Commune (GIC)", "Activités menées"],
      lignes: ["{ARRONDISSEMENTS}", "TOTAL"],
    },
    { type: "titre", niveau: 3, texte: "III-2-2. Situation des infrastructures aquacoles" },
    {
      type: "tableau",
      kind: "libre",
      numero: 61,
      titre: "Situation de l’aquaculture",
      entetes: ["Arrondissement", ...COLONNES_PISCICULTURE, ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 3, texte: "III-2-3. Production d'alevins" },
    {
      type: "tableau",
      kind: "libre",
      numero: 62,
      titre: "Production d’alevins",
      entetes: ["Arrondissement", "Tilapia", "Clarias", "Carpe", "Total"],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 3, texte: "III-2-4. Production de poissons de table" },
    {
      type: "tableau",
      kind: "libre",
      numero: 63,
      titre: "Situation de la production de poissons de table",
      entetes: [
        "Arrondissement",
        "Nombre de pisciculteurs",
        "Nombre étangs",
        "Superficie en Ha",
        "Bacs hors sol",
        "Volume",
        "Qté de poissons (en kg)",
        "Prix moyen du Kg",
        "Ressources générées",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 3, texte: "III-2-5. Difficultés rencontrées" },
    { type: "zoneTexte", cle: "III2.difficultes", consigne: "Rubrique imposée." },

    // ---- III-3 ----
    { type: "titre", niveau: 2, texte: "III-3. PROMOTION DE LA POLITIQUE D'IMPORT-SUBSTITUTION" },
    { type: "zoneTexte", cle: "III3.importSubstitution", consigne: "Rubrique imposée par le canevas régional." },
    {
      type: "tableau",
      kind: "libre",
      numero: 111,
      titre: "Les nouvelles structures et perspectives de production",
      // L'en-tête du régional tient sur trois lignes (« Nombre de /
      // Pisciculteurs », « Etangs / Nbre / Superficie (m2) »…). Il est mis à
      // plat, chaque colonne portant son intitulé complet.
      entetes: [
        "Structures",
        "Nombre de pisciculteurs",
        "Etangs : nombre",
        "Etangs : superficie (m2)",
        "Etangs : capacité de production (kg)",
        "Bacs hors sol : nombre",
        "Bacs hors sol : volume (m3)",
        "Bacs hors sol : capacité de production (kg)",
        "Production estimée (tonnes)",
      ],
      lignes: ["Structures nouvelles", "Structures réhabilitées", "Structures en chantier", "TOTAL {P}"],
    },
  ],
};

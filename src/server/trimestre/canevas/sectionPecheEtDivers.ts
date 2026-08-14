/**
 * Fin de la DEUXIÈME PARTIE (II-7 à II-9) et TROISIÈME PARTIE (la pêche et
 * l'aquaculture).
 *
 * Transcription littérale des tableaux #58 à #70 de
 * docs/CANEVAS_TRIMESTRIEL.md, soit les tableaux n° 51 à 63 du canevas.
 *
 * DEUX ERREURS MANIFESTES DU CANEVAS, REPRODUITES TELLES QUELLES :
 *
 *   - le tableau n° 52 s'intitule « La situation de l'apiculture » mais porte
 *     les colonnes de la pisciculture — pisciculteurs, étangs actifs, bacs
 *     hors sol, stations d'alevinage. Il est identique au tableau n° 61 ;
 *   - le tableau n° 53, « commercialisation des produits de la ruche », porte
 *     la colonne « Animaux sur pied ».
 *
 * Ce sont des copier-coller restés dans le document régional. Le SID les
 * reproduit, car le canevas fait foi ; mais ils sont signalés au Délégué, à
 * qui il revient de les faire corriger en amont s'il le juge utile.
 *
 * PARTICULARITÉ : le tableau n° 62 est le SEUL des 81 à porter une colonne
 * « Écart », et il n'a aucune ligne — le canevas le laisse entièrement vide.
 */
import type { SectionCanevas } from "./types";

const PIED = ["TOTAL {P}", "TOTAL {P-1}", "ÉCART"];
const TOTAUX = ["TOTAL {P}", "TOTAL {P-1}"];
const LIGNES_ARRONDISSEMENTS = ["{ARRONDISSEMENTS}", ...PIED];

/**
 * Colonnes de la pisciculture. Elles servent au tableau n° 61 — et aussi au
 * n° 52, où le canevas les a manifestement collées par erreur sous un titre
 * d'apiculture.
 */
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
    { type: "titre", niveau: 3, texte: "II-7-1. Situation des cheptels" },
    {
      type: "tableau",
      kind: "libre",
      numero: 51,
      titre: "Situation des cheptels d’élevage non conventionnels",
      entetes: [
        "Arrondissement",
        "Aulacodes",
        "Lapins",
        "Rat de Gambie",
        "Cobayes",
        "Escargots",
        "Autres (à préciser)",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    { type: "titre", niveau: 2, texte: "II-8. L'ÉLEVAGE APICOLE" },
    { type: "titre", niveau: 3, texte: "II-8-1. Situation de l'apiculture" },
    {
      type: "tableau",
      kind: "libre",
      numero: 52,
      titre: "La situation de l’apiculture",
      // Colonnes de pisciculture sous un titre d'apiculture : erreur du canevas
      // régional, reproduite telle quelle. Voir l'en-tête de ce fichier.
      entetes: ["Arrondissement", ...COLONNES_PISCICULTURE, ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 3, texte: "II-8-2. Exploitation des produits de la ruche" },
    {
      type: "tableau",
      kind: "libre",
      numero: 53,
      titre: "Etat de la commercialisation des produits de la ruche",
      // « Animaux sur pied » pour des produits de la ruche : même origine.
      entetes: ["Arrondissement", "Animaux sur pied", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    { type: "titre", niveau: 2, texte: "II-9. LES ANIMAUX DE COMPAGNIE, ÉLEVAGES CANINS ET FÉLINS" },
    { type: "titre", niveau: 3, texte: "II-9-1. Situation des cheptels" },
    {
      type: "tableau",
      kind: "libre",
      numero: 54,
      titre: "Situation des cheptels des élevages canins et félins et autres animaux de compagnie",
      entetes: ["Arrondissement", "Canins", "Félins", "Porc-épic", "Singes", "Crocodiles", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
  ],
};

// ============================================================================
// TROISIÈME PARTIE — la pêche et l'aquaculture, tableaux n° 55 à 63
// ============================================================================

export const SECTION_III_PECHE: SectionCanevas = {
  cle: "III",
  titre: "Troisième partie — La pêche et l'aquaculture",
  blocs: [
    { type: "titre", niveau: 1, texte: "TROISIÈME PARTIE : LA PÊCHE ET L'AQUACULTURE" },

    // ---- III-1. Pêche artisanale continentale ----
    { type: "titre", niveau: 2, texte: "III-1. LA PÊCHE ARTISANALE CONTINENTALE" },
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
    { type: "titre", niveau: 3, texte: "III-1-2. Situation des équipements de pêche" },
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
    { type: "titre", niveau: 3, texte: "III-1-3. Situation des engins de pêche" },
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
    { type: "titre", niveau: 3, texte: "III-1-4. Animation et vulgarisation" },
    {
      type: "tableau",
      kind: "libre",
      numero: 58,
      titre: "Organisations paysannes de pêche et de pisciculture en fonction des activités menées",
      // Même forme que le tableau n° 36 : « Départements », « RAS », « TOTAL ».
      entetes: ["Départements", "Groupes d’Initiative Commune (GIC)", "Activités"],
      lignes: ["RAS", "TOTAL"],
    },
    { type: "titre", niveau: 3, texte: "III-1-5. Exploitation des ressources halieutiques" },
    {
      type: "tableau",
      kind: "libre",
      numero: 59,
      titre: "Situation générale des captures en tonnes",
      entetes: ["Espèces Arrondissement", "Hemichromis", "Silures", "Tilapia", "Carpes", "Capture", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 3, texte: "III-1-6. Ressources générées" },
    {
      type: "tableau",
      kind: "libre",
      numero: 60,
      titre: "Etat des ventes par filières dans la pêche artisanale continentale",
      entetes: ["Arrondissement", "Poissons frais", "Poissons fumés", "Total", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 3, texte: "III-1-7. Difficultés rencontrées" },
    { type: "zoneTexte", cle: "III1.difficultes", consigne: "Rubrique imposée." },

    // ---- III-2. Aquaculture ----
    { type: "titre", niveau: 2, texte: "III-2. L'AQUACULTURE" },
    { type: "titre", niveau: 3, texte: "III-2-1. Situation des infrastructures aquacoles" },
    {
      type: "tableau",
      kind: "libre",
      numero: 61,
      titre: "Situation de l’aquaculture",
      entetes: ["Arrondissement", ...COLONNES_PISCICULTURE, ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 3, texte: "III-2-2. Production d'alevins" },
    {
      type: "tableau",
      kind: "libre",
      numero: 62,
      titre: "Production semestrielle d’alevins",
      // SEUL tableau des 81 à porter une colonne « Écart », et il n'a aucune
      // ligne : le canevas le laisse entièrement vide.
      entetes: ["Désignation", ...TOTAUX, "Écart"],
      lignes: [],
    },
    { type: "titre", niveau: 3, texte: "III-2-3. Production de poissons de table" },
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
    { type: "titre", niveau: 3, texte: "III-2-4. Difficultés rencontrées" },
    { type: "zoneTexte", cle: "III2.difficultes", consigne: "Rubrique imposée." },

    // ---- III-3 ----
    { type: "titre", niveau: 2, texte: "III-3. PROMOTION DE LA POLITIQUE D'IMPORT-SUBSTITUTION" },
    { type: "zoneTexte", cle: "III3.importSubstitution", consigne: "Rubrique imposée par le canevas régional." },
  ],
};

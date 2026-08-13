/**
 * DEUXIÈME PARTIE, II-1 — l'élevage bovin.
 *
 * Transcription littérale des tableaux #21 à #29 de
 * docs/CANEVAS_TRIMESTRIEL.md, soit les tableaux n° 14 à 22 du canevas.
 *
 * DIFFÉRENCE MAJEURE AVEC LA SECTION I : ici, les arrondissements sont le plus
 * souvent en LIGNES, et les colonnes portent les catégories d'animaux ou les
 * produits. Les tableaux se terminent par trois lignes imposées — total de la
 * période, total de la même période l'an passé, et écart.
 *
 * Le canevas n'est pas homogène et il ne faut pas l'uniformiser : le tableau
 * n° 16 écrit « Castre » là où le n° 14 écrit « Castré », et leurs premières
 * colonnes s'intitulent différemment. Ces différences sont reproduites telles
 * quelles ; le test de conformité les vérifie caractère par caractère.
 */
import type { SectionCanevas } from "./types";

/** Les trois lignes de pied imposées par le canevas dans cette partie. */
const PIED = ["TOTAL {P}", "TOTAL {P-1}", "ÉCART"];

/** Les deux colonnes de total imposées en fin de chaque tableau. */
const TOTAUX = ["TOTAL {P}", "TOTAL {P-1}"];

/** Arrondissements en lignes, puis le pied : la forme dominante de cette partie. */
const LIGNES_ARRONDISSEMENTS = ["{ARRONDISSEMENTS}", ...PIED];

export const SECTION_II_BOVIN: SectionCanevas = {
  cle: "II-1",
  titre: "Deuxième partie, II-1 — L'élevage bovin",
  blocs: [
    { type: "titre", niveau: 1, texte: "DEUXIÈME PARTIE : MISE EN ŒUVRE DES ACTIVITÉS AU NIVEAU DÉPARTEMENTAL" },
    { type: "titre", niveau: 2, texte: "II-1. L'ÉLEVAGE BOVIN" },

    // ---- II-1-1. Le cheptel ----
    { type: "titre", niveau: 3, texte: "II-1-1. Le cheptel" },
    {
      type: "zoneTexte",
      cle: "II1.cheptel.preambule",
      consigne:
        "Effectif présent à la clôture de la période. Un cheptel est un stock : il ne s'additionne pas sur les trois mois.",
    },
    {
      type: "tableau",
      kind: "libre",
      numero: 14,
      titre: "Répartition du cheptel bovin par catégorie et par arrondissement",
      entetes: ["Catégorie Départ.", "Taurillon", "Génisse", "Castré", "Taureau", "Vache", "Veau", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    // ---- II-1-2. Les infrastructures ----
    { type: "titre", niveau: 3, texte: "II-1-2. Les infrastructures d'exploitation" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 15,
      titre: "Les infrastructures d’exploitation par arrondissement",
      enteteLibelle: "Désignation",
      lignes: [
        "Infrastructures d'abattages",
        "Pâturages en ha",
        "Points d'eau",
        "Lahorés",
        "Ecuries",
        "Barrages",
        "Infrastructures de vaccination",
        "Pistes à bétail en km",
        "Fourrières municipales",
        "Bains de tiqueurs",
        "Banques fourragères",
        "Ranchs",
        "Marchés",
        "Parcs de contention",
        "Unités de transformation",
        "Fermes homologuées",
        "Fermes non homologuées",
        "Champs fourragers (en ha)",
        "TOTAL",
      ],
    },

    // ---- II-1-3. Animation pastorale ----
    { type: "titre", niveau: 3, texte: "II-1-3. Animation pastorale et vulgarisation" },
    { type: "zoneTexte", cle: "II1.animation", consigne: "a) Encadrement — b) Initiatives paysannes." },

    // ---- II-1-4. Exploitation du bétail ----
    { type: "titre", niveau: 3, texte: "II-1-4. Exploitation du bétail" },
    { type: "titre", niveau: 4, texte: "a) Les abattages contrôlés" },
    {
      type: "tableau",
      kind: "libre",
      numero: 16,
      titre: "Les abattages contrôlés",
      entetes: ["Catégorie Arrondissement", "Taurillon", "Génisse", "Castre", "Taureau", "Vache", "Veau", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "b) Rendement moyen viande / carcasse" },
    {
      type: "tableau",
      kind: "libre",
      numero: 17,
      titre: "Rendement moyen viande /carcasse par catégorie",
      entetes: ["CATEGORIE", "POIDS MOYEN", "RENDEMENT EN CARCASSE"],
      lignes: ["TAURILLON", "GENISSE", "CASTRE", "TAUREAU", "VACHE", "VEAU", "TOTAL"],
    },
    { type: "titre", niveau: 4, texte: "c) Production de viande en tonnes" },
    {
      type: "tableau",
      kind: "libre",
      numero: 18,
      titre: "Production de viande en tonnes",
      entetes: ["Catégorie Arrondissement", "Taurillon", "Génisse", "Castre", "Taureau", "Vache", "Veau", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "d) Commercialisation des animaux et ressources générées" },
    {
      type: "tableau",
      kind: "libre",
      numero: 19,
      titre: "Synthèse des activités de commercialisation",
      entetes: ["Arrondissement", "Animaux sur pied", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    // ---- II-1-5. Produits dérivés ----
    { type: "titre", niveau: 3, texte: "II-1-5. Exploitation des produits dérivés" },
    { type: "titre", niveau: 4, texte: "a) Lait et produits dérivés" },
    {
      type: "tableau",
      kind: "libre",
      numero: 20,
      titre: "Synthèse de l’exploitation du lait",
      entetes: [
        "Arrondissement",
        "Production de lait frais",
        "Lait caillé",
        "Production de beurre",
        "Production de Yaourt",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "b) Production et commercialisation des cuirs" },
    {
      type: "tableau",
      kind: "libre",
      numero: 21,
      titre: "Synthèse de la production et de la commercialisation des cuirs",
      entetes: [
        "Arrondissement",
        "Quantité (En unité)",
        "Prix moyen FCFA/Unité",
        "Ressources générées (en millions FCFA)",
        "Principales destinations",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    // ---- II-1-6. Mouvements de bétail ----
    { type: "titre", niveau: 3, texte: "II-1-6. Mouvements de bétail" },
    {
      type: "tableau",
      kind: "libre",
      numero: 22,
      titre: "Situation de la circulation intérieure",
      entetes: ["Arrondissement", "Transit", "Transhumance", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    // ---- II-1-7 et II-1-8 ----
    { type: "titre", niveau: 3, texte: "II-1-7. Exportation d'animaux et produits dérivés" },
    { type: "zoneTexte", cle: "II1.exportation", consigne: "Néant si aucune activité enregistrée." },
    { type: "titre", niveau: 3, texte: "II-1-8. Importation d'animaux et produits dérivés" },
    { type: "zoneTexte", cle: "II1.importation", consigne: "Néant si aucune activité enregistrée." },
  ],
};

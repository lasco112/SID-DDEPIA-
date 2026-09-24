/**
 * DEUXIÈME PARTIE, CHAPITRE II, II-1 — l'élevage bovin.
 *
 * Tableaux n° 14 à 22 du canevas, plus le tableau des infrastructures
 * financées sur le budget d'investissement public, que le régional porte sans
 * légende.
 *
 * DÉCOUPAGE COMMUN À TOUTES LES ESPÈCES, repris du régional : le cheptel
 * présente l'espèce, sans numéro ; puis II-x-1 infrastructures, II-x-2
 * animation, II-x-3 exploitation du bétail, II-x-4 produits dérivés, II-x-5
 * mouvements, II-x-6 exportation, II-x-7 importation. Le régional numérote
 * « II-1-2 » deux fois et saute « II-1-4 » : la numérotation est ici continue.
 *
 * Ici, les arrondissements sont le plus souvent en LIGNES, et les colonnes
 * portent les catégories d'animaux ou les produits. Les tableaux se terminent
 * par trois lignes imposées — total de la période, total de la même période
 * l'an passé, et écart.
 *
 * Le régional écrit « Castre » aux tableaux des abattages et de la viande, et
 * « CASTRE » au rendement carcasse. Faute d'accent : le SID écrit « Castré »,
 * écart assumé dans tests/canevas-conformite.test.ts.
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
    // Le régional ouvre ici son chapitre II. La pêche et la santé animale sont
    // ses chapitres III et IV, dans cette même Deuxième partie.
    { type: "titre", niveau: 1, texte: "CHAPITRE II : PRODUCTIONS ET INDUSTRIES ANIMALES" },
    {
      type: "zoneTexte",
      cle: "II.introduction", siVide: "rien",
      consigne: "Introduction du chapitre : place de l'élevage dans le département, faits marquants de la période.",
    },
    { type: "titre", niveau: 2, texte: "II-1. L'ÉLEVAGE BOVIN" },

    // ---- Le cheptel : présentation de l'espèce, sans numéro ----
    {
      type: "zoneTexte",
      cle: "II1.cheptel.preambule", siVide: "rien",
      // Le cheptel est un stock : l'effectif présent à la clôture, jamais la
      // somme des trois mois.
      consigne: "Présentation de l'élevage bovin et de son cheptel.",
    },
    {
      type: "tableau",
      kind: "libre",
      numero: 14,
      titre: "Répartition du cheptel bovin par catégorie et par arrondissement",
      entetes: ["Catégorie Départ.", "Taurillon", "Génisse", "Castré", "Taureau", "Vache", "Veau", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    // ---- II-1-1. Les infrastructures ----
    { type: "titre", niveau: 3, texte: "II-1-1. Les infrastructures d'exploitation" },
    // Ordre du régional : la phrase sur les BIP de l'exercice et leur tableau
    // viennent d'abord ; le tableau général des infrastructures suit le texte
    // sur les abattoirs.
    {
      type: "zoneTexte",
      cle: "II1.bip",
      consigne: "Nombre et montant des BIP de l'exercice consacrés aux infrastructures d'élevage, niveau d'exécution.",
    },
    {
      // Le régional y liste les ouvrages financés sur le budget
      // d'investissement public de l'exercice, sans légende : il en reçoit une.
      type: "tableau",
      kind: "libre",
      numero: 108,
      titre: "Infrastructures d’élevage financées sur le budget d’investissement public",
      entetes: [
        "N°",
        "Arrondissement/ Commune",
        "Infrastructure d’élevage de base",
        "Equipement ou infrastructure annexe à l’infrastructure de base",
        "Montant alloué (FCFA)",
        "Niveau d’exécution physique (construit, non construit, En cours, Arrêté)",
      ],
      lignes: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "TOTAL"],
    },
    { type: "titre", niveau: 4, texte: "a) Abattoirs" },
    { type: "zoneTexte", cle: "II1.abattoirs", consigne: "Abattoirs et aires d'abattage : état, fonctionnement." },
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
    { type: "titre", niveau: 4, texte: "b) Les pâturages" },
    { type: "zoneTexte", cle: "II1.paturages", consigne: "Zones de pâturage, état, conflits agropastoraux." },
    { type: "titre", niveau: 4, texte: "c) Hydraulique pastorale" },
    { type: "zoneTexte", cle: "II1.hydraulique", consigne: "Points d'eau, forages, barrages." },
    { type: "titre", niveau: 4, texte: "d) Infrastructures communautaires" },
    { type: "zoneTexte", cle: "II1.infraCommunautaires", consigne: "Marchés à bétail, parcs vaccinogènes, bains détiqueurs…" },
    { type: "titre", niveau: 4, texte: "e) Infrastructures privées" },
    { type: "zoneTexte", cle: "II1.infraPrivees", consigne: "Ranchs, fermes, unités de transformation." },

    // ---- II-1-2. Animation pastorale ----
    { type: "titre", niveau: 3, texte: "II-1-2. Animation pastorale et vulgarisation" },
    { type: "zoneTexte", cle: "II1.animation", consigne: "a) Encadrement — b) Initiatives paysannes." },

    // ---- II-1-3. Exploitation du bétail ----
    { type: "titre", niveau: 3, texte: "II-1-3. Exploitation du bétail" },
    { type: "titre", niveau: 4, texte: "a) Les abattages contrôlés" },
    {
      type: "tableau",
      kind: "libre",
      numero: 16,
      titre: "Les abattages contrôlés",
      entetes: ["Catégorie Arrondissement", "Taurillon", "Génisse", "Castré", "Taureau", "Vache", "Veau", ...TOTAUX],
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
      // Norme du Délégué (23 septembre 2026) : « un bovin, c'est 60 % de
      // 250 kg ». C'est elle qui calcule la production de viande (tableau n° 18,
      // voir CARCASSE_KG dans liaison.ts). Les catégories restent à renseigner
      // si le département dispose de pesées plus fines.
      prerempli: [[], [], [], [], [], [], ["250 kg", "60 %"]],
    },
    { type: "titre", niveau: 4, texte: "c) Production de viande en tonnes" },
    {
      type: "tableau",
      kind: "libre",
      numero: 18,
      titre: "Production de viande en tonnes",
      entetes: ["Catégorie Arrondissement", "Taurillon", "Génisse", "Castré", "Taureau", "Vache", "Veau", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "d) Commercialisation des animaux et ressources générées" },
    {
      type: "tableau",
      kind: "libre",
      numero: 19,
      titre: "Synthèse des activités de commercialisation",
      // « Viande » rétablie d'après le régional : il distingue les animaux
      // vendus sur pied de la viande commercialisée.
      entetes: ["Arrondissement", "Animaux sur pied", "Viande", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    // ---- II-1-4. Produits dérivés ----
    { type: "titre", niveau: 3, texte: "II-1-4. Exploitation des produits dérivés" },
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

    // ---- II-1-5. Mouvements de bétail ----
    { type: "titre", niveau: 3, texte: "II-1-5. Mouvements de bétail" },
    {
      type: "tableau",
      kind: "libre",
      numero: 22,
      titre: "Situation de la circulation intérieure",
      entetes: ["Arrondissement", "Transit", "Transhumance", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    // ---- II-1-6 et II-1-7 ----
    { type: "titre", niveau: 3, texte: "II-1-6. Exportation d'animaux et produits dérivés" },
    { type: "zoneTexte", cle: "II1.exportation", consigne: "Néant si aucune activité enregistrée." },
    { type: "titre", niveau: 3, texte: "II-1-7. Importation d'animaux et produits dérivés" },
    { type: "zoneTexte", cle: "II1.importation", consigne: "Néant si aucune activité enregistrée." },
  ],
};

/**
 * DEUXIÈME PARTIE, II-5 et II-6 — l'élevage porcin et les élevages avicoles.
 *
 * Transcription littérale des tableaux #44 à #57 de
 * docs/CANEVAS_TRIMESTRIEL.md, soit les tableaux n° 37 à 50 du canevas.
 *
 * L'AVICULTURE EST LA PARTIE LA PLUS IRRÉGULIÈRE DU CANEVAS. On la reproduit
 * telle quelle, sans harmoniser :
 *   - le tableau n° 42 écrit « Poules reformées » sans accent, le n° 43
 *     « Poules réformées » avec ;
 *   - le n° 44 abrège en « Poussins. chair », « P. de chair »,
 *     « Poulets réformés » ;
 *   - « Autres(Poules de réforme etc.) » au n° 45 sans espace avant la
 *     parenthèse, « Autres (poules de réforme etc.) » au n° 46 avec espace et
 *     sans majuscule ;
 *   - la première colonne des n° 49 et 50 s'intitule « Produits \Arrondissement »,
 *     avec une barre oblique inverse ;
 *   - les sous-filières avicoles (poule locale, chair, pondeuses, parentaux)
 *     présentent l'aviculture en a) b) c) d) ; le régional les numérote
 *     « II-6-1… » puis reprend une seconde série « II-6-1… » : la numérotation
 *     est ici continue.
 *
 * Chacune de ces particularités est vérifiée caractère par caractère par
 * tests/canevas-conformite.test.ts.
 */
import type { Bloc, SectionCanevas } from "./types";

const PIED = ["TOTAL {P}", "TOTAL {P-1}", "ÉCART"];
const TOTAUX = ["TOTAL {P}", "TOTAL {P-1}"];
const LIGNES_ARRONDISSEMENTS = ["{ARRONDISSEMENTS}", ...PIED];

const NEANT = "Néant si aucune activité enregistrée.";

/** Une sous-partie sans tableau : un titre et sa zone de texte. */
const rubrique = (texte: string, cle: string, consigne = NEANT): Bloc[] => [
  { type: "titre", niveau: 3, texte },
  { type: "zoneTexte", cle, consigne },
];

/**
 * Les dix-neuf produits connexes de l'aviculture, identiques aux tableaux
 * n° 49 (consommation) et n° 50 (circulation).
 */
const PRODUITS_CONNEXES = [
  "Aliment complet (T)",
  "Aliment concentré (T)",
  "Farine de poisson (T)",
  "Farine de sang (T)",
  "Maïs (T)",
  "Œufs (cartons)",
  "Poudre d'os (T)",
  "Poulet villageois (Nombre)",
  "Poulets de chair (Nombre)",
  "Poules pondeuses",
  "Poulets reformés",
  "Poussins d’un jour (Nombre)",
  "Remoulage (T)",
  "Son cubé (T)",
  "Son de blé (T)",
  "Tourteaux de coton (T)",
  "Tourteaux de palm (T)",
  "Tourteaux de Soja (T)",
  "Sulfate de fer (T)",
  "TOTAL",
];

// ============================================================================
// II-5. L'ÉLEVAGE PORCIN — tableaux n° 37 à 41
// ============================================================================

export const SECTION_II_PORCIN: SectionCanevas = {
  cle: "II-5",
  titre: "Deuxième partie, II-5 — L'élevage porcin",
  blocs: [
    { type: "titre", niveau: 2, texte: "II-5. L'ÉLEVAGE PORCIN" },

    { type: "zoneTexte", cle: "II5.cheptel", consigne: "Présentation de l'élevage porcin et de son cheptel." },
    {
      type: "tableau",
      kind: "libre",
      numero: 37,
      titre: "Situation du cheptel porcin par arrondissement",
      // Le régional porte des totaux « 1er S1 » : ce sont les totaux de SA
      // période. Ils suivent ici la période du rapport, comme partout.
      entetes: ["Arrondissement", "Verrats", "Truies", "Castrés", "Porcelets", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    ...rubrique(
      "II-5-1. Infrastructures d'exploitation",
      "II5.infrastructures",
      "a) Les fermes — b) Les équipements des fermes — c) Infrastructures communautaires (abattoirs, marchés…) — d) Infrastructures privées."
    ),

    { type: "titre", niveau: 3, texte: "II-5-2. Animation pastorale et vulgarisation" },
    { type: "zoneTexte", cle: "II5.animation", consigne: "a) Encadrement — b) Initiatives paysannes." },
    {
      type: "tableau",
      kind: "libre",
      numero: 38,
      titre: "Dynamique des organisations",
      // « en en millions » : la répétition est dans le canevas.
      entetes: [
        "Arrondissement",
        "Nbre de GIC",
        "Nombre d'Unions",
        "Fédération",
        "Confédération",
        "Appuis accordés en en millions de FCFA",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    { type: "titre", niveau: 3, texte: "II-5-3. Exploitation du bétail" },
    { type: "titre", niveau: 4, texte: "a) Abattages contrôlés" },
    {
      type: "tableau",
      kind: "libre",
      numero: 39,
      titre: "Situation des abattages de porcins",
      entetes: ["Arrondissement", "Verrats", "Truies", "Castrés", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "b) Production de viande en tonnes" },
    {
      type: "tableau",
      kind: "libre",
      numero: 40,
      titre: "Situation de la production de viande de porcins en tonnes",
      entetes: ["Arrondissement", "Verrats", "Truies", "Castrés", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "c) Commercialisation des animaux" },
    {
      type: "tableau",
      kind: "libre",
      numero: 41,
      titre: "Etat de la commercialisation des produits issus de l’élevage de porcins",
      entetes: ["Arrondissement", "Animaux sur pied", "Viande", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    ...rubrique("II-5-4. Exploitation des produits dérivés", "II5.produitsDerives"),

    { type: "titre", niveau: 3, texte: "II-5-5. Mouvements des animaux" },
    {
      type: "tableau",
      kind: "libre",
      numero: 109,
      titre: "Situation de la circulation intérieure des porcins sur pied",
      entetes: ["Arrondissement", "Nombre de têtes", "Provenance", "Destination", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    ...rubrique("II-5-6. Exportation d'animaux et produits dérivés", "II5.exportation"),
    ...rubrique("II-5-7. Importation d'animaux et produits dérivés", "II5.importation"),
  ],
};

// ============================================================================
// II-6. LES ÉLEVAGES AVICOLES — tableaux n° 42 à 50
// ============================================================================

export const SECTION_II_AVICOLE: SectionCanevas = {
  cle: "II-6",
  titre: "Deuxième partie, II-6 — Les élevages avicoles",
  blocs: [
    { type: "titre", niveau: 2, texte: "II-6. LES ÉLEVAGES AVICOLES" },

    { type: "titre", niveau: 4, texte: "a) La poule locale" },
    { type: "zoneTexte", cle: "II6.pouleLocale", consigne: "Sous-découpage imposé par le canevas régional." },
    { type: "titre", niveau: 4, texte: "b) L'élevage des poulets de chair" },
    { type: "zoneTexte", cle: "II6.pouletsChair", consigne: "Sous-découpage imposé par le canevas régional." },
    { type: "titre", niveau: 4, texte: "c) L'élevage des pondeuses" },
    { type: "zoneTexte", cle: "II6.pondeuses", consigne: "Sous-découpage imposé par le canevas régional." },
    { type: "titre", niveau: 4, texte: "d) L'élevage des parentaux (production de poussins d'un jour)" },
    { type: "zoneTexte", cle: "II6.parentaux", consigne: "Sous-découpage imposé par le canevas régional." },

    // Situation des bandes : le « cheptel » de l'aviculture, sans numéro.
    {
      type: "zoneTexte",
      cle: "II6.bandes.preambule",
      consigne:
        "Bandes EN COURS à la clôture de la période. Il s'agit d'un stock : aucune addition des trois mois.",
    },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 42,
      titre: "Situation des bandes par arrondissement",
      enteteLibelle: "Arrondissement",
      lignes: [
        "Poussins chair",
        "Poussins ponte",
        "Poussin coquelets",
        "Poulets de chair",
        "Poules pondeuses",
        "Poules reformées",
        "Coquelets",
        "Poulets villageois",
        "Reproducteur",
        "Canards",
        "Paons",
        "Pigeons",
        "Pintades",
        "Dindons",
        "Dindes",
        "Cailles",
        "Oies",
        "Chapons",
        "TOTAL",
      ],
    },

    ...rubrique("II-6-1. Infrastructures d'exploitation", "II6.infrastructures", "a) Les infrastructures communautaires — b) Les infrastructures privées."),
    ...rubrique("II-6-2. Animation et vulgarisation", "II6.animation", "Encadrement ; initiatives paysannes."),

    { type: "titre", niveau: 3, texte: "II-6-3. Exploitation des bandes" },
    { type: "titre", niveau: 4, texte: "a) Commercialisation des oiseaux sur pied" },
    {
      type: "tableau",
      kind: "libre",
      numero: 43,
      titre: "Etat de la commercialisation des oiseaux sur pied par arrondissement",
      entetes: [
        "Catégorie Arrondissement",
        "Poussins chair",
        "Poussins ponte",
        "Poulets chair",
        "Poules pondeuses",
        "Coquelets",
        "Poules réformées",
        "Poulets villageois",
        "Canards",
        "Pigeons",
        "Pintades",
        "paons",
        "Dindes",
        "Cailles",
        "Dindons",
        "Oies",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "b) Commercialisation par catégorie" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 44,
      titre: "Etat de la commercialisation des oiseaux sur pied par arrondissement et par catégorie",
      enteteLibelle: "Arrondissement",
      // Abréviations du canevas : « Poussins. chair », « P. de chair ».
      lignes: [
        "Poussins. chair",
        "Poussins. ponte",
        "P. de chair",
        "Poules pondeuses",
        "Poulets réformés",
        "Coquelets",
        "Poulets villageois",
        "Canards",
        "Pigeons",
        "Pintades",
        "Cailles",
        "Dindons",
        "Oies",
        "TOTAL",
      ],
    },
    { type: "titre", niveau: 4, texte: "c) Abattages contrôlés" },
    {
      type: "tableau",
      kind: "libre",
      numero: 45,
      titre: "Situation des abattages contrôlés de volaille par arrondissement",
      entetes: [
        "Arrondissement",
        "Poulets de chair",
        "Poulets villageois",
        "Coquelets",
        "Autres(Poules de réforme etc.)",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "d) Production de viande en tonnes" },
    {
      type: "tableau",
      kind: "libre",
      numero: 46,
      titre: "Etat de production de la viande de volaille par arrondissement",
      entetes: [
        "Arrondissement",
        "Poulet de chair",
        "Poulets villageois",
        "Canards",
        "Coquelets",
        "Autres (poules de réforme etc.)",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    { type: "titre", niveau: 3, texte: "II-6-4. Exploitation des produits dérivés" },
    { type: "titre", niveau: 4, texte: "a) Production des œufs" },
    {
      type: "tableau",
      kind: "libre",
      numero: 47,
      titre: "Etat de la production des œufs par arrondissement",
      entetes: ["Arrondissement", "Poules", "Poules villageoises", "Cailles", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "b) Commercialisation des œufs et fientes" },
    {
      type: "tableau",
      kind: "libre",
      numero: 48,
      titre: "Etat de la commercialisation des œufs et fientes par arrondissement",
      entetes: ["Arrondissement", "Œufs de poules", "Œufs de cailles", "Fiente", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "c) Produits connexes de l'aviculture" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 49,
      titre: "Etat de la consommation des produits connexes de l’aviculture en tonnes",
      enteteLibelle: "Produits \\Arrondissement",
      lignes: PRODUITS_CONNEXES,
    },

    { type: "titre", niveau: 3, texte: "II-6-5. Mouvement des bandes, des produits dérivés et produits connexes" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 50,
      titre: "Etat de la circulation des bandes, produits dérivés et produits connexes de l’aviculture",
      enteteLibelle: "Produits \\Arrondissement",
      lignes: PRODUITS_CONNEXES,
    },

    ...rubrique("II-6-6. Exportation de la volaille et de ses produits dérivés", "II6.exportation"),
    ...rubrique("II-6-7. Importation de volailles, de produits dérivés et de produits connexes", "II6.importation"),
  ],
};

/**
 * DEUXIÈME PARTIE, II-2 à II-4 — ovins, caprins, asins et équidés.
 *
 * Transcription littérale des tableaux #30 à #43 de
 * docs/CANEVAS_TRIMESTRIEL.md, soit les tableaux n° 23 à 36 du canevas.
 *
 * Ces trois sections suivent la même trame que l'élevage bovin, en plus court :
 * cheptel, animation pastorale, exploitation (abattages, viande, commerce),
 * mouvements. Les arrondissements sont en lignes, suivis des trois lignes de
 * pied imposées.
 *
 * LE CANEVAS EST IRRÉGULIER, ET ON NE LE CORRIGE PAS :
 *   - « Castrés » chez les ovins, « Castrés » chez les porcins, mais
 *     « Castre » chez les bovins du tableau n° 16 ;
 *   - « ANES / CHEVAUX / CHAMEAUX » en majuscules au tableau n° 34, en
 *     minuscules au n° 33 ;
 *   - « Prix moyen(en FCFA) » sans espace avant la parenthèse au n° 31 ;
 *   - le tableau n° 36 n'a ni colonne de total ni ligne d'arrondissement : il
 *     porte « RAS » et « TOTAL », et sa première colonne s'intitule
 *     « Départements ».
 * Chacune de ces particularités est vérifiée caractère par caractère par
 * tests/canevas-conformite.test.ts.
 */
import type { SectionCanevas } from "./types";

const PIED = ["TOTAL {P}", "TOTAL {P-1}", "ÉCART"];
const TOTAUX = ["TOTAL {P}", "TOTAL {P-1}"];
const LIGNES_ARRONDISSEMENTS = ["{ARRONDISSEMENTS}", ...PIED];

// ============================================================================
// II-2. L'ÉLEVAGE OVIN — tableaux n° 23 à 27
// ============================================================================

export const SECTION_II_OVIN: SectionCanevas = {
  cle: "II-2",
  titre: "Deuxième partie, II-2 — L'élevage ovin",
  blocs: [
    { type: "titre", niveau: 2, texte: "II-2. L'ÉLEVAGE OVIN" },

    { type: "titre", niveau: 3, texte: "II-2-1. Le cheptel" },
    {
      type: "tableau",
      kind: "libre",
      numero: 23,
      titre: "Situation du cheptel ovin",
      entetes: ["Arrondissement", "Béliers", "Brebis", "Castrés", "Agneaux", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    { type: "titre", niveau: 3, texte: "II-2-2. Animation pastorale et vulgarisation" },
    { type: "zoneTexte", cle: "II2.animation", consigne: "a) Encadrement — b) Initiatives paysannes." },

    { type: "titre", niveau: 3, texte: "II-2-3. Exploitation du bétail" },
    { type: "titre", niveau: 4, texte: "a) Les abattages contrôlés" },
    {
      type: "tableau",
      kind: "libre",
      numero: 24,
      titre: "Situation des abattages d’ovins par arrondissement",
      entetes: ["Arrondissement", "Ovins", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "b) Production de viande en tonnes" },
    {
      type: "tableau",
      kind: "libre",
      numero: 25,
      titre: "Etat de la production de viande ovine en tonnes",
      entetes: ["Arrondissement", "Quantité en tonnes", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "c) Commercialisation des animaux" },
    {
      type: "tableau",
      kind: "libre",
      numero: 26,
      titre: "Etat de la commercialisation des animaux et de la viande",
      // « Viande » rétablie d’après le régional, qui distingue les animaux
      // vendus sur pied de la viande commercialisée.
      entetes: ["Arrondissement", "Animaux sur pied", "Viande", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    { type: "titre", niveau: 3, texte: "II-2-4. Mouvements de bétail" },
    {
      type: "tableau",
      kind: "libre",
      numero: 27,
      titre: "Etat de la circulation intérieure des ovins par arrondissement",
      entetes: ["Arrondissement", "Nombre de têtes", "Provenance", "Destination", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
  ],
};

// ============================================================================
// II-3. L'ÉLEVAGE CAPRIN — tableaux n° 28 à 32
// ============================================================================

export const SECTION_II_CAPRIN: SectionCanevas = {
  cle: "II-3",
  titre: "Deuxième partie, II-3 — L'élevage caprin",
  blocs: [
    { type: "titre", niveau: 2, texte: "II-3. L'ÉLEVAGE CAPRIN" },

    { type: "titre", niveau: 3, texte: "II-3-1. Le cheptel" },
    {
      type: "tableau",
      kind: "libre",
      numero: 28,
      titre: "Situation du cheptel caprin par arrondissement",
      entetes: ["Arrondissement", "Catégorie", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    { type: "titre", niveau: 3, texte: "II-3-2. Animation pastorale et vulgarisation" },
    { type: "zoneTexte", cle: "II3.animation", consigne: "a) Encadrement — b) Initiatives paysannes." },

    { type: "titre", niveau: 3, texte: "II-3-3. Exploitation du bétail" },
    { type: "titre", niveau: 4, texte: "a) Abattages contrôlés" },
    {
      type: "tableau",
      kind: "libre",
      numero: 29,
      titre: "Situation des abattages de caprins",
      entetes: ["Arrondissement", "Quantité (en nombre de têtes)", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "b) Production de viande en tonnes" },
    {
      type: "tableau",
      kind: "libre",
      numero: 30,
      titre: "Situation de la production de viande de caprins en tonnes",
      entetes: ["Arrondissement", "Quantité de viande (en tonnes)", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "c) Commercialisation des animaux" },
    {
      type: "tableau",
      kind: "libre",
      numero: 31,
      titre: "Situation de la commercialisation des animaux sur pied",
      // « Prix moyen(en FCFA) » et « Ressources générées(en M FCFA) » sans
      // espace avant la parenthèse : c'est ainsi dans le canevas.
      entetes: [
        "Arrondissement",
        "Effectifs (en têtes)",
        "Prix moyen(en FCFA)",
        "Ressources générées(en M FCFA)",
        "Viande",
        ...TOTAUX,
      ],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    { type: "titre", niveau: 3, texte: "II-3-4. Mouvements de bétail" },
    {
      type: "tableau",
      kind: "libre",
      numero: 32,
      titre: "Situation de la circulation intérieure des animaux sur pied",
      entetes: ["Arrondissement", "Nombre de têtes", "Provenance", "Destination", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
  ],
};

// ============================================================================
// II-4. LES ÉLEVAGES D'ASINS ET D'ÉQUIDÉS — tableaux n° 33 à 36
// ============================================================================

export const SECTION_II_EQUIDES: SectionCanevas = {
  cle: "II-4",
  titre: "Deuxième partie, II-4 — Les élevages d'asins et d'équidés",
  blocs: [
    { type: "titre", niveau: 2, texte: "II-4. LES ÉLEVAGES D'ASINS ET D'ÉQUIDÉS" },

    { type: "titre", niveau: 3, texte: "II-4-1. Le cheptel" },
    {
      type: "tableau",
      kind: "libre",
      numero: 33,
      titre: "Situation des cheptels de camélidés et d’équidés",
      entetes: ["Arrondissement", "Anes", "Chameaux", "Chevaux", "Mulets", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    { type: "titre", niveau: 3, texte: "II-4-2. Exploitation du bétail" },
    { type: "titre", niveau: 4, texte: "a) Abattages contrôlés" },
    {
      type: "tableau",
      kind: "libre",
      numero: 34,
      titre: "Situation des abattages d’équidés",
      // Majuscules ici, minuscules au tableau précédent : le canevas est ainsi.
      entetes: ["Arrondissement", "ANES", "CHEVAUX", "CHAMEAUX", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "b) Production de viande en tonnes" },
    {
      type: "tableau",
      kind: "libre",
      numero: 35,
      titre: "Etat de la production de viande dans les élevages d’équidés",
      entetes: ["Arrondissement/Espèces", "ANES", "CHEVAUX", "CHAMEAUX", ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 4, texte: "c) Commercialisation des animaux" },
    {
      type: "tableau",
      kind: "libre",
      numero: 36,
      titre: "Situation de la commercialisation d’animaux sur pied dans les élevages d’équidés",
      // Ce tableau échappe à toutes les règles de la partie : pas de colonne de
      // total, pas de ligne d'arrondissement, et « Départements » en première
      // colonne. Il porte « RAS » — rien à signaler — et « TOTAL ».
      entetes: ["Départements", "Anes", "Chevaux", "Chameaux"],
      lignes: ["RAS", "TOTAL"],
    },
  ],
};

/** Les trois sections, dans l'ordre du canevas. */
export const SECTIONS_ELEVAGES = [SECTION_II_OVIN, SECTION_II_CAPRIN, SECTION_II_EQUIDES];

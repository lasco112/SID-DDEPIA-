/**
 * QUATRIÈME PARTIE — santé animale, inspection et contrôle sanitaire.
 *
 * Tableaux n° 64 à 72 du canevas, plus le tableau de promptitude et de
 * complétude, qui est propre au niveau départemental.
 *
 * PREMIÈRE SECTION DÉCRITE DIRECTEMENT D'APRÈS LE RÉGIONAL, conformément à la
 * décision du Délégué. Les listes de libellés — jusqu'à cinquante-neuf
 * affections récurrentes, cinquante produits inspectés — sont importées de
 * `libellesSanteAnimale.ts`, extrait automatiquement du .docx de la
 * DREPIA-Ouest. Aucune n'a été retapée : à cette échelle, une faute de frappe
 * passerait inaperçue et fausserait un tableau officiel.
 *
 * C'est la partie où le SID possède le plus de données : vaccinations, foyers,
 * inspections et saisies sont saisis chaque mois par les services vétérinaires.
 */
import type { SectionCanevas } from "./types";
import {
  VACCINATION_AFFECTIONS,
  ESPECES_CONSULTATIONS,
  ESPECES_DEPARASITAGES,
  ESPECES_CASTRATIONS,
  AFFECTIONS_RECURRENTES,
  ESPECES_ABATTAGES_INSPECTION,
  LESIONS_DECELEES,
  PRODUITS_SAISIS,
  PRODUITS_INSPECTES_MARCHES,
} from "./libellesSanteAnimale";

const PIED = ["TOTAL {P}", "TOTAL {P-1}", "ÉCART"];
const TOTAUX = ["TOTAL {P}", "TOTAL {P-1}"];
const LIGNES_ARRONDISSEMENTS = ["{ARRONDISSEMENTS}", ...PIED];

export const SECTION_IV_SANTE: SectionCanevas = {
  cle: "IV",
  titre: "Quatrième partie — Santé animale, inspection et contrôle sanitaire",
  blocs: [
    { type: "titre", niveau: 1, texte: "QUATRIÈME PARTIE : SANTÉ ANIMALE, INSPECTION ET CONTRÔLE SANITAIRE" },

    // ---- IV-1. Promptitude et complétude ----
    {
      type: "titre",
      niveau: 2,
      texte: "IV-1. ÉVALUATION DE LA PROMPTITUDE ET DE LA COMPLÉTUDE DANS LA TRANSMISSION DES DONNÉES ZOO-SANITAIRES",
    },
    {
      type: "zoneTexte",
      cle: "IV1.preambule",
      consigne:
        "Rubrique imposée. Elle est calculable automatiquement à partir des transmissions hebdomadaires enregistrées.",
    },
    {
      type: "tableau",
      kind: "libre",
      numero: null,
      titre: "",
      entetes: ["Arrondissement", "Situations attendues", "Situations transmises", "Complétude (%)", "Promptitude (%)"],
      lignes: ["{ARRONDISSEMENTS}"],
    },

    // ---- IV-2. Grandes épizooties ----
    { type: "titre", niveau: 2, texte: "IV-2. LUTTE CONTRE LES GRANDES ÉPIZOOTIES" },
    { type: "titre", niveau: 3, texte: "IV-2-1. Situation générale de la vaccination" },
    {
      type: "tableau",
      kind: "libre",
      numero: 64,
      titre: "Situation générale de la vaccination par affection et par arrondissement",
      entetes: ["Arrondissement", ...VACCINATION_AFFECTIONS, ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 3, texte: "IV-2-2. Surveillance sentinelle de l'influenza aviaire hautement pathogène" },
    { type: "zoneTexte", cle: "IV2.influenza", consigne: "Rubrique imposée." },
    { type: "titre", niveau: 3, texte: "IV-2-3. Bilan épidémiologique du trimestre" },
    { type: "zoneTexte", cle: "IV2.bilan", consigne: "Foyers déclarés, espèces touchées, mesures prises, dates." },

    // ---- IV-3. Dispensaires et cliniques ----
    { type: "titre", niveau: 2, texte: "IV-3. ACTIVITÉS DES DISPENSAIRES ET CLINIQUES" },
    { type: "titre", niveau: 3, texte: "IV-3-1. Consultations par espèce" },
    {
      type: "tableau",
      kind: "libre",
      numero: 65,
      titre: "Situation générale des consultations par espèces et par arrondissement",
      entetes: ["Arrondissement", ...ESPECES_CONSULTATIONS, ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 3, texte: "IV-3-2. Déparasitage des animaux" },
    {
      type: "tableau",
      kind: "libre",
      numero: 66,
      titre: "Situation générale des déparasitages par espèces et par arrondissement",
      // « Lapine » ici, « Lapin » au tableau précédent : le canevas est ainsi.
      entetes: ["Arrondissement", ...ESPECES_DEPARASITAGES, ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    { type: "titre", niveau: 3, texte: "IV-3-3. Castrations d'animaux" },
    {
      type: "tableau",
      kind: "libre",
      numero: 67,
      titre: "Situation générale des castrations par espèces et par arrondissement",
      entetes: ["Arrondissement", ...ESPECES_CASTRATIONS, ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },

    // ---- IV-4. Affections récurrentes ----
    { type: "titre", niveau: 2, texte: "IV-4. RÉCAPITULATIF DES AFFECTIONS RÉCURRENTES" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 68,
      titre: "Récapitulation des affections récurrentes",
      enteteLibelle: "Arrondissement Affections",
      lignes: [...AFFECTIONS_RECURRENTES, "TOTAL"],
    },

    // ---- IV-5. Inspection en abattoir ----
    { type: "titre", niveau: 2, texte: "IV-5. INSPECTION SANITAIRE DANS LES ABATTOIRS" },
    { type: "titre", niveau: 3, texte: "IV-5-1. Les abattages contrôlés" },
    {
      type: "tableau",
      kind: "libre",
      numero: 69,
      titre: "Situation des abattages contrôlés",
      entetes: ["Arrondissement", ...ESPECES_ABATTAGES_INSPECTION, ...TOTAUX],
      lignes: LIGNES_ARRONDISSEMENTS,
    },
    {
      type: "zoneTexte",
      cle: "IV5.controleCroise",
      consigne:
        "Contrôle obligatoire : ce tableau doit être égal à la somme des tableaux des abattages par espèce (bovins, ovins, caprins, porcins, volaille).",
    },
    { type: "titre", niveau: 3, texte: "IV-5-2. Lésions décelées en inspection" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 70,
      titre: "Récapitulatif des lésions décelées en inspection",
      enteteLibelle: "Arrondissement",
      lignes: [...LESIONS_DECELEES, "TOTAL"],
    },
    { type: "titre", niveau: 3, texte: "IV-5-3. Saisies effectuées" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 71,
      titre: "Récapitulatif des saisies effectuées après inspection",
      enteteLibelle: "Produits",
      lignes: [...PRODUITS_SAISIS, "TOTAL"],
    },

    // ---- IV-6. Contrôle sur les marchés ----
    { type: "titre", niveau: 2, texte: "IV-6. CONTRÔLE SANITAIRE SUR LES MARCHÉS" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 72,
      titre: "Récapitulatif des produits inspectés sur les marchés",
      enteteLibelle: "Arrondissement",
      lignes: [...PRODUITS_INSPECTES_MARCHES, "TOTAL"],
    },

    // ---- IV-7 à IV-9 ----
    { type: "titre", niveau: 2, texte: "IV-7. AUTRES ACTIVITÉS DU SERVICE" },
    { type: "zoneTexte", cle: "IV7.autres", consigne: "Rubrique imposée." },
    { type: "titre", niveau: 2, texte: "IV-8. CARTOGRAPHIE DES VÉTÉRINAIRES INSTALLÉS EN CLIENTÈLE PRIVÉE" },
    { type: "zoneTexte", cle: "IV8.cartographie", consigne: "Rubrique imposée." },
    { type: "titre", niveau: 2, texte: "IV-9. CARTE ÉPIDÉMIOLOGIQUE ACTUALISÉE DU DÉPARTEMENT" },
    { type: "zoneTexte", cle: "IV9.carte", consigne: "Rubrique imposée." },

    // ---- Conclusion ----
    { type: "titre", niveau: 1, texte: "CONCLUSION GÉNÉRALE" },
    {
      type: "zoneTexte",
      cle: "conclusion",
      consigne: "Synthèse du trimestre, difficultés majeures et perspectives.",
    },
  ],
};

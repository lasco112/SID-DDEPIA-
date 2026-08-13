/**
 * PREMIÈRE PARTIE du canevas trimestriel — mise en œuvre du budget-programme.
 *
 * Transcription littérale des tableaux #17 à #20 de
 * docs/CANEVAS_TRIMESTRIEL.md.
 *
 * Cette partie est d'une régularité parfaite : quatre programmes, et pour
 * chacun le même enchaînement — présentation, activités menées, un tableau de
 * cinq colonnes, un rappel de méthode. Le canevas ne donne AUCUN libellé de
 * ligne : les lignes sont libres, à remplir selon les activités du trimestre.
 * Il ne donne pas non plus de légende à ces quatre tableaux, qui n'apparaissent
 * donc pas dans la liste des tableaux.
 *
 * Aucun de ces tableaux n'est alimenté par le SID : les activités du
 * budget-programme ne sont saisies nulle part. Ils sortent avec leurs lignes
 * vides, à remplir par le Délégué — comme la fiche papier.
 */
import type { SectionCanevas } from "./types";

/** Trois lignes vides, comme le canevas les prévoit. */
const LIGNES_LIBRES = ["", "", ""];

const COLONNES_ACTIVITES = ["Code action", "Activité", "Tâche", "Réalisation du trimestre", "Observations"];

const RAPPEL_QUANTITES =
  "Les quantités doivent être saisies dans des colonnes dédiées et non noyées dans les observations.";
const RAPPEL_PRESENTATION = "Rappel de l'objet du programme et des actions retenues pour l'exercice.";

/** Un programme : présentation, activités, tableau, rappel de méthode. */
function programme(code: string, intitule: string) {
  return [
    { type: "titre" as const, niveau: 2 as const, texte: `PROGRAMME ${code} : ${intitule}` },
    { type: "titre" as const, niveau: 3 as const, texte: "Présentation" },
    { type: "zoneTexte" as const, cle: `BP.${code}.presentation`, consigne: RAPPEL_PRESENTATION },
    { type: "titre" as const, niveau: 3 as const, texte: "Activités menées" },
    {
      type: "tableau" as const,
      kind: "libre" as const,
      numero: null,
      titre: "",
      entetes: COLONNES_ACTIVITES,
      lignes: LIGNES_LIBRES,
    },
    { type: "zoneTexte" as const, cle: `BP.${code}.methode`, consigne: RAPPEL_QUANTITES },
  ];
}

export const SECTION_BUDGET: SectionCanevas = {
  cle: "BUDGET",
  titre: "Première partie — Mise en œuvre du budget-programme",
  blocs: [
    { type: "titre", niveau: 1, texte: "PREMIÈRE PARTIE : MISE EN ŒUVRE DU BUDGET-PROGRAMME" },
    ...programme("053", "DÉVELOPPEMENT DES PRODUCTIONS ET DES INDUSTRIES ANIMALES"),
    ...programme("055", "AMÉLIORATION DE LA COUVERTURE SANITAIRE DES CHEPTELS ET LUTTE CONTRE LES ZOONOSES"),
    ...programme("057", "DÉVELOPPEMENT DES PRODUCTIONS HALIEUTIQUES"),
    ...programme("059", "AMÉLIORATION DU CADRE INSTITUTIONNEL"),
  ],
};

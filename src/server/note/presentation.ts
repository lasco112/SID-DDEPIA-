/**
 * Ce que les trois rendus de la note (PowerPoint, Word, PDF) partagent : les
 * couleurs, les textes de l'évolution, l'ordre des diapositives. Un seul
 * endroit, pour que les trois documents disent la même chose.
 */
import { nb, aLaPeriode, type FaitSaillant, type Indicateur, type NoteSituation } from "./noteSituation";

export const COULEURS = {
  primaire: "397781",
  fonce: "2F4147",
  clair: "E9F5F4",
  ligne: "DCE7E9",
  gris: "667A80",
  vert: "3E8F71",
  rouge: "B84F55",
  ambre: "A87A2A",
  series: ["397781", "D9A84E", "609CC7", "B84F55", "5DAF91", "7F7F7F"],
};

/** Ce que le Délégué a retouché avant de télécharger. */
export interface Retouches {
  /** Les faits saillants retenus, dans l'ordre, tels qu'il les a écrits. */
  faits?: FaitSaillant[];
  /** Ses remarques : le contexte que les chiffres ne disent pas. */
  remarques?: string;
}

export const faitsRetenus = (note: NoteSituation, r: Retouches) => r.faits ?? note.faits;

/** Les indicateurs qui ont un chiffre : une note rapide ne montre pas de cases vides. */
export const indicateursAffiches = (note: NoteSituation) => note.indicateurs.filter((i) => i.valeur != null);

export const valeurTexte = (i: Indicateur) => nb(i.valeur!, i.decimales);

/** « ▲ +22,2 % » (vert si c'est une bonne nouvelle), ou « — » sans comparaison. */
export function evolutionTexte(i: Indicateur): { texte: string; couleur: string } {
  if (i.evolution == null) return { texte: "—", couleur: COULEURS.gris };
  if (Math.abs(i.evolution) < 0.05) return { texte: "= stable", couleur: COULEURS.gris };
  const hausse = i.evolution > 0;
  const bon = hausse === i.hausseFavorable;
  return {
    texte: `${hausse ? "▲ +" : "▼ −"}${nb(Math.abs(i.evolution), 1)} %`,
    couleur: bon ? COULEURS.vert : COULEURS.rouge,
  };
}

/** « Comparaison : 3e trimestre 2025 (même période l'an passé) ». */
export function phraseComparaison(note: NoteSituation): string {
  if (!note.comparaison) return "Sans comparaison : le SID n'a pas de période de référence pour ces mois.";
  return note.comparaison.nature === "an_passe"
    ? `Évolutions calculées par rapport ${aLaPeriode(note.comparaison.libelle)} (même période l'an passé).`
    : `Évolutions calculées par rapport à la période précédente : ${note.comparaison.libelle}.`;
}

export function phraseCouverture(note: NoteSituation): string {
  const c = note.couverture;
  return c.recus === c.attendus
    ? `Chiffres complets : ${c.recus} rapports mensuels transmis sur ${c.attendus}.`
    : `Chiffres provisoires : ${c.recus} rapports mensuels transmis sur ${c.attendus}.`;
}

export const titreNote = "Situation de l'élevage, des pêches et des industries animales";

export const sousTitreNote = (note: NoteSituation) => `Département ${note.departement.nomAvecArticle} — ${note.periode.libelle}`;

export const nomFichierNote = (note: NoteSituation, ext: string) => {
  const p = `${note.periode.debut.annee}-${String(note.periode.debut.mois).padStart(2, "0")}` +
    (note.periode.nbMois > 1 ? `_${note.periode.fin.annee}-${String(note.periode.fin.mois).padStart(2, "0")}` : "");
  return `Note_de_situation_${note.departement.sigle.replace(/[^A-Za-z0-9-]/g, "")}_${p}.${ext}`;
};

/** Les indicateurs d'un thème, dans l'ordre voulu, quand ils ont un chiffre. */
export const indicateursDe = (note: NoteSituation, cles: string[]) =>
  cles.map((c) => note.indicateurs.find((i) => i.cle === c)).filter((i): i is Indicateur => Boolean(i && i.valeur != null));

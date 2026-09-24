/**
 * Comment chaque tableau se nomme dans les phrases d'analyse.
 *
 * Un tableau n'est analysé automatiquement que s'il figure ici. Sont laissés
 * de côté, À DESSEIN, les tableaux dont les colonnes ne s'additionnent pas :
 * prix et quantités (cuirs, commercialisation), kilogrammes et boîtes
 * (saisies, produits inspectés), litres et kilogrammes (apiculture), texte
 * (organisations, listes). Leur « total » ne voudrait rien dire, et une
 * phrase calculée sur lui serait fausse. L'agent peut y écrire une analyse
 * lui-même.
 */
import type { SujetTableau } from "./analyseTableau";

const s = (sujet: string, unite: string, o: Partial<SujetTableau> = {}): SujetTableau => ({
  sujet,
  pluriel: /^Les /.test(sujet),
  unite,
  ...o,
});

/** Tableaux dont les lignes (ou colonnes) de détail sont des mois ou des listes : pas de « rubrique dominante ». */
const SANS_DETAIL = { detail: false } as const;

export const SUJETS: Record<number, SujetTableau> = {
  // I — Organisation et ressources
  101: s("Les structures administratives", "structures"),
  1: s("Les besoins en nouvelles structures", "structures"),
  2: s("Les postes de responsabilité à pourvoir", "postes"),
  3: s("Le personnel en poste", "agents"),
  4: s("Les besoins en personnel", "agents"),
  5: s("Les mouvements de personnel", "agents"),
  6: s("Les cas disciplinaires", "agents"),
  8: s("Le matériel de transport en service", "engins"),
  9: s("Les besoins en matériel de transport", "engins"),
  10: s("Les équipements", "équipements"),
  13: s("Les recettes", "FCFA", SANS_DETAIL),

  // II-1 — Bovins
  14: s("Le cheptel bovin", "têtes"),
  16: s("Les abattages contrôlés de bovins", "têtes"),
  18: s("La production de viande bovine", "tonnes"),
  22: s("La circulation intérieure des bovins", "têtes"),

  // II-2 à II-4 — Ovins, caprins, équidés
  23: s("Le cheptel ovin", "têtes"),
  24: s("Les abattages d’ovins", "têtes"),
  25: s("La production de viande ovine", "tonnes"),
  27: s("La circulation intérieure des ovins", "têtes", SANS_DETAIL),
  28: s("Le cheptel caprin", "têtes"),
  29: s("Les abattages de caprins", "têtes"),
  30: s("La production de viande caprine", "tonnes"),
  32: s("La circulation intérieure des caprins", "têtes", SANS_DETAIL),
  33: s("Les cheptels d’équidés et de camélidés", "têtes"),
  34: s("Les abattages d’équidés", "têtes"),
  35: s("La production de viande d’équidés", "tonnes"),
  36: s("La commercialisation d’équidés sur pied", "têtes"),

  // II-5 — Porcins
  37: s("Le cheptel porcin", "têtes"),
  38: s("Les organisations de producteurs porcins", "organisations"),
  39: s("Les abattages de porcins", "têtes"),
  40: s("La production de viande porcine", "tonnes"),
  109: s("La circulation intérieure des porcins", "têtes", SANS_DETAIL),

  // II-6 — Aviculture
  43: s("La commercialisation de volailles sur pied", "sujets"),
  44: s("La commercialisation de volailles sur pied", "sujets"),
  45: s("Les abattages contrôlés de volaille", "sujets"),
  46: s("La production de viande de volaille", ""),
  47: s("La production d’œufs", ""),
  49: s("La consommation de produits connexes de l’aviculture", "tonnes"),

  // II-7 — Autres élevages
  51: s("Les cheptels non conventionnels", "têtes"),
  54: s("Les animaux de compagnie", "têtes"),

  // III — Pêche et aquaculture
  55: s("Les pêcheurs", "pêcheurs"),
  56: s("Les équipements de pêche", ""),
  57: s("Les engins de pêche", ""),
  59: s("Les captures", "tonnes"),
  60: s("Les ressources générées par la pêche", ""),
  62: s("La production d’alevins", "alevins"),

  // IV — Santé animale et inspection
  64: s("Les vaccinations", "animaux vaccinés"),
  113: s("Les prélèvements dans les fermes avicoles", "prélèvements", SANS_DETAIL),
  65: s("Les consultations", "animaux"),
  66: s("Les déparasitages", "animaux"),
  67: s("Les castrations", "animaux"),
  68: s("Les cas d’affections récurrentes", "cas"),
  69: s("Les abattages inspectés", "têtes"),
  70: s("Les lésions décelées en inspection", "cas"),
};

/**
 * Les onze sections du canevas, dans l'ordre — et ce qu'on en déduit.
 *
 * Séparé de rapportCanevas.ts pour que le remplissage et la saisie puissent
 * connaître la structure du canevas sans dépendre du générateur de document.
 */
import { SECTION_I } from "./sectionI";
import { SECTION_BUDGET } from "./sectionBudget";
import { SECTION_II_BOVIN } from "./sectionBovin";
import { SECTION_II_OVIN, SECTION_II_CAPRIN, SECTION_II_EQUIDES } from "./sectionElevages";
import { SECTION_II_PORCIN, SECTION_II_AVICOLE } from "./sectionPorcinAvicole";
import { SECTION_II_AUTRES, SECTION_III_PECHE } from "./sectionPecheEtDivers";
import { SECTION_IV_SANTE } from "./sectionSanteAnimale";
import { axeTerritorial } from "./structure";
import type { SectionCanevas } from "./types";

export const SECTIONS_CANEVAS: SectionCanevas[] = [
  SECTION_I, SECTION_BUDGET, SECTION_II_BOVIN, SECTION_II_OVIN, SECTION_II_CAPRIN,
  SECTION_II_EQUIDES, SECTION_II_PORCIN, SECTION_II_AVICOLE, SECTION_II_AUTRES,
  SECTION_III_PECHE, SECTION_IV_SANTE,
];

/** Les tableaux du Bureau des Affaires Communes : départementaux par nature. */
export const TABLEAUX_BAC = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 101, 102]);

/**
 * Les tableaux SANS maille territoriale — budget-programme, contraintes, BIP,
 * vétérinaires, bilan épidémiologique… Chacun existe en une version par
 * portée : celle du département, et celle de chaque arrondissement, que son
 * DA remplit pour SON rapport. Les tableaux du BAC restent départementaux :
 * le rapport d'un arrondissement les reprend tels que le chef BAC les tient.
 */
export function numerosSansMaille(): Set<number> {
  const s = new Set<number>();
  for (const section of SECTIONS_CANEVAS) {
    for (const b of section.blocs) {
      if (b.type === "tableau" && b.numero != null && axeTerritorial(b) === null && !TABLEAUX_BAC.has(b.numero)) s.add(b.numero);
    }
  }
  return s;
}

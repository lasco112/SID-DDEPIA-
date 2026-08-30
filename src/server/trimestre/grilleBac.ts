/**
 * Les grilles de saisie du chef BAC — construites depuis le canevas lui-même.
 *
 * Aucune structure n'est décrite ici : les lignes et les colonnes sont celles
 * que le canevas imprime, obtenues par les mêmes fonctions que le rendu du
 * document (`lignesDe`, `colonnesDe`). L'écran de saisie et le rapport ne
 * peuvent donc pas diverger — si le canevas gagne une ligne, elle apparaît à la
 * saisie sans autre intervention.
 */
import type { PrismaClient } from "@prisma/client";
import { SECTIONS_CANEVAS } from "./rapportCanevas";
import { colonnesDe, lignesDe } from "./canevas/rendu";
import type { Bloc, ContexteCanevas } from "./canevas/types";
import { TABLEAUX_SAISIS_A_LA_MAIN, cleCellule, type ValeurCellule } from "./saisieCanevas";
import { listerArrondissements } from "@/lib/arrondissements";
import { identiteDepartement } from "@/lib/departement";
import { type Periode, libelleCourt, memePeriodeAnneePrecedente, moisDeLaPeriode } from "../periodes/calendrier";

const MOIS_MAJ = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

export interface GrilleTableau {
  numero: number;
  titre: string;
  /** L'intitulé de la première colonne — « STRUCTURES », « MOIS »… */
  enteteLigne: string;
  colonnes: string[];
  lignes: string[];
  /** Combien de cellules sont déjà renseignées. */
  renseignees: number;
}

/**
 * Les grilles des treize tableaux du BAC, dans l'ordre du canevas.
 *
 * `saisies` sert seulement à compter ce qui est déjà rempli : les valeurs
 * elles-mêmes sont renvoyées à part, cellule par cellule.
 */
export async function grillesBac(
  db: PrismaClient,
  periode: Periode,
  saisies: Map<string, ValeurCellule>
): Promise<GrilleTableau[]> {
  const arrondissements = await listerArrondissements(db);
  await identiteDepartement(db); // refuse tôt si la session n'est pas cloisonnée

  const ctx: ContexteCanevas = {
    periodeCourt: libelleCourt(periode),
    periodeCourtN1: libelleCourt(memePeriodeAnneePrecedente(periode)),
    annee: periode.annee,
    mois: moisDeLaPeriode(periode).map((m) => MOIS_MAJ[m.mois - 1]),
    arrondissements: arrondissements.map((a) => a.nom),
  };

  const grilles: GrilleTableau[] = [];

  for (const section of SECTIONS_CANEVAS) {
    for (const bloc of section.blocs as Bloc[]) {
      if (bloc.type !== "tableau") continue;
      if (bloc.numero == null) continue;
      if (!(TABLEAUX_SAISIS_A_LA_MAIN as readonly number[]).includes(bloc.numero)) continue;

      const colonnes = colonnesDe(bloc, ctx);
      const lignes = lignesDe(bloc, ctx);

      // La première colonne porte les libellés de ligne : elle ne se saisit pas.
      const [enteteLigne, ...colonnesSaisies] = colonnes;

      let renseignees = 0;
      for (const l of lignes) {
        for (const c of colonnesSaisies) {
          if (saisies.has(cleCellule({ numeroTableau: bloc.numero, ligne: l, colonne: c }))) renseignees++;
        }
      }

      grilles.push({
        numero: bloc.numero,
        titre: bloc.titre,
        enteteLigne,
        colonnes: colonnesSaisies,
        lignes,
        renseignees,
      });
    }
  }

  return grilles.sort((a, b) => a.numero - b.numero);
}

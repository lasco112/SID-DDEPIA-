/**
 * Éléments partagés entre le générateur de référence et le test.
 * Une seule définition, pour que les deux ne puissent pas diverger.
 */
import path from "node:path";

/**
 * Valeurs qui changent à chaque exécution sans qu'aucun chiffre n'ait bougé.
 * Les comparer ferait échouer le test tous les jours, et on finirait par ne
 * plus le regarder.
 */
export const CHAMPS_VOLATILES = ["DATE_GENERATION"];

export function cheminFixture(annee: number, mois: number): string {
  return path.join(
    process.cwd(),
    "tests",
    "fixtures",
    `golden_mensuel_${annee}-${String(mois).padStart(2, "0")}.json`
  );
}

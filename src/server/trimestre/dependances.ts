/**
 * Les tableaux du trimestre qui DÉPENDENT d'un autre (demande du Délégué,
 * 20 octobre 2026 : lors d'une correction, tous les liens doivent être pris
 * en compte).
 *
 *  - la viande se calcule à partir des abattages saisis par catégorie :
 *    16 → 18 (bovins), 39 → 40 (porcins), 45 → 46 (volailles) — liaison.ts ;
 *  - les infrastructures du BAC se recopient dans celles de l'élevage bovin :
 *    7 → 15 — canevas/reprises.ts.
 *
 * La liste se lit sur ces deux déclarations, jamais recopiée ici : un lien
 * ajouté demain y sera pris en compte sans y penser.
 */
import { LIAISONS } from "./liaison";
import { REPRISES } from "./canevas/reprises";

/** Les tableaux dont l'affichage change quand une case de `numero` change — en cascade. */
export function tableauxDependants(numero: number): number[] {
  const vus = new Set<number>([numero]);
  const file = [numero];
  while (file.length) {
    const n = file.pop()!;
    const directs = [
      ...LIAISONS.filter((l) => l.correspondances.some((c) => c.depuisSaisie?.tableau === n)).map((l) => l.numero),
      ...REPRISES.filter((r) => r.source === n).map((r) => r.tableau),
    ];
    for (const d of directs) {
      if (vus.has(d)) continue;
      vus.add(d);
      file.push(d);
    }
  }
  vus.delete(numero);
  return Array.from(vus).sort((a, b) => a - b);
}

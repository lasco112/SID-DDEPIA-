/**
 * aggregationRules.ts — Règle STOCK/SOMME/MOYENNE par champ (CDC §A.7 règle 5).
 * ---------------------------------------------------------------------------
 * Le schéma Prisma est fourni tel quel (ne pas le modifier) et ne porte pas
 * cette règle sur FormField ; elle est donc relue depuis le dictionnaire de
 * données validé (source de vérité), une seule fois par processus serveur.
 */
import { parseDictionnaire } from "../../prisma/seed-lib/parseDictionnaire";

let cache: Map<string, "STOCK" | "SOMME" | "MOYENNE"> | null = null;

export function getAgregationParChamp(): Map<string, "STOCK" | "SOMME" | "MOYENNE"> {
  if (cache) return cache;
  cache = new Map();
  for (const tableau of parseDictionnaire()) {
    for (const champ of tableau.champs) {
      cache.set(champ.code, champ.agregation);
    }
  }
  return cache;
}

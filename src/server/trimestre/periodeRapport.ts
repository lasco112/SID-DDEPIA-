/**
 * La période d'un rapport du canevas : trimestre, semestre ou année.
 *
 * Même canevas, mêmes étapes ; seul le nombre de mois change (décision du
 * Délégué, 28 septembre 2026). Le semestre et l'année se produisent avec le
 * trimestre qui les clôt — le T2 pour le premier semestre, le T4 pour le
 * second et pour l'année — et suivent SON circuit : une seule transmission du
 * DA, une seule validation des chefs, pour tous les rapports de la période.
 */
import { type Periode, annuelle, semestrielle, trimestrielle, libelleCourt } from "../periodes/calendrier";
import { trimestreDeCloture } from "./rubriques";

export type TypeRapport = "TRIMESTRIEL" | "SEMESTRIEL" | "ANNUEL";

/**
 * Lit la période demandée. `type` absent : un trimestre, désigné par
 * `trimestre` (l'ancienne forme des requêtes, toujours acceptée). Rend null si
 * la demande est incomplète ou impossible — jamais une période devinée.
 */
export function periodeDuRapport(o: { annee?: unknown; type?: unknown; rang?: unknown; trimestre?: unknown }): Periode | null {
  const annee = Number(o.annee);
  if (o.annee == null || o.annee === "" || !Number.isInteger(annee) || annee < 2000 || annee > 2100) return null;
  const type = (o.type ?? "TRIMESTRIEL") as TypeRapport;
  const rangBrut = o.rang ?? o.trimestre;
  const rang = Number(rangBrut);
  try {
    if (type === "ANNUEL") return annuelle(annee);
    if (rangBrut == null || rangBrut === "" || !Number.isInteger(rang)) return null;
    if (type === "SEMESTRIEL") return semestrielle(annee, rang);
    if (type === "TRIMESTRIEL") return trimestrielle(annee, rang);
    return null;
  } catch {
    return null; // rang hors limites
  }
}

/** Le trimestre dont le circuit gouverne ce rapport : lui-même, ou celui qui clôt le semestre ou l'année. */
export function periodeDuCircuit(p: Periode): Periode {
  return p.type === "TRIMESTRIEL" ? p : trimestreDeCloture(p);
}

/** « 2026-T3 », « 2026-S1 », « 2026 » — pour le journal d'activité. */
export function cleDeRapport(p: Periode): string {
  return p.type === "ANNUEL" ? String(p.annee) : `${p.annee}-${libelleCourt(p).split(" ")[0]}`;
}

/**
 * Les rapports que produit la clôture d'un trimestre : lui seul, et au T2 le
 * premier semestre, au T4 le second semestre et l'année.
 */
export function rapportsDuTrimestre(t: Periode): Periode[] {
  if (t.type !== "TRIMESTRIEL") return [t];
  if (t.rang === 2) return [t, semestrielle(t.annee, 1)];
  if (t.rang === 4) return [t, semestrielle(t.annee, 2), annuelle(t.annee)];
  return [t];
}

/**
 * Le choix d'un rapport du canevas à l'écran : trimestriel, semestriel ou
 * annuel (décision du Délégué, 28 septembre 2026). Côté navigateur : aucun
 * import serveur.
 */

export type TypeRapport = "TRIMESTRIEL" | "SEMESTRIEL" | "ANNUEL";

export interface ChoixRapport {
  annee: number;
  type: TypeRapport;
  /** Trimestre (1-4), semestre (1-2) ; 1 pour l'année. */
  rang: number;
}

export interface OptionRapport extends ChoixRapport {
  libelle: string;
  /** Nombre de mois de la période, et combien existent en base. */
  mois: number;
  moisPresents?: number;
}

const ORDINAL = ["Premier", "Deuxième", "Troisième", "Quatrième"];

export function libelleRapport(c: ChoixRapport): string {
  if (c.type === "ANNUEL") return `Année ${c.annee}`;
  if (c.type === "SEMESTRIEL") return `${ORDINAL[c.rang - 1]} semestre ${c.annee}`;
  return `${ORDINAL[c.rang - 1]} trimestre ${c.annee}`;
}

/** La requête de l'API : `annee=2026&type=SEMESTRIEL&rang=1`. */
export function requeteRapport(c: ChoixRapport): string {
  return `annee=${c.annee}&type=${c.type}&rang=${c.rang}`;
}

/**
 * Les rapports possibles, à partir des trimestres qui ont au moins un mois en
 * base : ces trimestres, les semestres et les années qui les contiennent.
 */
export function optionsDeRapports(trimestres: { annee: number; trimestre: number; moisPresents?: number }[]): OptionRapport[] {
  const presents = (annee: number, de: number, a: number) =>
    trimestres.filter((t) => t.annee === annee && t.trimestre >= de && t.trimestre <= a).reduce((n, t) => n + (t.moisPresents ?? 0), 0);
  const annees = Array.from(new Set(trimestres.map((t) => t.annee))).sort((a, b) => b - a);
  const options: OptionRapport[] = [];
  for (const t of trimestres) {
    options.push({ annee: t.annee, type: "TRIMESTRIEL", rang: t.trimestre, libelle: libelleRapport({ annee: t.annee, type: "TRIMESTRIEL", rang: t.trimestre }), mois: 3, moisPresents: t.moisPresents });
  }
  for (const annee of annees) {
    for (const s of [2, 1]) {
      if (!trimestres.some((t) => t.annee === annee && Math.ceil(t.trimestre / 2) === s)) continue;
      const c: ChoixRapport = { annee, type: "SEMESTRIEL", rang: s };
      options.push({ ...c, libelle: libelleRapport(c), mois: 6, moisPresents: trimestres[0]?.moisPresents != null ? presents(annee, 2 * s - 1, 2 * s) : undefined });
    }
    const c: ChoixRapport = { annee, type: "ANNUEL", rang: 1 };
    options.push({ ...c, libelle: libelleRapport(c), mois: 12, moisPresents: trimestres[0]?.moisPresents != null ? presents(annee, 1, 4) : undefined });
  }
  return options;
}

/** La période demandée par l'adresse (lien de la page d'accueil) : `?annee=2026&type=SEMESTRIEL&rang=1`. */
export function choixDepuisAdresse(): ChoixRapport | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const annee = Number(q.get("annee"));
  const type = q.get("type") as TypeRapport | null;
  const rang = Number(q.get("rang") ?? 1);
  if (!annee || !type || !["TRIMESTRIEL", "SEMESTRIEL", "ANNUEL"].includes(type) || !Number.isInteger(rang)) return null;
  return { annee, type, rang };
}

/**
 * Couche calendrier — étape E3 du chantier trimestriel.
 *
 * Le SID sait aujourd'hui compter les mois. Il ne sait pas ce qu'est un
 * trimestre. Ce module lui apprend à raisonner en périodes, INDÉPENDAMMENT du
 * rapport : il ne connaît ni la base, ni Prisma, ni le canevas, ni les
 * arrondissements.
 *
 * Règles que ce fichier s'impose, et qu'il faut préserver :
 *
 *   - FONCTIONS PURES. Aucun accès base, aucune lecture d'horloge, aucun
 *     effet de bord. Deux appels identiques donnent le même résultat, en
 *     juillet comme en janvier, sur le serveur comme sur le téléphone d'un DA
 *     hors ligne.
 *   - AUCUN IMPORT DU MODULE MENSUEL. Le mensuel est en production et a déjà
 *     servi à clôturer des cycles réels ; ce module ne doit pas pouvoir le
 *     casser.
 *   - TOUT EN UTC. Le Cameroun est à UTC+1 sans heure d'été, mais les serveurs
 *     Railway tournent en UTC et les téléphones dans le fuseau local. Fabriquer
 *     une date en heure locale ferait basculer « 1er avril » au « 31 mars »
 *     selon la machine. Toutes les dates produites ici sont en UTC.
 *
 * Une période ne franchit JAMAIS une année civile : un trimestre, un semestre
 * et une année sont toujours entièrement contenus dans leur millésime. C'est ce
 * qui permet de la décrire par un simple couple (année, rang).
 */

/** Correspond aux valeurs de l'énumération Prisma `TypePeriode`, sans en dépendre. */
export type TypePeriode = "MENSUEL" | "TRIMESTRIEL" | "SEMESTRIEL" | "ANNUEL";

/**
 * Une période, sous sa forme normalisée.
 *
 * `rang` se lit selon le type : le mois (1-12), le trimestre (1-4), le
 * semestre (1-2). Pour ANNUEL il vaut toujours 1 — l'année n'a qu'un rang.
 */
export interface Periode {
  type: TypePeriode;
  annee: number;
  rang: number;
}

/** Combien de rangs comporte une année, pour chaque type. */
const RANGS_PAR_AN: Record<TypePeriode, number> = {
  MENSUEL: 12,
  TRIMESTRIEL: 4,
  SEMESTRIEL: 2,
  ANNUEL: 1,
};

/** Combien de mois couvre un rang, pour chaque type. */
const MOIS_PAR_RANG: Record<TypePeriode, number> = {
  MENSUEL: 1,
  TRIMESTRIEL: 3,
  SEMESTRIEL: 6,
  ANNUEL: 12,
};

const MOIS_FR = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

const ORDINAUX = ["PREMIER", "DEUXIÈME", "TROISIÈME", "QUATRIÈME"];

/** Levée quand une période décrite n'existe pas au calendrier. */
export class PeriodeInvalideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodeInvalideError";
  }
}

/**
 * Construit une période après vérification.
 *
 * On valide à la construction plutôt qu'à l'usage : un cinquième trimestre doit
 * être refusé à l'entrée du système, pas produire un rapport silencieusement
 * faux trois écrans plus loin.
 */
export function periode(type: TypePeriode, annee: number, rang: number): Periode {
  if (!Number.isInteger(annee) || annee < 1900 || annee > 2200) {
    throw new PeriodeInvalideError(`Année hors limites : ${annee}`);
  }
  if (!Number.isInteger(rang)) {
    throw new PeriodeInvalideError(`Rang non entier : ${rang}`);
  }
  const max = RANGS_PAR_AN[type];
  if (max === undefined) throw new PeriodeInvalideError(`Type de période inconnu : ${type}`);
  if (rang < 1 || rang > max) {
    throw new PeriodeInvalideError(
      `Rang ${rang} impossible pour une période ${type} : attendu entre 1 et ${max}.`
    );
  }
  return { type, annee, rang };
}

/** Période mensuelle — raccourci de lecture. */
export function mensuelle(annee: number, mois: number): Periode {
  return periode("MENSUEL", annee, mois);
}

/** Période trimestrielle — raccourci de lecture. */
export function trimestrielle(annee: number, trimestre: number): Periode {
  return periode("TRIMESTRIEL", annee, trimestre);
}

/** Période semestrielle — raccourci de lecture. */
export function semestrielle(annee: number, semestre: number): Periode {
  return periode("SEMESTRIEL", annee, semestre);
}

/** Période annuelle — raccourci de lecture. */
export function annuelle(annee: number): Periode {
  return periode("ANNUEL", annee, 1);
}

/** Premier mois de la période, de 1 à 12. */
export function premierMois(p: Periode): number {
  return (p.rang - 1) * MOIS_PAR_RANG[p.type] + 1;
}

/** Dernier mois de la période, de 1 à 12. */
export function dernierMois(p: Periode): number {
  return premierMois(p) + MOIS_PAR_RANG[p.type] - 1;
}

/**
 * Les mois qui composent la période, dans l'ordre.
 *
 * C'est la fonction dont dépendra le moteur d'agrégation (E4) : consolider un
 * trimestre, c'est parcourir ces mois et leur appliquer la règle propre à
 * chaque indicateur — somme pour un flux, dernière valeur pour un stock.
 */
export function moisDeLaPeriode(p: Periode): { annee: number; mois: number }[] {
  const debut = premierMois(p);
  return Array.from({ length: MOIS_PAR_RANG[p.type] }, (_, i) => ({
    annee: p.annee,
    mois: debut + i,
  }));
}

/** Date d'ouverture : premier jour du premier mois, à minuit UTC. Incluse. */
export function dateOuverture(p: Periode): Date {
  return new Date(Date.UTC(p.annee, premierMois(p) - 1, 1, 0, 0, 0, 0));
}

/**
 * Borne de fin EXCLUSIVE : minuit UTC du premier jour de la période suivante.
 *
 * C'est la borne à utiliser dans les requêtes (`< dateFinExclusive`). Comparer
 * à une fin « inclusive » à 23:59:59.999 laisse passer les valeurs tombées dans
 * la dernière milliseconde du jour — un classique, et invisible en test.
 */
export function dateFinExclusive(p: Periode): Date {
  return new Date(Date.UTC(p.annee, dernierMois(p), 1, 0, 0, 0, 0));
}

/**
 * Date de clôture, dernière milliseconde de la période, en UTC.
 * Destinée à l'AFFICHAGE. Pour filtrer, préférer `dateFinExclusive`.
 */
export function dateCloture(p: Periode): Date {
  return new Date(dateFinExclusive(p).getTime() - 1);
}

/**
 * La période précédente de même type.
 * Franchit l'année : le premier trimestre 2026 est précédé du quatrième 2025.
 */
export function periodePrecedente(p: Periode): Periode {
  if (p.rang > 1) return periode(p.type, p.annee, p.rang - 1);
  return periode(p.type, p.annee - 1, RANGS_PAR_AN[p.type]);
}

/** La période suivante de même type. Franchit l'année de la même façon. */
export function periodeSuivante(p: Periode): Periode {
  if (p.rang < RANGS_PAR_AN[p.type]) return periode(p.type, p.annee, p.rang + 1);
  return periode(p.type, p.annee + 1, 1);
}

/**
 * La même période, l'année précédente — la comparaison N-1 du canevas.
 * À ne pas confondre avec `periodePrecedente` : 53 des 72 tableaux du
 * référentiel trimestriel demandent celle-ci, pas celle-là.
 */
export function memePeriodeAnneePrecedente(p: Periode): Periode {
  return periode(p.type, p.annee - 1, p.rang);
}

/** Libellé officiel, tel qu'il doit apparaître dans le document. */
export function libelleOfficiel(p: Periode): string {
  switch (p.type) {
    case "MENSUEL":
      return `${MOIS_FR[p.rang - 1]} ${p.annee}`;
    case "TRIMESTRIEL":
      return `${ORDINAUX[p.rang - 1]} TRIMESTRE ${p.annee}`;
    case "SEMESTRIEL":
      return `${ORDINAUX[p.rang - 1]} SEMESTRE ${p.annee}`;
    case "ANNUEL":
      return `ANNÉE ${p.annee}`;
  }
}

/** Libellé court, pour les listes déroulantes et les noms de fichiers. */
export function libelleCourt(p: Periode): string {
  switch (p.type) {
    case "MENSUEL":
      return `${String(p.rang).padStart(2, "0")}/${p.annee}`;
    case "TRIMESTRIEL":
      return `T${p.rang} ${p.annee}`;
    case "SEMESTRIEL":
      return `S${p.rang} ${p.annee}`;
    case "ANNUEL":
      return `${p.annee}`;
  }
}

/**
 * Clé stable, utilisable comme identifiant technique et comme clé de tri
 * alphabétique (2026-T1 précède 2026-T2, et 2025-T4 les précède tous deux).
 */
export function cle(p: Periode): string {
  const prefixe = { MENSUEL: "M", TRIMESTRIEL: "T", SEMESTRIEL: "S", ANNUEL: "A" }[p.type];
  return `${p.annee}-${prefixe}${String(p.rang).padStart(2, "0")}`;
}

/** Vrai si les deux périodes désignent exactement la même chose. */
export function memePeriode(a: Periode, b: Periode): boolean {
  return a.type === b.type && a.annee === b.annee && a.rang === b.rang;
}

/**
 * La période de ce type qui contient ce mois.
 * Exemple : le mois de juillet 2026 tombe dans le troisième trimestre 2026.
 */
export function periodeContenant(type: TypePeriode, annee: number, mois: number): Periode {
  if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
    throw new PeriodeInvalideError(`Mois hors limites : ${mois}`);
  }
  return periode(type, annee, Math.floor((mois - 1) / MOIS_PAR_RANG[type]) + 1);
}

/** Vrai si ce mois tombe dans cette période. */
export function contientLeMois(p: Periode, annee: number, mois: number): boolean {
  return annee === p.annee && mois >= premierMois(p) && mois <= dernierMois(p);
}

/**
 * Découpe une période en périodes d'un type plus fin.
 * Un semestre rendu en trimestres, une année rendue en mois. Nécessaire pour
 * la comparaison M1/M2/M3 attendue du rapport trimestriel.
 */
export function decouper(p: Periode, versType: TypePeriode): Periode[] {
  const finesse = MOIS_PAR_RANG[versType];
  if (finesse === undefined) throw new PeriodeInvalideError(`Type de période inconnu : ${versType}`);
  if (finesse > MOIS_PAR_RANG[p.type]) {
    throw new PeriodeInvalideError(
      `Une période ${p.type} ne peut pas être découpée en ${versType} : ce serait plus grand qu'elle.`
    );
  }
  const debut = premierMois(p);
  const nombre = MOIS_PAR_RANG[p.type] / finesse;
  return Array.from({ length: nombre }, (_, i) =>
    periodeContenant(versType, p.annee, debut + i * finesse)
  );
}

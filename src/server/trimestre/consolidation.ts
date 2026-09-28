/**
 * Les tableaux SAISIS du canevas, pour un SEMESTRE ou une ANNÉE : calculés à
 * partir des trimestres déjà saisis, sans ressaisie (décision du Délégué,
 * 28 septembre 2026).
 *
 * Le semestre et l'année suivent le même canevas que le trimestre ; seul le
 * nombre de mois change. Ce que le mensuel alimente se consolide déjà sur
 * n'importe quelle durée (agregation.ts). Restent les cases que les agents et
 * le chef BAC saisissent chaque trimestre : pour elles, une RÈGLE par tableau —
 * parfois par colonne — dit comment combiner les trimestres :
 *
 *   somme    un MOUVEMENT de la période : abattages, ventes, captures,
 *            recettes, vaccinations, mobilité du personnel… On additionne.
 *   dernier  une SITUATION à une date : personnel, infrastructures, cheptels,
 *            équipements… On reprend celle du dernier trimestre saisi.
 *   moyenne  un RAPPORT : prix moyen, rendement. On fait la moyenne des
 *            trimestres renseignés.
 *
 * Une règle absente n'est JAMAIS devinée : le tableau est alors repris du
 * dernier trimestre et signalé (`sansRegle`), pour qu'une somme fausse ne
 * sorte jamais en silence. Les textes (provenance, destination…) : les
 * valeurs distinctes pour une somme, la dernière pour une situation.
 *
 * Les cases « TOTAL T1 2026 » d'un trimestre deviennent « TOTAL S1 2026 » :
 * c'est ainsi que l'historique N-1 saisi à chaque trimestre nourrit la
 * comparaison du semestre.
 *
 * Enfin, ce qu'un agent a corrigé pour le semestre ou l'année elle-même
 * (saisie rattachée à cette période) l'emporte sur le calcul.
 */
import type { PrismaClient } from "@prisma/client";
import { type Periode, decouper, libelleCourt, memePeriodeAnneePrecedente } from "../periodes/calendrier";
import { saisiesVues, cleCellule, type ValeurCellule } from "./saisieCanevas";

/**
 * `fusion` : une LISTE d'événements numérotés (suspicions de maladies) — les
 * lignes remplies de chaque trimestre sont mises bout à bout et renumérotées.
 * Reprendre la seule liste du dernier trimestre ferait disparaître du semestre
 * la suspicion de rage de février (décision du Délégué, 28 septembre 2026).
 */
export type Regle = "somme" | "dernier" | "moyenne" | "fusion";

interface RegleTableau {
  regle: Regle;
  /** Exceptions par colonne (ou ligne) : motif sur son libellé → règle. */
  par?: [RegExp, Regle][];
  /** Pourquoi, en clair — c'est ce qui est montré au Délégué pour validation. */
  motif: string;
}

const PRIX_MOYEN: [RegExp, Regle] = [/prix moyen|poids moyen|rendement/i, "moyenne"];

/**
 * La règle de chaque tableau saisi. Classement relu sur les colonnes réelles
 * du canevas ; les cas douteux sont marqués « À CONFIRMER » dans le motif.
 */
export const REGLES: Record<number, RegleTableau> = {
  // Section I — structures, personnel, moyens : des situations.
  101: { regle: "dernier", motif: "Structures existantes : situation en fin de période." },
  1: { regle: "dernier", motif: "Besoins en structures : situation en fin de période." },
  2: { regle: "dernier", motif: "Postes à pourvoir : situation en fin de période." },
  3: { regle: "dernier", motif: "Effectifs du personnel : situation en fin de période." },
  4: { regle: "dernier", motif: "Besoins en personnel : situation en fin de période." },
  5: { regle: "somme", motif: "Mouvements du personnel (arrivées, départs, affectations) : additionnés." },
  6: { regle: "somme", motif: "Décisions disciplinaires de la période : additionnées." },
  7: { regle: "dernier", motif: "Infrastructures : situation en fin de période." },
  8: { regle: "dernier", motif: "Parc de véhicules : situation en fin de période." },
  9: { regle: "dernier", motif: "Besoins en véhicules : situation en fin de période." },
  10: { regle: "dernier", motif: "Équipements : situation en fin de période." },
  11: { regle: "dernier", motif: "Masse du budget de l'exercice : montant du dernier trimestre." },
  // Confirmé par le Délégué (28 septembre 2026) : les crédits se saisissent en cumul depuis janvier.
  12: { regle: "dernier", motif: "Crédits de fonctionnement, cumulés depuis janvier : dernier trimestre." },
  102: { regle: "dernier", motif: "Crédits d'investissement, cumulés depuis janvier : dernier trimestre." },
  13: { regle: "somme", motif: "Recettes : une ligne par mois, chaque mois vient de son trimestre." },
  103: { regle: "dernier", motif: "Contraintes et solutions : celles du dernier trimestre." },
  104: { regle: "dernier", motif: "Activités du programme 053 : niveau de réalisation du dernier trimestre." },
  105: { regle: "dernier", motif: "Activités du programme 055 : niveau de réalisation du dernier trimestre." },
  106: { regle: "dernier", motif: "Activités du programme 057 : niveau de réalisation du dernier trimestre." },
  107: { regle: "dernier", motif: "Activités du programme 059 : niveau de réalisation du dernier trimestre." },
  108: { regle: "dernier", motif: "Infrastructures du BIP : état d'exécution du dernier trimestre." },

  // Deuxième partie — cheptels (situations) et mouvements (sommes).
  14: { regle: "dernier", motif: "Cheptel bovin : effectifs en fin de période." },
  15: { regle: "dernier", motif: "Infrastructures d'exploitation : situation en fin de période." },
  16: { regle: "somme", motif: "Abattages contrôlés : additionnés." },
  17: { regle: "moyenne", motif: "Poids moyen et rendement : moyenne des trimestres." },
  19: { regle: "somme", motif: "Commercialisation : additionnée." },
  21: { regle: "somme", par: [PRIX_MOYEN], motif: "Cuirs : quantités et ressources additionnées, prix moyen en moyenne." },
  22: { regle: "somme", motif: "Transit et transhumance : additionnés." },
  23: { regle: "dernier", motif: "Cheptel ovin : effectifs en fin de période." },
  26: { regle: "somme", motif: "Commercialisation : additionnée." },
  27: { regle: "somme", motif: "Circulation des ovins : têtes additionnées, provenances et destinations réunies." },
  31: { regle: "somme", par: [PRIX_MOYEN], motif: "Ventes d'animaux : effectifs et ressources additionnés, prix moyen en moyenne." },
  32: { regle: "somme", motif: "Circulation : têtes additionnées, provenances et destinations réunies." },
  33: { regle: "dernier", motif: "Cheptels d'équidés : effectifs en fin de période." },
  34: { regle: "somme", motif: "Abattages d'équidés : additionnés." },
  35: { regle: "somme", motif: "Production de viande : additionnée." },
  37: { regle: "dernier", motif: "Cheptel porcin : effectifs en fin de période." },
  38: {
    regle: "dernier",
    par: [[/appuis/i, "somme"]],
    motif: "Organisations : nombre en fin de période ; appuis accordés additionnés.",
  },
  39: { regle: "somme", motif: "Abattages de porcins : additionnés." },
  41: { regle: "somme", motif: "Commercialisation : additionnée." },
  109: { regle: "somme", motif: "Circulation des porcins : têtes additionnées, provenances et destinations réunies." },
  // Confirmé par le Délégué (28 septembre 2026) : des effectifs présents.
  42: { regle: "dernier", motif: "Situation des bandes, effectifs présents : dernier trimestre." },
  43: { regle: "somme", motif: "Ventes d'oiseaux : additionnées." },
  44: { regle: "somme", motif: "Ventes d'oiseaux par catégorie : additionnées." },
  45: { regle: "somme", motif: "Abattages de volaille : additionnés." },
  47: { regle: "somme", motif: "Production d'œufs : additionnée." },
  48: { regle: "somme", motif: "Ventes d'œufs et de fientes : additionnées." },
  49: { regle: "somme", motif: "Consommation d'aliments : additionnée." },
  50: { regle: "somme", motif: "Circulation des bandes et produits : additionnée." },
  51: { regle: "dernier", motif: "Cheptels non conventionnels : effectifs en fin de période." },
  52: {
    regle: "dernier",
    par: [[/miel|cire|propolis|gel[ée]e/i, "somme"]],
    motif: "Apiculture : ruches, ruchers, apiculteurs en fin de période ; miel, cire, propolis, gelée additionnés.",
  },
  53: { regle: "somme", motif: "Ventes des produits de la ruche : additionnées." },
  54: { regle: "dernier", motif: "Animaux de compagnie : effectifs en fin de période." },

  // Chapitre III — pêche et aquaculture.
  55: { regle: "dernier", motif: "Pêcheurs : effectifs en fin de période." },
  56: { regle: "dernier", motif: "Équipements de pêche : situation en fin de période." },
  57: { regle: "dernier", motif: "Engins de pêche : situation en fin de période." },
  58: { regle: "dernier", motif: "Organisations de pêche : situation en fin de période." },
  59: { regle: "somme", motif: "Captures : additionnées." },
  60: { regle: "somme", motif: "Ressources des captures : additionnées." },
  110: { regle: "dernier", motif: "Organisations aquacoles : situation en fin de période." },
  61: { regle: "dernier", motif: "Aquaculture : pisciculteurs, étangs, bacs, stations en fin de période." },
  63: {
    regle: "dernier",
    par: [[/qt[ée] de poissons|ressources/i, "somme"], PRIX_MOYEN],
    motif: "Poissons de table : moyens de production en fin de période ; quantités et ressources additionnées ; prix moyen en moyenne.",
  },
  111: { regle: "dernier", motif: "Nouvelles structures et perspectives : situation du dernier trimestre." },

  // Chapitre IV — santé animale et inspection.
  64: { regle: "somme", motif: "Vaccinations : additionnées." },
  113: { regle: "dernier", motif: "Prélèvements (cumuls par année) : dernier trimestre." },
  114: { regle: "fusion", motif: "Bilan de surveillance : les suspicions de chaque trimestre, à la suite." },
  65: { regle: "somme", motif: "Consultations : additionnées." },
  66: { regle: "somme", motif: "Déparasitages : additionnés." },
  67: { regle: "somme", motif: "Castrations : additionnées." },
  69: { regle: "somme", motif: "Abattages contrôlés : additionnés." },
  70: { regle: "somme", motif: "Lésions décelées : additionnées." },
  71: { regle: "somme", motif: "Saisies après inspection : additionnées." },
  72: { regle: "somme", motif: "Produits inspectés : additionnés." },
  115: { regle: "dernier", motif: "Vétérinaires installés : liste en fin de période." },
};

/** La règle d'une case : celle de sa colonne ou de sa ligne si une exception la vise, sinon celle du tableau. */
export function regleDe(numero: number, ligne: string, colonne: string): Regle | null {
  const r = REGLES[numero];
  if (!r) return null;
  for (const [motif, regle] of r.par ?? []) if (motif.test(colonne) || motif.test(ligne)) return regle;
  return r.regle;
}

export interface SaisiesConsolidees {
  saisies: Map<string, ValeurCellule>;
  /** Les trimestres de la période sans aucune saisie : le calcul les ignore, le rapport doit le dire. */
  trimestresSansSaisie: string[];
  /** Tableaux saisis sans règle connue : repris du dernier trimestre. */
  sansRegle: number[];
}

/** « 13 | TOTAL T1 2026 | DSCHANG » → « 13 | TOTAL S1 2026 | DSCHANG ». */
function renommer(cle: string, remplacements: [string, string][]): string {
  const [numero, ligne, colonne] = cle.split(" | ");
  const r = (x: string) => remplacements.find(([de]) => de === x)?.[1] ?? x;
  return `${numero} | ${r(ligne)} | ${r(colonne)}`;
}

/**
 * Les cases saisies d'un semestre ou d'une année, calculées à partir de ses
 * trimestres (et corrigées par ce qui a été saisi pour la période elle-même).
 */
export async function saisiesConsolidees(
  db: PrismaClient,
  periode: Periode,
  arrondissementId: string | null | undefined,
  sansMaille: Set<number>
): Promise<SaisiesConsolidees> {
  const trimestres = decouper(periode, "TRIMESTRIEL");
  const cible = libelleCourt(periode);
  const cibleN1 = libelleCourt(memePeriodeAnneePrecedente(periode));

  // Chaque trimestre, dans l'ordre, avec ses libellés de total ramenés à la période.
  const parTrimestre: Map<string, ValeurCellule>[] = [];
  const trimestresSansSaisie: string[] = [];
  for (const t of trimestres) {
    const ligne = await db.periodeReporting.findFirst({
      where: { type: "TRIMESTRIEL", annee: t.annee, trimestre: t.rang },
      select: { id: true },
    });
    const brutes = ligne ? await saisiesVues(db, ligne.id, arrondissementId, sansMaille) : new Map<string, ValeurCellule>();
    if (brutes.size === 0) trimestresSansSaisie.push(libelleCourt(t));
    const remplacements: [string, string][] = [
      [`TOTAL ${libelleCourt(t)}`, `TOTAL ${cible}`],
      [`TOTAL ${libelleCourt(memePeriodeAnneePrecedente(t))}`, `TOTAL ${cibleN1}`],
    ];
    parTrimestre.push(new Map(Array.from(brutes, ([cle, v]) => [renommer(cle, remplacements), v] as const)));
  }

  const cles = new Set(parTrimestre.flatMap((m) => Array.from(m.keys())));
  const sortie = new Map<string, ValeurCellule>();
  const sansRegle = new Set<number>();
  const fusionnes = new Set(Object.entries(REGLES).filter(([, r]) => r.regle === "fusion").map(([n]) => Number(n)));

  // Les listes d'événements : les lignes remplies de chaque trimestre, à la
  // suite, renumérotées 1, 2, 3… dans l'ordre des trimestres puis des lignes.
  for (const numero of Array.from(fusionnes)) {
    let rang = 0;
    for (const m of parTrimestre) {
      const lignes = new Map<string, [string, ValeurCellule][]>();
      m.forEach((v, cle) => {
        const [n, ligne, colonne] = cle.split(" | ");
        if (Number(n) !== numero || (v.valeur == null && !v.texte?.trim())) return;
        lignes.set(ligne, [...(lignes.get(ligne) ?? []), [colonne, v]]);
      });
      const ordre = Array.from(lignes.keys()).sort((a, b) => Number(a) - Number(b) || a.localeCompare(b));
      for (const ligne of ordre) {
        rang++;
        for (const [colonne, v] of lignes.get(ligne)!) sortie.set(`${numero} | ${rang} | ${colonne}`, v);
      }
    }
  }

  for (const cle of Array.from(cles)) {
    const [numeroBrut, ligne, colonne] = cle.split(" | ");
    const numero = Number(numeroBrut);
    if (fusionnes.has(numero)) continue;
    const regle = regleDe(numero, ligne, colonne);
    if (!regle) sansRegle.add(numero);
    const valeurs = parTrimestre.map((m) => m.get(cle)).filter((v): v is ValeurCellule => v != null);
    const nombres = valeurs.map((v) => v.valeur).filter((n): n is number => n != null);
    const textes = valeurs.map((v) => v.texte?.trim()).filter((t): t is string => Boolean(t));

    let valeur: number | null = null;
    let texte: string | null = null;
    if (regle === "somme") {
      valeur = nombres.length ? Math.round(nombres.reduce((a, b) => a + b, 0) * 1e9) / 1e9 : null;
      texte = textes.length ? Array.from(new Set(textes)).join(" ; ") : null;
    } else if (regle === "moyenne") {
      valeur = nombres.length ? Math.round((nombres.reduce((a, b) => a + b, 0) / nombres.length) * 1e9) / 1e9 : null;
      texte = textes.at(-1) ?? null;
    } else {
      // « dernier », et à défaut de règle : la situation du dernier trimestre qui en a une.
      const derniere = [...valeurs].reverse().find((v) => v.valeur != null || v.texte?.trim());
      valeur = derniere?.valeur ?? null;
      texte = derniere?.texte ?? null;
    }
    if (valeur != null || texte) sortie.set(cle, { valeur, texte });
  }

  // Ce qui a été saisi pour la période elle-même l'emporte (correction d'un agent).
  const propre = await db.periodeReporting.findFirst({
    where: {
      type: periode.type,
      annee: periode.annee,
      ...(periode.type === "SEMESTRIEL" ? { semestre: periode.rang } : {}),
    },
    select: { id: true },
  });
  if (propre) {
    for (const [cle, v] of Array.from(await saisiesVues(db, propre.id, arrondissementId, sansMaille))) {
      if (v.valeur != null || v.texte?.trim()) sortie.set(cle, v);
    }
  }

  return { saisies: sortie, trimestresSansSaisie, sansRegle: Array.from(sansRegle).sort((a, b) => a - b) };
}

/**
 * Les trimestres d'un semestre ou d'une année dont AUCUN tableau n'a été
 * saisi — pour prévenir avant de produire, plutôt que de laisser croire qu'un
 * semestre calculé sur un seul trimestre est complet.
 */
export async function trimestresSansSaisie(db: PrismaClient, periode: Periode, arrondissementId?: string | null): Promise<string[]> {
  const manquants: string[] = [];
  for (const t of decouper(periode, "TRIMESTRIEL")) {
    const ligne = await db.periodeReporting.findFirst({
      where: { type: "TRIMESTRIEL", annee: t.annee, trimestre: t.rang },
      select: { id: true },
    });
    const n = ligne
      ? await db.saisieCanevas.count({
          where: { periodeId: ligne.id, ...(arrondissementId ? { portee: { in: ["", arrondissementId] } } : {}) },
        })
      : 0;
    if (n === 0) manquants.push(libelleCourt(t));
  }
  return manquants;
}

/** Utilitaire des tests : la clé d'une case. */
export { cleCellule };

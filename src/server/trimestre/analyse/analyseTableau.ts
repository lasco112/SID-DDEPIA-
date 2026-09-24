/**
 * L'analyse d'un tableau du rapport trimestriel : quelques phrases CALCULÉES.
 *
 * Décisions du Délégué (docs/ANALYSE_ET_VALIDATION.md, et 24 septembre 2026) :
 *   - le texte n'est pas rédigé, il est calculé à partir des cases du tableau
 *     tel qu'il est imprimé — aucun chiffre qui n'y figure pas ;
 *   - seuls les faits NOTABLES produisent une phrase ;
 *   - aucune cause n'est avancée : la cause, seul l'agent la connaît ;
 *   - chaque phrase garde son calcul, pour « Voir le calcul ».
 *
 * Aucun modèle de langage n'intervient ici.
 */
import type { Bloc, ContexteCanevas } from "../canevas/types";
import type { FournisseurValeur } from "../canevas/rendu";
import { colonnesDe, lignesDe } from "../canevas/rendu";
import { axeTerritorial, estEcart } from "../canevas/structure";
import { versNombre } from "../remplissage";

type BlocTableau = Extract<Bloc, { type: "tableau" }>;

export interface SeuilsAnalyse {
  /** En deçà (en %), l'évolution est de la stabilité. */
  stabilite: number;
  /** Au-delà (en %), la variation est une rupture. */
  rupture: number;
  /** Part du total (en %) au-delà de laquelle un arrondissement « concentre ». */
  concentration: number;
  /** Écart (en %) sous la moyenne des autres en deçà duquel un arrondissement décroche. */
  decrochage: number;
}

/** Valeurs arrêtées par le Délégué le 24 septembre 2026, modifiables par lui. */
export const SEUILS_DEFAUT: SeuilsAnalyse = { stabilite: 5, rupture: 50, concentration: 50, decrochage: 40 };

/** Comment nommer ce que compte le tableau. */
export interface SujetTableau {
  /** « Le cheptel bovin », « Les abattages contrôlés de bovins ». */
  sujet: string;
  pluriel: boolean;
  /** « têtes », « FCFA »… */
  unite: string;
}

export interface PhraseAnalyse {
  texte: string;
  /** Le calcul qui l'a produite, en clair. */
  calcul: string;
}

export interface AnalyseTableau {
  numero: number;
  phrases: PhraseAnalyse[];
  /** Vrai quand la comparaison à l'an passé manque faute de données N-1. */
  sansComparaison: boolean;
}

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const nb = (n: number) => nf.format(n).replace(/\u202f/g, " ");
const pct = (n: number) => `${nf.format(Math.round(Math.abs(n) * 10) / 10)} %`;
const variation = (a: number, b: number) => ((a - b) / b) * 100;

export function analyserTableau(
  bloc: BlocTableau,
  ctx: ContexteCanevas,
  valeur: FournisseurValeur,
  sujet: SujetTableau,
  seuils: SeuilsAnalyse = SEUILS_DEFAUT
): AnalyseTableau | null {
  const axe = axeTerritorial(bloc);
  if (!axe || bloc.numero == null) return null;
  const numero = bloc.numero;

  const lignes = lignesDe(bloc, ctx);
  const colonnes = colonnesDe(bloc, ctx).slice(1); // la première est l'en-tête des libellés
  const surAxe = axe === "lignes" ? lignes : colonnes;
  const autres = axe === "lignes" ? colonnes : lignes;

  const totalP = (l: string[]) =>
    l.find((x) => x === `TOTAL ${ctx.periodeCourt}`) ?? l.find((x) => /^\s*TOTAL\s*$/i.test(x)) ?? null;
  const totalN1 = (l: string[]) => l.find((x) => x === `TOTAL ${ctx.periodeCourtN1}`) ?? null;
  const estSomme = (x: string) => /^\s*(TOTAL|ÉCART)\b/i.test(x) || estEcart(x);

  const territoires = surAxe.filter((x) => !estSomme(x));
  const categories = autres.filter((x) => !estSomme(x));
  const [axeP, axeN1, autreP, autreN1] = [totalP(surAxe), totalN1(surAxe), totalP(autres), totalN1(autres)];

  const lire = (territoireOuTotal: string, autre: string): number | null => {
    const [ligne, colonne] = axe === "lignes" ? [territoireOuTotal, autre] : [autre, territoireOuTotal];
    return versNombre(
      valeur({ numeroTableau: numero, titreTableau: bloc.titre, bloc, ligne, colonne, indexColonne: colonnes.indexOf(colonne) + 1 })
    );
  };
  const somme = (xs: (number | null)[]) => (xs.some((x) => x != null) ? xs.reduce<number>((s, x) => s + (x ?? 0), 0) : null);

  // Valeur de chaque territoire, cette période et l'an passé.
  const courant = new Map<string, number | null>();
  const passe = new Map<string, number | null>();
  for (const t of territoires) {
    courant.set(t, autreP ? lire(t, autreP) : somme(categories.map((c) => lire(t, c))));
    passe.set(t, autreN1 ? lire(t, autreN1) : null);
  }
  const total =
    (axeP && autreP ? lire(axeP, autreP) : null) ?? somme(territoires.map((t) => courant.get(t) ?? null));
  const totalPasse =
    (axeP && autreN1 ? lire(axeP, autreN1) : null) ??
    (axeN1 && autreP ? lire(axeN1, autreP) : null) ??
    somme(territoires.map((t) => passe.get(t) ?? null));

  const phrases: PhraseAnalyse[] = [];
  const { sujet: s, pluriel, unite } = sujet;
  const verbe = pluriel ? "s’établissent" : "s’établit";
  const unArrondissement = territoires.length === 1;

  if (total == null) {
    return {
      numero,
      phrases: [{ texte: `Aucune donnée n’a été renseignée pour ce tableau au ${ctx.periodeCourt}.`, calcul: "Toutes les cases sont vides." }],
      sansComparaison: false,
    };
  }

  // 1. Le niveau, et l'évolution sur un an.
  let sansComparaison = false;
  if (totalPasse == null) {
    sansComparaison = true;
    phrases.push({
      texte:
        `${s} ${verbe} à ${nb(total)} ${unite} au ${ctx.periodeCourt}. ` +
        `La comparaison avec le ${ctx.periodeCourtN1} n’est pas possible : les données de cette période n’ont pas été renseignées.`,
      calcul: `Total ${ctx.periodeCourt} = ${nb(total)} ; total ${ctx.periodeCourtN1} non renseigné.`,
    });
  } else if (totalPasse === 0) {
    phrases.push({
      texte: `${s} ${verbe} à ${nb(total)} ${unite} au ${ctx.periodeCourt}, contre aucun au ${ctx.periodeCourtN1}.`,
      calcul: `${nb(total)} contre 0.`,
    });
  } else {
    const v = variation(total, totalPasse);
    const sens =
      Math.abs(v) < seuils.stabilite
        ? `stable par rapport au ${ctx.periodeCourtN1} (${nb(totalPasse)} ${unite})`
        : `${Math.abs(v) >= seuils.rupture ? "en forte " : "en "}${v > 0 ? "hausse" : "baisse"} de ${pct(v)} par rapport au ${ctx.periodeCourtN1} (${nb(totalPasse)} ${unite})`;
    phrases.push({
      texte: `${s} ${verbe} à ${nb(total)} ${unite} au ${ctx.periodeCourt}, ${sens}.`,
      calcul: `(${nb(total)} − ${nb(totalPasse)}) ÷ ${nb(totalPasse)} = ${v >= 0 ? "+" : "−"}${pct(v)}.`,
    });
  }

  // 2. Le poids des arrondissements (rapport départemental seulement).
  if (!unArrondissement && total > 0) {
    const classes = territoires
      .map((t) => [t, courant.get(t) ?? null] as const)
      .filter((e): e is readonly [string, number] => e[1] != null)
      .sort((a, b) => b[1] - a[1]);
    if (classes.length > 0) {
      const [premier, v] = classes[0];
      const part = (v / total) * 100;
      phrases.push({
        texte:
          part >= seuils.concentration
            ? `${nomTerritoire(premier)} en concentre à lui seul ${pct(part)}.`
            : `${nomTerritoire(premier)} arrive en tête avec ${pct(part)} du total.`,
        calcul: `${nb(v)} ÷ ${nb(total)} = ${pct(part)}.`,
      });
    }

    // Décrochage : nettement sous le niveau HABITUEL des autres — leur médiane,
    // et non leur moyenne : un seul arrondissement très fort (Dschang pour la
    // volaille) gonflerait la moyenne et ferait « décrocher » tous les autres.
    const decroches: string[] = [];
    const calculs: string[] = [];
    for (const [t, v] of classes) {
      const autresV = classes.filter(([u]) => u !== t).map(([, w]) => w);
      if (autresV.length === 0) continue;
      const reference = mediane(autresV);
      if (reference > 0 && v < reference * (1 - seuils.decrochage / 100)) {
        decroches.push(`${t} (${nb(v)})`);
        calculs.push(`${t} : ${nb(v)} contre ${nb(Math.round(reference))} (médiane des autres), soit ${pct(variation(v, reference))} de moins`);
      }
    }
    if (decroches.length > 0) {
      phrases.push({
        texte: `${decroches.length > 1 ? "Les arrondissements de " + liste(decroches) + " se situent" : "L’arrondissement de " + decroches[0] + " se situe"} nettement en dessous des autres.`,
        calcul: calculs.join(" ; ") + ".",
      });
    }

    // Arrondissements muets.
    const muets = territoires.filter((t) => courant.get(t) == null);
    if (muets.length > 0 && muets.length < territoires.length) {
      phrases.push({
        texte: `Aucune donnée n’a été renseignée pour ${muets.length > 1 ? "les arrondissements de " + liste(muets) : "l’arrondissement de " + muets[0]}.`,
        calcul: "Cases vides.",
      });
    }
  }

  // 3. Les ruptures d'un arrondissement sur un an.
  if (!unArrondissement) {
    const hausses: string[] = [];
    const baisses: string[] = [];
    const calculs: string[] = [];
    for (const t of territoires) {
      const [a, b] = [courant.get(t), passe.get(t)];
      if (a == null || b == null || b === 0) continue;
      const v = variation(a, b);
      if (Math.abs(v) >= seuils.rupture) {
        (v > 0 ? hausses : baisses).push(`${t} (${v > 0 ? "+" : "−"}${pct(v)})`);
        calculs.push(`${t} : ${nb(a)} contre ${nb(b)}`);
      }
    }
    if (hausses.length || baisses.length) {
      const morceaux = [
        hausses.length ? `forte progression à ${liste(hausses)}` : "",
        baisses.length ? `fort recul à ${liste(baisses)}` : "",
      ].filter(Boolean);
      phrases.push({ texte: `Sur un an : ${morceaux.join(" ; ")}.`, calcul: calculs.join(" ; ") + "." });
    }
  }

  // 4. La catégorie dominante (colonnes ou lignes de détail).
  if (categories.length > 1) {
    const parCategorie = categories
      .map((c) => [c, (axeP ? lire(axeP, c) : null) ?? somme(territoires.map((t) => lire(t, c)))] as const)
      .filter((e): e is readonly [string, number] => e[1] != null && e[1] > 0)
      .sort((a, b) => b[1] - a[1]);
    const totalCategories = parCategorie.reduce((a, [, v]) => a + v, 0);
    // Seulement si le détail est COMPLET : 52 génisses sur un cheptel de
    // 12 579 têtes ne disent rien de la composition du cheptel.
    if (parCategorie.length > 1 && totalCategories > 0 && totalCategories >= total * 0.95) {
      const [c, v] = parCategorie[0];
      const part = (v / totalCategories) * 100;
      if (part >= 30) {
        phrases.push({
          texte: `« ${c} » est la rubrique la plus importante, avec ${pct(part)} du total.`,
          calcul: `${nb(v)} ÷ ${nb(totalCategories)} = ${pct(part)}.`,
        });
      }
    }
  }

  return { numero, phrases, sansComparaison };
}

function mediane(xs: number[]): number {
  const t = [...xs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

/** Un territoire en tête de phrase : « L’arrondissement de Fokoué », « La DDEPIA ». */
function nomTerritoire(t: string): string {
  return /^D[AD]EPIA\b/.test(t) ? `La ${t}` : `L’arrondissement de ${t}`;
}

function liste(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`;
}

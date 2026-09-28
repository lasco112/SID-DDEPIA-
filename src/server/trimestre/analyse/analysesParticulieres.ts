/**
 * L'analyse des tableaux que le moteur général ne sait pas lire (décision du
 * Délégué, 28 septembre 2026 : « une analyse sous chaque tableau »).
 *
 * Le moteur général (analyseTableau.ts) résume un tableau par UN total. Ici,
 * trois tableaux ne se résument pas ainsi :
 *   - les UNITÉS MÊLÉES (têtes et tonnes, quantités et prix) : une phrase par
 *     indicateur, jamais additionnés entre eux ; un prix est moyenné ;
 *   - les SITUATIONS par rubrique (infrastructures, inspections) : les
 *     rubriques principales, chacune dans son unité ;
 *   - les LISTES (activités, suspicions, vétérinaires, BIP) : un décompte.
 *
 * Mêmes règles que partout : rien que ce que le tableau imprimé contient,
 * aucune cause avancée, et chaque phrase garde son calcul. Aucune unité n'est
 * inventée : sans unité dans le canevas, la phrase reprend le nom de la colonne.
 */
import type { Bloc, ContexteCanevas } from "../canevas/types";
import type { FournisseurValeur } from "../canevas/rendu";
import { colonnesDe } from "../canevas/rendu";
import { clesLignes, estEcart } from "../canevas/structure";
import { versNombre } from "../remplissage";
import type { AnalyseTableau, PhraseAnalyse } from "./analyseTableau";

type BlocTableau = Extract<Bloc, { type: "tableau" }>;

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const nb = (n: number) => nf.format(n).replace(/ /g, " ");
const pct = (n: number) => `${nf.format(Math.round(Math.abs(n) * 10) / 10)} %`;
const pluriel = (n: number, un: string, plusieurs: string) => (n > 1 ? plusieurs : un);

/** Ce qu'une analyse particulière lit du tableau. */
interface Lecture {
  ctx: ContexteCanevas;
  /** « le département », « l’arrondissement de Dschang ». */
  lieu: string;
  /** Les clés des lignes de détail (hors TOTAL et ÉCART). */
  lignes: string[];
  /** Les colonnes de détail (hors libellés, TOTAL et ÉCART). */
  colonnes: string[];
  /** Les territoires, quand ils sont en colonnes. */
  territoiresEnColonnes: string[];
  /** La ligne « TOTAL {P} » et « TOTAL {P-1} », si le tableau en a. */
  ligneTotal: string | null;
  ligneTotalN1: string | null;
  colonneTotal: string | null;
  n: (ligne: string, colonne: string) => number | null;
  t: (ligne: string, colonne: string) => string | null;
}

type Analyste = (l: Lecture) => PhraseAnalyse[] | null;

const estSomme = (x: string) => /^\s*(TOTAL|ÉCART)\b/i.test(x) || estEcart(x);
const debut = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * « Qté de poissons (en kg) » → { nom: « qté de poissons », unite: « kg » } :
 * l'unité que le canevas met entre parenthèses passe APRÈS le chiffre —
 * « 753 824 kg » et non « (kg) (753 824) ». Sans parenthèse, pas d'unité.
 */
function nomEtUnite(libelle: string): { nom: string; unite: string } {
  const propre = (u: string) => {
    const x = u.trim();
    if (/^unit[ée]s?$/i.test(x)) return "unités";
    if (/^t$/i.test(x)) return "tonnes";
    if (/^(kg|ha|l|m3|m2)$/i.test(x)) return x.toLowerCase();
    return x;
  };
  const m = libelle.match(/^(.*?)\s*\((?:en\s+)?([^)]+)\)\s*$/i);
  if (m) return { nom: debut(m[1].trim()), unite: propre(m[2]) };
  // « Superficie en Ha » : l'unité est écrite sans parenthèse.
  const e = libelle.match(/^(.*?)\s+en\s+(ha|kg|litres|tonnes|m3)\s*$/i);
  if (e) return { nom: debut(e[1].trim()), unite: propre(e[2]) };
  return { nom: debut(libelle.trim()), unite: "" };
}
const avecUnite = (n: number, unite: string) => `${nb(n)}${unite ? ` ${unite}` : ""}`;

// ---------------------------------------------------------------- unités mêlées

/**
 * Une phrase par indicateur (colonne) : le total de la période, et son
 * évolution sur un an quand le tableau la porte. Les prix sont moyennés, les
 * textes (destinations, activités) cités.
 */
const parIndicateur: Analyste = (l) => {
  const territoires = l.lignes;
  const morceaux: string[] = [];
  const calculs: string[] = [];
  for (const c of l.colonnes) {
    const prix = /prix|poids moyen|rendement/i.test(c);
    const valeurs = territoires.map((t) => l.n(t, c)).filter((v): v is number => v != null);
    const textes = territoires.map((t) => l.t(t, c)).filter((v): v is string => Boolean(v && versNombre(v) == null));
    if (textes.length) {
      morceaux.push(`${debut(c)} : ${Array.from(new Set(textes)).join(", ")}`);
      continue;
    }
    if (valeurs.length === 0) continue;
    const v = prix
      ? valeurs.reduce((a, b) => a + b, 0) / valeurs.length
      : (l.ligneTotal ? l.n(l.ligneTotal, c) : null) ?? valeurs.reduce((a, b) => a + b, 0);
    const avant = !prix && l.ligneTotalN1 ? l.n(l.ligneTotalN1, c) : null;
    let evolution = "";
    if (avant != null && avant > 0) {
      const e = ((v - avant) / avant) * 100;
      evolution = Math.abs(e) < 5 ? " (stable sur un an)" : ` (${e > 0 ? "+" : "−"}${pct(e)} sur un an)`;
      calculs.push(`${c} : (${nb(v)} − ${nb(avant)}) ÷ ${nb(avant)}`);
    } else {
      calculs.push(`${c} : ${prix ? `moyenne de ${valeurs.length} valeur(s)` : "total"} = ${nb(v)}`);
    }
    const { nom, unite } = nomEtUnite(c);
    morceaux.push(
      `${nom} : ${avecUnite(Math.round(v * 10) / 10, unite)}${prix && valeurs.length > 1 ? " (moyenne des arrondissements)" : ""}${evolution}`
    );
  }
  if (morceaux.length === 0) return null;
  return [{ texte: `Au ${l.ctx.periodeCourt}, pour ${l.lieu} : ${morceaux.join(" ; ")}.`, calcul: calculs.join(" ; ") + "." }];
};

// ---------------------------------------------------------- situations par rubrique

/**
 * Les rubriques principales d'un tableau dont les lignes sont des rubriques
 * de natures diverses (infrastructures, produits saisis) : les trois premières
 * par leur nombre, chacune avec son libellé — donc son unité quand il la porte.
 */
function rubriquesPrincipales(intro: string): Analyste {
  return (l) => {
    const valeurDe = (ligne: string) =>
      (l.colonneTotal ? l.n(ligne, l.colonneTotal) : null) ??
      (l.territoiresEnColonnes.length
        ? l.territoiresEnColonnes.map((t) => l.n(ligne, t)).reduce<number | null>((s, v) => (v == null ? s : (s ?? 0) + v), null)
        : null);
    const rubriques = l.lignes
      .map((r) => [r, valeurDe(r)] as const)
      .filter((e): e is readonly [string, number] => e[1] != null && e[1] > 0)
      .sort((a, b) => b[1] - a[1]);
    if (rubriques.length === 0) return null;
    const tete = rubriques.slice(0, 3).map(([r, v]) => {
      const { nom, unite } = nomEtUnite(r);
      return `${nom} : ${avecUnite(Math.round(v * 10) / 10, unite)}`;
    });
    const reste = rubriques.length - tete.length;
    return [
      {
        texte:
          `${intro} ${l.lieu} au ${l.ctx.periodeCourt} : ${tete.join(", ")}` +
          (reste > 0 ? ` ; le tableau en compte ${reste} autre${reste > 1 ? "s" : ""}.` : "."),
        calcul: rubriques.map(([r, v]) => `${r} = ${nb(v)}`).join(" ; ") + ".",
      },
    ];
  };
}

// ---------------------------------------------------------------------- listes

/** Les lignes d'une liste qui portent quelque chose dans ces colonnes. */
const remplies = (l: Lecture, colonnes: string[]) => l.lignes.filter((r) => colonnes.some((c) => l.t(r, c)));
const colonne = (l: Lecture, motif: RegExp) => l.colonnes.find((c) => motif.test(c)) ?? null;

const contraintes: Analyste = (l) => {
  const c = colonne(l, /contrainte/i);
  const s = colonne(l, /solution/i);
  if (!c) return null;
  const lignes = remplies(l, [c]);
  if (lignes.length === 0) return null;
  const avecSolution = s ? lignes.filter((r) => l.t(r, s)).length : 0;
  return [
    {
      texte:
        `${lignes.length} ${pluriel(lignes.length, "contrainte stratégique a été relevée", "contraintes stratégiques ont été relevées")}` +
        (s ? `, dont ${avecSolution} ${pluriel(avecSolution, "assortie", "assorties")} d’une solution proposée` : "") +
        ` : ${lignes.map((r) => l.t(r, c)).join(" ; ")}.`,
      calcul: `Lignes renseignées : ${lignes.length}.`,
    },
  ];
};

function activitesDuProgramme(code: string): Analyste {
  return (l) => {
    const realisation = colonne(l, /réalisation/i);
    if (!realisation) return null;
    const faites = remplies(l, [realisation]);
    if (faites.length === 0) return null;
    return [
      {
        texte: `Au titre du programme ${code}, ${faites.length} ${pluriel(faites.length, "activité a", "activités ont")} un niveau de réalisation renseigné pour le ${l.ctx.periodeCourt}.`,
        calcul: `Lignes dont la réalisation est décrite : ${faites.length} sur ${l.lignes.length}.`,
      },
    ];
  };
}

const infrastructuresBIP: Analyste = (l) => {
  const base = colonne(l, /infrastructure d’élevage de base|infrastructure d'élevage de base/i);
  const montant = colonne(l, /montant/i);
  const niveau = colonne(l, /niveau d’exécution|niveau d'exécution/i);
  const lignes = remplies(l, [base, montant, niveau].filter((x): x is string => Boolean(x)));
  if (lignes.length === 0) return null;
  const total = montant ? lignes.map((r) => l.n(r, montant)).reduce<number>((s, v) => s + (v ?? 0), 0) : 0;
  const niveaux = new Map<string, number>();
  if (niveau) for (const r of lignes) {
    const n = l.t(r, niveau)?.trim().toLowerCase();
    if (n) niveaux.set(n, (niveaux.get(n) ?? 0) + 1);
  }
  return [
    {
      texte:
        `${lignes.length} ${pluriel(lignes.length, "infrastructure d’élevage est financée", "infrastructures d’élevage sont financées")} sur le budget d’investissement public` +
        (total > 0 ? `, pour un montant de ${nb(total)} FCFA` : "") +
        (niveaux.size ? ` : ${Array.from(niveaux, ([n, k]) => `${k} « ${n} »`).join(", ")}` : "") +
        ".",
      calcul: `Lignes renseignées : ${lignes.length}${total > 0 ? ` ; somme des montants = ${nb(total)}` : ""}.`,
    },
  ];
};

const surveillance: Analyste = (l) => {
  const maladie = colonne(l, /maladie/i);
  const confirme = colonne(l, /confirm/i);
  const negatif = colonne(l, /négatif/i);
  if (!maladie) return null;
  const lignes = remplies(l, [maladie]);
  if (lignes.length === 0) return null;
  // Une case « Confirmé » ou « Négatif » : un nombre de cas, ou une simple marque.
  const compte = (c: string | null) =>
    c ? lignes.reduce((s, r) => s + (l.n(r, c) ?? (l.t(r, c) ? 1 : 0)), 0) : 0;
  const maladies = Array.from(new Set(lignes.map((r) => l.t(r, maladie)!.trim())));
  const [k, j] = [compte(confirme), compte(negatif)];
  return [
    {
      texte:
        `${lignes.length} ${pluriel(lignes.length, "suspicion de maladie a été signalée", "suspicions de maladies ont été signalées")} (${maladies.join(", ")})` +
        (confirme || negatif ? ` : ${k} ${pluriel(k, "confirmée", "confirmées")}, ${j} ${pluriel(j, "négative", "négatives")}` : "") +
        ".",
      calcul: `Suspicions : ${lignes.length} ; confirmé = ${k} ; négatif = ${j}.`,
    },
  ];
};

const veterinaires: Analyste = (l) => {
  const noms = colonne(l, /nom/i);
  const arr = colonne(l, /arrondissement/i);
  if (!noms) return null;
  const lignes = remplies(l, [noms]);
  if (lignes.length === 0) return null;
  const parArr = new Map<string, number>();
  if (arr && !l.ctx.arrondissement) for (const r of lignes) {
    const a = l.t(r, arr)?.trim();
    if (a) parArr.set(a, (parArr.get(a) ?? 0) + 1);
  }
  return [
    {
      texte:
        `${lignes.length} ${pluriel(lignes.length, "vétérinaire est installé", "vétérinaires sont installés")} en clientèle privée` +
        (parArr.size > 1 ? ` : ${Array.from(parArr, ([a, k]) => `${a} (${k})`).join(", ")}` : "") +
        ".",
      calcul: `Lignes renseignées : ${lignes.length}.`,
    },
  ];
};

// ---------------------------------------------------------------------- budget

const masseBudget: Analyste = (l) => {
  const montant = colonne(l, /montant/i);
  if (!montant) return null;
  const rubriques = l.lignes
    .map((r) => [r, l.n(r, montant)] as const)
    .filter((e): e is readonly [string, number] => e[1] != null && e[1] > 0)
    .sort((a, b) => b[1] - a[1]);
  if (rubriques.length === 0) return null;
  const total = (l.ligneTotal ? l.n(l.ligneTotal, montant) : null) ?? rubriques.reduce((s, [, v]) => s + v, 0);
  const [premiere, v] = rubriques[0];
  return [
    {
      texte: `Le budget s’élève à ${nb(total)} FCFA ; « ${premiere} » en représente ${pct((v / total) * 100)}.`,
      calcul: `${nb(v)} ÷ ${nb(total)}.`,
    },
  ];
};

/** Tableau 17 : poids moyen et rendement par catégorie — l'écart entre la plus faible et la plus forte. */
const rendements: Analyste = (l) => {
  const phrases: string[] = [];
  for (const c of l.colonnes) {
    const v = l.lignes
      .map((r) => [r, l.n(r, c)] as const)
      .filter((e): e is readonly [string, number] => e[1] != null && e[1] > 0)
      .sort((a, b) => a[1] - b[1]);
    if (v.length === 0) continue;
    const [bas, haut] = [v[0], v[v.length - 1]];
    phrases.push(
      v.length === 1
        ? `${debut(c)} : ${nb(bas[1])} (${debut(bas[0])})`
        : `${debut(c)} de ${nb(bas[1])} (${debut(bas[0])}) à ${nb(haut[1])} (${debut(haut[0])})`
    );
  }
  if (phrases.length === 0) return null;
  return [{ texte: `Au ${l.ctx.periodeCourt} : ${phrases.join(" ; ")}.`, calcul: "Plus faible et plus forte valeur de chaque colonne." }];
};

/** Les tableaux analysés ici, et comment. */
export const ANALYSES_PARTICULIERES: Record<number, Analyste> = {
  // Unités mêlées : une phrase par indicateur.
  19: parIndicateur, 20: parIndicateur, 21: parIndicateur, 26: parIndicateur, 31: parIndicateur,
  41: parIndicateur, 48: parIndicateur, 52: parIndicateur, 53: parIndicateur, 58: parIndicateur,
  61: parIndicateur, 63: parIndicateur, 110: parIndicateur,
  // Situations par rubrique.
  7: rubriquesPrincipales("Les infrastructures les plus nombreuses pour"),
  15: rubriquesPrincipales("Les principales infrastructures d’exploitation pour"),
  42: rubriquesPrincipales("Les bandes les plus importantes pour"),
  50: rubriquesPrincipales("Les principaux produits en circulation pour"),
  71: rubriquesPrincipales("Les saisies les plus importantes pour"),
  72: rubriquesPrincipales("Les produits les plus inspectés pour"),
  111: rubriquesPrincipales("Les nouvelles structures de production pour"),
  // Listes.
  103: contraintes,
  104: activitesDuProgramme("053"),
  105: activitesDuProgramme("055"),
  106: activitesDuProgramme("057"),
  107: activitesDuProgramme("059"),
  108: infrastructuresBIP,
  114: surveillance,
  115: veterinaires,
  // Budget et rendements.
  11: masseBudget,
  17: rendements,
};

/** L'analyse d'un tableau particulier ; « aucune donnée » s'il est vide, comme les autres. */
export function analyserParticulier(bloc: BlocTableau, ctx: ContexteCanevas, valeur: FournisseurValeur): AnalyseTableau | null {
  const numero = bloc.numero;
  if (numero == null) return null;
  const analyste = ANALYSES_PARTICULIERES[numero];
  if (!analyste) return null;

  const colonnes = colonnesDe(bloc, ctx);
  const cles = clesLignes(bloc, ctx);
  const brut = (ligne: string, col: string) =>
    valeur({ numeroTableau: numero, titreTableau: bloc.titre, bloc, ligne, colonne: col, indexColonne: colonnes.indexOf(col) });
  const territoiresEnColonnes = colonnes.filter((c) => ctx.arrondissements.includes(c));
  const lecture: Lecture = {
    ctx,
    lieu: ctx.arrondissement ? `l’arrondissement de ${ctx.arrondissement}` : "le département",
    lignes: cles.filter((c) => !estSomme(c)),
    colonnes: colonnes.slice(1).filter((c) => !estSomme(c) && !territoiresEnColonnes.includes(c) && !/^(N°|DEFICIT)$/i.test(c)),
    territoiresEnColonnes,
    ligneTotal: cles.find((c) => c === `TOTAL ${ctx.periodeCourt}`) ?? cles.find((c) => /^\s*TOTAL\s*$/i.test(c)) ?? null,
    ligneTotalN1: cles.find((c) => c === `TOTAL ${ctx.periodeCourtN1}`) ?? null,
    colonneTotal: colonnes.find((c) => c === `TOTAL ${ctx.periodeCourt}`) ?? null,
    n: (ligne, col) => versNombre(brut(ligne, col)),
    t: (ligne, col) => {
      const v = brut(ligne, col);
      return v && v.trim() && v.trim() !== "—" ? v.trim() : null;
    },
  };
  // Les tableaux aux territoires en colonnes se lisent par rubrique : les colonnes de détail sont les territoires.
  if (territoiresEnColonnes.length && lecture.colonnes.length === 0) lecture.colonnes = territoiresEnColonnes;

  const phrases = analyste(lecture);
  if (!phrases || phrases.length === 0) {
    return {
      numero,
      phrases: [{ texte: `Aucune donnée n’a été renseignée pour ce tableau au ${ctx.periodeCourt}.`, calcul: "Toutes les cases sont vides." }],
      sansComparaison: false,
      evolution: null,
      total: null,
    };
  }
  return { numero, phrases, sansComparaison: false, evolution: null, total: null };
}

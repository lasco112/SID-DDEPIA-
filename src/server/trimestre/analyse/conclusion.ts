/**
 * La conclusion RÉDIGÉE AUTOMATIQUEMENT (décision du Délégué, 24 septembre 2026).
 *
 * Toutes les données du rapport sont dans le SID : la conclusion s'en déduit,
 * et le relecteur — le chef PSA au département, l'agent de saisie dans un
 * arrondissement — la trouve prête. Il ne la modifie que s'il le juge utile ;
 * tant qu'il n'y touche pas, elle se met à jour toute seule avec les chiffres.
 *
 * Le plan est celui du canevas régional : une synthèse par domaine —
 * productions animales, santé animale et inspection, pêche et aquaculture,
 * ressources — puis les difficultés. Pour chaque domaine : ses chiffres clés
 * et leur évolution sur un an, puis les autres évolutions notables. S'y
 * ajoutent l'exécution du budget-programme et les difficultés, contraintes et
 * perspectives que les rédacteurs ont signalées ailleurs dans le rapport.
 *
 * Tout est tiré des mêmes calculs que les analyses des tableaux : aucun
 * chiffre n'y figure qui ne soit dans un tableau du rapport, aucune cause n'y
 * est avancée. Aucun modèle de langage n'intervient.
 */
import type { Bloc, ContexteCanevas } from "../canevas/types";
import type { FournisseurValeur } from "../canevas/rendu";
import { colonnesDe } from "../canevas/rendu";
import { clesLignes } from "../canevas/structure";
import { SECTIONS_CANEVAS } from "../canevas/sections";
import { propositions, type Proposition, type ChefDeSection } from "./analyses";
import { SEUILS_DEFAUT, uniteAccordee } from "./analyseTableau";
import { SUJETS } from "./sujets";

type BlocTableau = Extract<Bloc, { type: "tableau" }>;

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const nb = (n: number) => nf.format(n).replace(/\u202f/g, " ");
const signe = (v: number) => `${v > 0 ? "+" : "−"}${nf.format(Math.round(Math.abs(v) * 10) / 10)} %`;

/** « Le cheptel bovin » → « du cheptel bovin » ; « Les abattages » → « des abattages ». */
function complement(sujet: string): string {
  if (sujet.startsWith("Les ")) return `des ${sujet.slice(4)}`;
  if (sujet.startsWith("Le ")) return `du ${sujet.slice(3)}`;
  if (sujet.startsWith("La ")) return `de la ${sujet.slice(3)}`;
  return `de ${sujet.charAt(0).toLowerCase()}${sujet.slice(1)}`;
}

const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function liste(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`;
}

/** Les domaines, dans l'ordre du canevas régional, et leurs chiffres clés. */
const DOMAINES: { chef: ChefDeSection; ouverture: string; cles: number[] }[] = [
  // Cheptel bovin, abattages de bovins, abattages de volaille, cheptel porcin.
  { chef: "CHEF_PSA", ouverture: "Pour les productions animales", cles: [14, 16, 45, 37] },
  // Vaccinations, consultations, lésions décelées en inspection.
  { chef: "CHEF_SSV", ouverture: "En santé animale et en inspection sanitaire vétérinaire", cles: [64, 65, 70] },
  // Captures, alevins.
  { chef: "CHEF_SPAIH", ouverture: "Pour la pêche et l’aquaculture", cles: [59, 62] },
  // Recettes, personnel en poste.
  { chef: "CHEF_BAC", ouverture: "Pour les ressources", cles: [13, 3] },
];

/**
 * La production de viande se CALCULE à partir des abattages (poids de
 * carcasse) : elle évolue exactement comme eux. La citer redirait le même
 * pourcentage.
 */
const derive = (p: Proposition) => /^La production de viande/.test(SUJETS[p.numero]?.sujet ?? "");

/** « le cheptel bovin s’établit à 12 579 têtes (+22,2 % sur un an), les abattages … à 43 805 têtes (+29,7 %) ». */
function indicateurs(cles: Proposition[]): string {
  return cles
    .map((p, i) => {
      const { sujet, pluriel, unite } = SUJETS[p.numero];
      const niveau = `${nb(p.total!)}${unite ? ` ${uniteAccordee(p.total!, unite)}` : ""}`;
      const evolution = p.evolution == null ? "" : ` (${signe(p.evolution)}${i === 0 ? " sur un an" : ""})`;
      const verbe = i === 0 ? ` ${pluriel ? "s’établissent" : "s’établit"} à` : " à";
      return `${minuscule(sujet)}${verbe} ${niveau}${evolution}`;
    })
    .reduce((acc, m, i, t) => (i === 0 ? m : i === t.length - 1 ? `${acc} et ${m}` : `${acc}, ${m}`), "");
}

/** Le paragraphe d'un domaine, ou null s'il n'a aucune donnée pour la période. */
function paragrapheDomaine(tous: Proposition[], ouverture: string, clesDuDomaine: number[], ctx: ContexteCanevas): string | null {
  const props = tous.filter((p) => !derive(p) && !p.vide && p.total != null);
  if (props.length === 0) return null;

  // Les chiffres clés du domaine, choisis une fois pour toutes : pas de
  // tableau pris au hasard pour les remplacer.
  const cles = clesDuDomaine.map((n) => props.find((p) => p.numero === n)).filter((p): p is Proposition => p != null);
  const phrases = cles.length ? [`${ouverture}, ${indicateurs(cles)}.`] : [];

  // Les autres évolutions notables, les plus fortes d'abord.
  const autres = props
    .filter((p) => !cles.includes(p) && p.evolution != null && Math.abs(p.evolution) >= SEUILS_DEFAUT.stabilite)
    .sort((a, b) => Math.abs(b.evolution!) - Math.abs(a.evolution!))
    .slice(0, 3);
  const morceau = (p: Proposition) => `${complement(SUJETS[p.numero].sujet)} (${signe(p.evolution!)})`;
  const hausses = autres.filter((p) => p.evolution! > 0).map(morceau);
  const baisses = autres.filter((p) => p.evolution! < 0).map(morceau);
  const parties = [hausses.length ? `la hausse ${liste(hausses)}` : "", baisses.length ? `la baisse ${liste(baisses)}` : ""].filter(Boolean);
  if (parties.length) {
    phrases.push(
      cles.length
        ? `La période est également marquée par ${parties.join(", et par ")}.`
        : `${ouverture}, la période est marquée par ${parties.join(", et par ")}.`
    );
  }
  if (phrases.length === 0) return null;

  if (props.every((p) => p.evolution == null)) {
    phrases.push(`La comparaison avec le ${ctx.periodeCourtN1} n’est pas encore possible, faute des données de cette période.`);
  }
  return phrases.join(" ");
}

function blocDe(numero: number): BlocTableau | undefined {
  for (const s of SECTIONS_CANEVAS) {
    for (const b of s.blocs) if (b.type === "tableau" && b.numero === numero) return b;
  }
  return undefined;
}

/** Les cases renseignées d'une colonne d'un tableau, ligne par ligne. */
function colonneRenseignee(numero: number, colonne: string, ctx: ContexteCanevas, valeur: FournisseurValeur): { lignes: number; renseignees: number } {
  const bloc = blocDe(numero);
  if (!bloc) return { lignes: 0, renseignees: 0 };
  const indexColonne = colonnesDe(bloc, ctx).indexOf(colonne);
  const lignes = clesLignes(bloc, ctx);
  const renseignees = lignes.filter((ligne) =>
    Boolean(valeur({ numeroTableau: numero, titreTableau: bloc.titre, bloc, ligne, colonne, indexColonne })?.trim())
  ).length;
  return { lignes: lignes.length, renseignees };
}

/** L'exécution du budget-programme : combien d'activités ont leur réalisation décrite. */
function phraseBudgetProgramme(ctx: ContexteCanevas, valeur: FournisseurValeur): string | null {
  let activites = 0;
  let decrites = 0;
  for (const n of [104, 105, 106, 107]) {
    const c = colonneRenseignee(n, "Description du niveau de réalisation", ctx, valeur);
    activites += c.lignes;
    decrites += c.renseignees;
  }
  if (activites === 0) return null;
  if (decrites === 0) return null;
  return `Sur les ${activites} activités du budget-programme, ${decrites} ont fait l’objet d’un compte rendu de réalisation pour la période.`;
}

/** Les zones de difficultés du rapport, et comment les nommer dans la conclusion. */
const DIFFICULTES: [string, string][] = [
  ["I4.difficultes", "le recouvrement des recettes"],
  ["III1.difficultes", "la pêche"],
  ["III2.difficultes", "l’aquaculture"],
];

/** Difficultés, contraintes et perspectives que les rédacteurs ont signalées ailleurs dans le rapport. */
function phrasesDifficultes(ctx: ContexteCanevas, valeur: FournisseurValeur, ecrits: Map<string, string>): string[] {
  const phrases: string[] = [];
  const signalees = DIFFICULTES.filter(([cle]) => ecrits.get(cle)?.trim()).map(([, nom]) => nom);
  if (signalees.length) {
    phrases.push(`Des difficultés ont été signalées pour ${liste(signalees)} ; elles sont détaillées dans les parties correspondantes du présent rapport.`);
  }
  const contraintes = colonneRenseignee(103, "Contrainte stratégique", ctx, valeur).renseignees;
  if (contraintes > 0) {
    phrases.push(
      contraintes === 1
        ? "Une contrainte stratégique a été relevée, avec la solution proposée."
        : `${contraintes} contraintes stratégiques ont été relevées, avec les solutions proposées.`
    );
  }
  if (ecrits.get("I4.perspectives")?.trim()) {
    phrases.push("Des perspectives sont formulées pour l’amélioration du recouvrement des recettes.");
  }
  return phrases;
}

/**
 * Les textes rédigés automatiquement : la conclusion générale et la
 * conclusion du chapitre II. `ecrits` : ce que les rédacteurs ont écrit
 * ailleurs dans le rapport — difficultés, perspectives. Portent des jetons
 * ({STRUCTURE}, {CETTE_PERIODE}…), que le rendu résout.
 */
export function textesCalcules(
  ctx: ContexteCanevas,
  valeur: FournisseurValeur,
  ecrits: Map<string, string> = new Map()
): Map<string, string> {
  const props = propositions(ctx, valeur);
  const sortie = new Map<string, string>();

  const domaines = DOMAINES.map((d) => paragrapheDomaine(props.filter((p) => p.chef === d.chef), d.ouverture, d.cles, ctx)).filter(
    (p): p is string => p != null
  );
  const budget = phraseBudgetProgramme(ctx, valeur);
  const difficultes = phrasesDifficultes(ctx, valeur, ecrits);

  sortie.set(
    "conclusion",
    [
      "Au cours de {CETTE_PERIODE}, qui couvre la période de {MOIS_DEBUT} à {MOIS_FIN} {A}, la {STRUCTURE} a poursuivi la mise en œuvre des quatre programmes du budget-programme du MINEPIA." +
        (budget ? ` ${budget}` : ""),
      ...domaines,
      ...(difficultes.length ? [difficultes.join(" ")] : []),
      "Le détail de ces résultats figure dans les chapitres du présent rapport.",
    ].join("\n\n")
  );

  const psa = DOMAINES[0];
  const productions = paragrapheDomaine(props.filter((p) => p.chef === psa.chef), "Au cours de {CETTE_PERIODE}", psa.cles, ctx);
  if (productions) sortie.set("II.conclusion", productions);
  return sortie;
}

/** Les zones dont le texte est rédigé automatiquement. */
export const ZONES_AUTOMATIQUES = new Set(["conclusion", "II.conclusion"]);

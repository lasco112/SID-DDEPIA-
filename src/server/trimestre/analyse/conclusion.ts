/**
 * La conclusion PRÉ-RÉDIGÉE du rapport (demande du Délégué, 24 septembre 2026).
 *
 * Le canevas régional ne met aucun chiffre dans sa conclusion générale : c'est
 * une synthèse qualitative, domaine par domaine — productions animales, santé
 * animale et inspection, pêche et aquaculture, ressources. Le brouillon suit ce
 * plan ; pour chaque domaine, il dit dans quel sens les chiffres de la période
 * ont évolué sur un an — les évolutions notables seulement, tirées des mêmes
 * calculs que les analyses des tableaux, pourcentage entre parenthèses pour
 * qu'on puisse le vérifier.
 *
 * Ce n'est qu'un point de départ : le rédacteur le reprend, le complète —
 * difficultés, faits marquants, perspectives, que les chiffres ne disent pas —
 * et c'est son texte qui part au rapport. Tant qu'il n'a rien écrit, le
 * document porte ce brouillon.
 */
import type { ContexteCanevas } from "../canevas/types";
import type { FournisseurValeur } from "../canevas/rendu";
import { propositions, type Proposition, type ChefDeSection } from "./analyses";
import { SEUILS_DEFAUT } from "./analyseTableau";
import { SUJETS } from "./sujets";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const signe = (v: number) => `${v > 0 ? "+" : "−"}${nf.format(Math.round(Math.abs(v) * 10) / 10)} %`;

/** « Le cheptel bovin » → « du cheptel bovin » ; « Les abattages » → « des abattages ». */
function complement(sujet: string): string {
  if (sujet.startsWith("Les ")) return `des ${sujet.slice(4)}`;
  if (sujet.startsWith("Le ")) return `du ${sujet.slice(3)}`;
  if (sujet.startsWith("La ")) return `de la ${sujet.slice(3)}`;
  return `de ${sujet.charAt(0).toLowerCase()}${sujet.slice(1)}`;
}

function liste(xs: string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}`;
}

const DOMAINES: [ChefDeSection, string][] = [
  ["CHEF_PSA", "Pour les productions animales"],
  ["CHEF_SSV", "En santé animale et en inspection sanitaire vétérinaire"],
  ["CHEF_SPAIH", "Pour la pêche et l’aquaculture"],
  ["CHEF_BAC", "Pour les ressources et les recettes"],
];

/**
 * La production de viande se CALCULE à partir des abattages (poids de
 * carcasse) : elle évolue exactement comme eux. La citer redirait le même
 * pourcentage.
 */
const derive = (p: Proposition) => /^La production de viande/.test(SUJETS[p.numero]?.sujet ?? "");

/**
 * La phrase d'un domaine, ou null s'il n'a aucune donnée pour la période.
 * `ouverture` et `marque` : « Pour les productions animales » + « la période
 * est marquée », ou « Au cours de ce trimestre » + « les productions animales
 * sont marquées ».
 */
function phraseDomaine(
  tous: Proposition[],
  ouverture: string,
  ctx: ContexteCanevas,
  marque = "la période est marquée"
): string | null {
  const props = tous.filter((p) => !derive(p));
  const renseignes = props.filter((p) => !p.vide);
  if (renseignes.length === 0) return null;
  const compares = renseignes.filter((p) => p.evolution != null);
  if (compares.length === 0) {
    return `${ouverture}, les résultats de la période sont présentés dans les tableaux correspondants ; la comparaison avec le ${ctx.periodeCourtN1} n’est pas encore possible.`;
  }
  const notables = compares
    .filter((p) => Math.abs(p.evolution!) >= SEUILS_DEFAUT.stabilite)
    .sort((a, b) => Math.abs(b.evolution!) - Math.abs(a.evolution!))
    .slice(0, 4);
  if (notables.length === 0) {
    return `${ouverture}, les niveaux d’activité sont restés stables par rapport au ${ctx.periodeCourtN1}.`;
  }
  const morceau = (p: Proposition) => `${complement(SUJETS[p.numero].sujet)} (${signe(p.evolution!)})`;
  const hausses = notables.filter((p) => p.evolution! > 0).map(morceau);
  const baisses = notables.filter((p) => p.evolution! < 0).map(morceau);
  const parties = [
    hausses.length ? `la hausse ${liste(hausses)}` : "",
    baisses.length ? `la baisse ${liste(baisses)}` : "",
  ].filter(Boolean);
  return `${ouverture}, ${marque}, par rapport au ${ctx.periodeCourtN1}, par ${parties.join(", et par ")}.`;
}

/**
 * Les textes pré-rédigés à partir des chiffres : la conclusion générale et la
 * synthèse des productions animales. Portent des jetons ({STRUCTURE}…), que le
 * rendu résout.
 */
export function textesCalcules(ctx: ContexteCanevas, valeur: FournisseurValeur): Map<string, string> {
  const props = propositions(ctx, valeur);
  const sortie = new Map<string, string>();

  const domaines = DOMAINES.map(([chef, ouverture]) => phraseDomaine(props.filter((p) => p.chef === chef), ouverture, ctx)).filter(
    (p): p is string => p != null
  );
  sortie.set(
    "conclusion",
    [
      "Au cours de {CETTE_PERIODE}, qui couvre la période de {MOIS_DEBUT} à {MOIS_FIN} {A}, la {STRUCTURE} a poursuivi la mise en œuvre des quatre programmes du budget-programme du MINEPIA.",
      ...domaines,
      "Les difficultés rencontrées et les perspectives de chaque service sont exposées dans les chapitres correspondants.",
    ].join("\n\n")
  );

  const productions = phraseDomaine(
    props.filter((p) => p.chef === "CHEF_PSA"),
    "Au cours de {CETTE_PERIODE}",
    ctx,
    "les productions animales sont marquées"
  );
  if (productions) sortie.set("II.conclusion", productions);
  return sortie;
}

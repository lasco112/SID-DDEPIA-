/**
 * Base de faits et production du texte analytique — étapes E6 et E7.
 *
 * Le rapport mensuel du SID ne calcule aujourd'hui AUCUNE évolution : ses 473
 * cases de comparaison sont toutes vides. Ce module les remplit, et va plus
 * loin — il énonce ce que les chiffres disent.
 *
 * PRINCIPE : le texte n'est pas rédigé, il est CALCULÉ. Chaque phrase produite
 * conserve le calcul qui l'a engendrée, consultable par l'émetteur et par un
 * contrôleur. C'est la réponse à la défiance hiérarchique envers les textes
 * dont on ne peut retracer l'origine — voir docs/ANALYSE_ET_VALIDATION.md.
 *
 * Sept détecteurs, chacun cherchant une chose précise, et ne parlant que
 * lorsqu'il a trouvé quelque chose de notable : un rapport qui commenterait
 * chaque tableau se noierait sous les évidences.
 *
 * AUCUN MODÈLE DE LANGAGE N'INTERVIENT ICI. Ce fichier fonctionne hors ligne,
 * sans serveur, sans abonnement. Une couche de style pourra plus tard reformuler
 * ces phrases (§1.2 de la note de décision), mais jamais en toucher les chiffres.
 */
import type { ValeurAgregee } from "./agregation";
import { type Periode, libelleOfficiel } from "../periodes/calendrier";

export type TypeFait =
  | "EVOLUTION"
  | "TENDANCE"
  | "CONTRIBUTION"
  | "CONCENTRATION"
  | "DECROCHAGE"
  | "RUPTURE"
  | "COMPLETUDE";

export interface SeuilsAnalyse {
  /** En deçà de cette variation, on ne commente pas : c'est de la stabilité. */
  stabilite: number;
  /** Au-delà, la variation est signalée comme une rupture. */
  rupture: number;
  /** Part du total au-delà de laquelle un arrondissement est nommé. */
  concentration: number;
  /** Écart à la moyenne des autres en deçà duquel un arrondissement décroche. */
  decrochage: number;
}

/**
 * Valeurs de départ, à corriger après le premier trimestre réellement produit.
 * Elles sont destinées à être stockées en base et modifiables par le DD sans
 * intervention technique — un mauvais calibrage ne doit pas demander un
 * développeur.
 */
export const SEUILS_DEFAUT: SeuilsAnalyse = {
  stabilite: 0.05,
  rupture: 0.5,
  concentration: 0.5,
  decrochage: -0.4,
};

export interface Fait {
  fieldCode: string;
  libelle: string;
  type: TypeFait;
  /** 0 à 1. Sert à ne retenir que ce qui mérite d'être dit. */
  importance: number;
  /** La phrase, prête à figurer dans le rapport. */
  phrase: string;
  /** Le calcul qui la justifie — « voir le calcul ». */
  calcul: string;
}

// ---------------------------------------------------------------- mise en forme

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const nombre = (v: number) => nf.format(v);

/** Un pourcentage signé, à une décimale : « +12,0 % », « −22,4 % ». */
function pourcentage(v: number): string {
  const signe = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${signe}${nf.format(Math.round(Math.abs(v) * 1000) / 10)} %`;
}

const MOIS_COURT = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// ---------------------------------------------------------------- détecteurs

export interface ContexteFaits {
  periode: Periode;
  periodePrecedente: Periode;
  /** fieldCode → libellé lisible (FormField.libelle). */
  libelles: Map<string, string>;
  /** code arrondissement → nom. */
  arrondissements: Map<string, string>;
  seuils?: SeuilsAnalyse;
}

/**
 * Produit les faits d'un champ, à partir de sa consolidation courante, de celle
 * de la même période l'an passé, et du détail par arrondissement.
 */
export function faitsDunChamp(
  fieldCode: string,
  courantDept: ValeurAgregee,
  precedentDept: ValeurAgregee | undefined,
  courantParArr: ValeurAgregee[],
  ctx: ContexteFaits
): Fait[] {
  const seuils = ctx.seuils ?? SEUILS_DEFAUT;
  const libelle = ctx.libelles.get(fieldCode) ?? fieldCode;
  const faits: Fait[] = [];
  const valeur = courantDept.valeur;

  if (valeur == null) {
    faits.push({
      fieldCode, libelle, type: "COMPLETUDE", importance: 0.5,
      phrase: `${libelle} : aucune donnée renseignée pour ${libelleOfficiel(ctx.periode)}.`,
      calcul: `Aucun des six arrondissements n'a renseigné ce champ sur les mois de la période.`,
    });
    return faits;
  }

  // --- 1. EVOLUTION par rapport à la même période de l'année précédente -----
  const avant = precedentDept?.valeur ?? null;
  if (avant != null && avant !== 0) {
    const variation = (valeur - avant) / avant;
    const ecart = valeur - avant;
    const calcul =
      `${nombre(valeur)} contre ${nombre(avant)} au ${libelleOfficiel(ctx.periodePrecedente)}, ` +
      `soit ${ecart >= 0 ? "+" : "−"}${nombre(Math.abs(ecart))}, soit ${pourcentage(variation)}.`;

    if (Math.abs(variation) >= seuils.rupture) {
      faits.push({
        fieldCode, libelle, type: "RUPTURE", importance: Math.min(1, Math.abs(variation)),
        phrase: `${libelle} : ${nombre(valeur)}, ${variation > 0 ? "en très forte hausse" : "en très forte baisse"} sur un an (${pourcentage(variation)}). Cette variation mérite un examen.`,
        calcul,
      });
    } else if (Math.abs(variation) >= seuils.stabilite) {
      faits.push({
        fieldCode, libelle, type: "EVOLUTION", importance: Math.min(0.9, Math.abs(variation) * 2),
        phrase: `${libelle} : ${nombre(valeur)}, ${variation > 0 ? "en hausse" : "en recul"} de ${pourcentage(Math.abs(variation)).replace("+", "")} sur un an.`,
        calcul,
      });
    } else {
      faits.push({
        fieldCode, libelle, type: "EVOLUTION", importance: 0.15,
        phrase: `${libelle} : ${nombre(valeur)}, stable par rapport à ${libelleOfficiel(ctx.periodePrecedente)} (${pourcentage(variation)}).`,
        calcul,
      });
    }
  } else if (avant === 0 && valeur > 0) {
    faits.push({
      fieldCode, libelle, type: "RUPTURE", importance: 0.9,
      phrase: `${libelle} : ${nombre(valeur)}, alors que rien n'avait été enregistré au ${libelleOfficiel(ctx.periodePrecedente)}.`,
      calcul: `${nombre(valeur)} contre 0 — l'évolution en pourcentage n'a pas de sens à partir de zéro.`,
    });
  }

  // --- 2. TENDANCE à l'intérieur de la période (M1/M2/M3) -------------------
  const mensuels = courantDept.detail.filter((d) => d.valeur != null);
  if (mensuels.length === 3 && courantDept.regle === "SOMME") {
    const [a, b, c] = mensuels.map((d) => d.valeur!);
    const nomMois = mensuels.map((d) => MOIS_COURT[d.mois - 1]);
    const detailMois = mensuels.map((d, i) => `${nomMois[i]} ${nombre(d.valeur!)}`).join(", ");
    if (a < b && b < c) {
      faits.push({
        fieldCode, libelle, type: "TENDANCE", importance: 0.6,
        phrase: `${libelle} progresse d'un mois sur l'autre tout au long de la période.`,
        calcul: `${detailMois}.`,
      });
    } else if (a > b && b > c) {
      faits.push({
        fieldCode, libelle, type: "TENDANCE", importance: 0.7,
        phrase: `${libelle} recule d'un mois sur l'autre tout au long de la période.`,
        calcul: `${detailMois}.`,
      });
    } else {
      // Un mois qui pèse à lui seul plus de la moitié du trimestre explique
      // l'essentiel de la période : c'est ce que le DD veut savoir.
      const total = a + b + c;
      const max = Math.max(a, b, c);
      if (total > 0 && max / total > 0.5) {
        const i = [a, b, c].indexOf(max);
        faits.push({
          fieldCode, libelle, type: "TENDANCE", importance: 0.65,
          phrase: `${libelle} : le mois de ${nomMois[i]} représente à lui seul ${pourcentage(max / total).replace("+", "")} de la période.`,
          calcul: `${detailMois} — total ${nombre(total)}.`,
        });
      }
    }
  }

  // --- 3. CONCENTRATION et CONTRIBUTION par arrondissement ------------------
  const contributions = courantParArr
    .filter((v) => v.valeur != null && v.valeur > 0)
    .map((v) => ({ code: v.arrondissementCode!, nom: ctx.arrondissements.get(v.arrondissementCode!) ?? v.arrondissementCode!, valeur: v.valeur! }))
    .sort((x, y) => y.valeur - x.valeur);

  const totalArr = contributions.reduce((s, x) => s + x.valeur, 0);
  if (totalArr > 0 && contributions.length >= 2) {
    const premier = contributions[0];
    const part = premier.valeur / totalArr;
    if (part >= seuils.concentration) {
      faits.push({
        fieldCode, libelle, type: "CONCENTRATION", importance: Math.min(1, part),
        phrase: `${premier.nom} concentre à elle seule ${pourcentage(part).replace("+", "")} du total départemental de « ${libelle} ».`,
        calcul: `${nombre(premier.valeur)} sur ${nombre(totalArr)}, soit ${pourcentage(part).replace("+", "")}. Suivent ${contributions.slice(1, 3).map((c) => `${c.nom} ${nombre(c.valeur)}`).join(", ")}.`,
      });
    } else {
      faits.push({
        fieldCode, libelle, type: "CONTRIBUTION", importance: 0.25,
        phrase: `${libelle} : ${premier.nom} en tête avec ${pourcentage(part).replace("+", "")} du total.`,
        calcul: contributions.map((c) => `${c.nom} ${nombre(c.valeur)} (${pourcentage(c.valeur / totalArr).replace("+", "")})`).join(" · "),
      });
    }

    // --- 4. DECROCHAGE : un arrondissement nettement sous les autres --------
    const dernier = contributions[contributions.length - 1];
    const autres = contributions.slice(0, -1);
    const moyenneAutres = autres.reduce((s, x) => s + x.valeur, 0) / autres.length;
    if (moyenneAutres > 0) {
      const ecartRelatif = (dernier.valeur - moyenneAutres) / moyenneAutres;
      if (ecartRelatif <= seuils.decrochage) {
        faits.push({
          fieldCode, libelle, type: "DECROCHAGE", importance: Math.min(1, Math.abs(ecartRelatif)),
          phrase: `${dernier.nom} se situe nettement en dessous des autres arrondissements pour « ${libelle} » (${pourcentage(ecartRelatif)} par rapport à leur moyenne).`,
          calcul: `${nombre(dernier.valeur)} contre une moyenne de ${nombre(Math.round(moyenneAutres * 1000) / 1000)} pour les ${autres.length} autres.`,
        });
      }
    }
  }

  // --- 5. COMPLETUDE : arrondissements muets sur un champ renseigné ailleurs
  const muets = courantParArr.filter((v) => v.valeur == null);
  if (muets.length > 0 && contributions.length > 0) {
    const noms = muets.map((v) => ctx.arrondissements.get(v.arrondissementCode!) ?? v.arrondissementCode!);
    faits.push({
      fieldCode, libelle, type: "COMPLETUDE", importance: 0.4 + 0.1 * muets.length,
      phrase: `${libelle} : ${noms.length === 1 ? `${noms[0]} n'a rien renseigné` : `${noms.length} arrondissements n'ont rien renseigné`} (${noms.join(", ")}).`,
      calcul: `${contributions.length} arrondissement(s) sur ${courantParArr.length} ont renseigné ce champ.`,
    });
  }

  return faits;
}

/**
 * Produit les faits de toute une période, puis ne retient que les plus
 * notables. `parChamp` limite le bavardage : un tableau ne doit pas engendrer
 * huit phrases.
 */
export function produireFaits(
  courant: ValeurAgregee[],
  precedent: ValeurAgregee[],
  ctx: ContexteFaits,
  options: { importanceMinimale?: number; parChamp?: number } = {}
): Fait[] {
  const seuilImportance = options.importanceMinimale ?? 0.3;
  const maxParChamp = options.parChamp ?? 3;

  const deptPrecedent = new Map(precedent.filter((v) => v.arrondissementCode === null).map((v) => [v.fieldCode, v]));
  const parArr = new Map<string, ValeurAgregee[]>();
  for (const v of courant) {
    if (v.arrondissementCode === null) continue;
    const l = parArr.get(v.fieldCode) ?? [];
    l.push(v);
    parArr.set(v.fieldCode, l);
  }

  const tous: Fait[] = [];
  for (const dept of courant.filter((v) => v.arrondissementCode === null)) {
    const faits = faitsDunChamp(dept.fieldCode, dept, deptPrecedent.get(dept.fieldCode), parArr.get(dept.fieldCode) ?? [], ctx)
      .filter((f) => f.importance >= seuilImportance)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, maxParChamp);
    tous.push(...faits);
  }
  return tous.sort((a, b) => b.importance - a.importance);
}

/**
 * Ordre de LECTURE d'un paragraphe, qui n'est pas l'ordre d'importance.
 *
 * Un rédacteur administratif annonce d'abord le chiffre et son évolution, puis
 * la structure (qui pèse, qui décroche), et termine par les réserves. Trier par
 * importance mettrait « Fongo-Tongo décroche de 72 % » avant d'avoir dit de
 * quoi on parle et combien.
 */
const ORDRE_NARRATIF: TypeFait[] = [
  "EVOLUTION",      // le chiffre et son mouvement — la phrase d'ouverture
  "TENDANCE",       // ce que disent les trois mois entre eux
  "RUPTURE",        // l'anomalie franche, si elle existe
  "CONCENTRATION",  // qui pèse dans le total
  "CONTRIBUTION",
  "DECROCHAGE",     // qui reste en arrière
  // Le détecteur COHERENCE (contrôles croisés du canevas, tableau 69 = 16+24+
  // 29+39+45) n'est pas encore écrit ; sa place dans le récit est ici, juste
  // avant les réserves.
  "COMPLETUDE",     // les réserves, toujours en dernier
];

/**
 * Rédige le paragraphe d'un champ à partir de ses faits.
 * Les faits gardent leur ordre d'importance à l'intérieur d'un même type.
 */
export function rediger(faits: Fait[]): string {
  const rang = (t: TypeFait) => {
    const i = ORDRE_NARRATIF.indexOf(t);
    return i === -1 ? ORDRE_NARRATIF.length : i;
  };
  return [...faits]
    .sort((a, b) => rang(a.type) - rang(b.type) || b.importance - a.importance)
    .map((f) => f.phrase)
    .join(" ");
}

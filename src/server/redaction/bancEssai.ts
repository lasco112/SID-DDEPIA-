/**
 * Le banc d'essai : choisir un modèle à l'aveugle.
 *
 * Pourquoi à l'aveugle
 * --------------------
 * Si le Délégué sait que le texte A vient du modèle le plus réputé, ou que le C
 * est le moins cher, son jugement s'en trouve orienté sans qu'il le veuille. Le
 * biais ne se combat pas par la volonté : il se combat en cachant l'étiquette.
 *
 * L'enjeu le justifie — le modèle retenu écrira dans un document transmis au
 * MINEPIA. Le choix doit se faire sur le français produit, sur de vraies
 * données du département, et non sur une réputation, un prix ou une marque.
 *
 * Ce que ce module garantit
 * -------------------------
 * L'anonymat est une propriété du CODE, pas une consigne : la correspondance
 * lettre → modèle n'est jamais renvoyée avec les textes. Elle reste au serveur
 * jusqu'au dépouillement. Un écran ne peut donc pas la divulguer par accident,
 * même en la cherchant.
 *
 * Le tirage est refait à CHAQUE cas : sans cela, le même modèle serait toujours
 * « A », et l'ordre finirait par se deviner.
 */
import { randomInt } from "node:crypto";
import type { PropositionModele } from "./passerelle";

export const LETTRES = ["A", "B", "C", "D", "E"] as const;
export type Lettre = (typeof LETTRES)[number];

/** Ce que le Délégué voit : une lettre et un texte. Rien d'autre. */
export interface CandidatAnonyme {
  lettre: Lettre;
  texte: string;
}

/** Ce que le serveur garde par-devers lui. */
export interface CasAnonymise {
  candidats: CandidatAnonyme[];
  /** lettre → modèle. NE JAMAIS transmettre au client avant le dépouillement. */
  correspondance: Map<Lettre, string>;
}

/**
 * Mélange une liste, sans biais.
 *
 * Un `sort(() => Math.random() - 0.5)` paraît équivalent et ne l'est pas : il
 * produit des permutations inégalement probables. Ici, le mélange de
 * Fisher-Yates, avec le générateur cryptographique — le tirage ne doit pas être
 * prévisible.
 */
function melanger<T>(liste: T[]): T[] {
  const t = [...liste];
  for (let i = t.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

/**
 * Présente les propositions sous des lettres, dans un ordre tiré au sort.
 *
 * Deux modèles qui rendent le MÊME texte sont conservés tous les deux : c'est
 * une information — ils se valent sur ce cas — et la masquer fausserait le
 * décompte.
 */
export function anonymiser(propositions: PropositionModele[]): CasAnonymise {
  if (propositions.length < 2) {
    throw new Error("Un banc d'essai compare au moins deux propositions.");
  }
  if (propositions.length > LETTRES.length) {
    throw new Error(`Le banc d'essai ne compare pas plus de ${LETTRES.length} modèles à la fois.`);
  }

  const melangees = melanger(propositions);
  const candidats: CandidatAnonyme[] = [];
  const correspondance = new Map<Lettre, string>();

  melangees.forEach((p, i) => {
    const lettre = LETTRES[i];
    candidats.push({ lettre, texte: p.texte });
    correspondance.set(lettre, p.modele);
  });

  return { candidats, correspondance };
}

/** Un choix du Délégué sur un cas : la lettre retenue, et ce qu'elle cachait. */
export interface ChoixDepouille {
  modeleRetenu: string;
  modelesEcartes: string[];
}

/**
 * Traduit un choix en modèle. Le dépouillement n'a lieu qu'ici, jamais avant.
 */
export function depouiller(cas: CasAnonymise, lettreChoisie: Lettre): ChoixDepouille {
  const modeleRetenu = cas.correspondance.get(lettreChoisie);
  if (!modeleRetenu) {
    throw new Error(`La lettre « ${lettreChoisie} » ne figure pas dans ce cas.`);
  }
  const modelesEcartes = Array.from(cas.correspondance.entries())
    .filter(([l]) => l !== lettreChoisie)
    .map(([, m]) => m);

  return { modeleRetenu, modelesEcartes };
}

export interface Classement {
  /** Modèle → nombre de fois qu'il a été préféré. */
  preferences: { modele: string; retenu: number; presente: number; taux: number }[];
  cas: number;
  /** Le vainqueur, ou null si l'échantillon ne permet pas de trancher. */
  vainqueur: string | null;
  /** Ce qu'il faut dire au Délégué quand on ne tranche pas. */
  reserve?: string;
}

/**
 * Le nombre de cas en dessous duquel on refuse de désigner un vainqueur.
 *
 * Choisir un modèle sur trois ou quatre rubriques, c'est choisir sur le hasard.
 * Quinze cas restent modestes, mais ils suffisent à écarter un modèle
 * franchement moins bon — et c'est le but réel de l'exercice.
 */
export const CAS_MINIMUM = 15;

/**
 * Dépouille l'ensemble des choix.
 *
 * Refuse de désigner un vainqueur quand l'échantillon est trop petit, ou quand
 * deux modèles sont trop proches : un banc d'essai qui tranche toujours, même
 * sans matière, ne sert qu'à habiller une décision déjà prise.
 */
export function classer(choix: ChoixDepouille[], casMinimum = CAS_MINIMUM): Classement {
  const retenus = new Map<string, number>();
  const presentes = new Map<string, number>();

  for (const c of choix) {
    retenus.set(c.modeleRetenu, (retenus.get(c.modeleRetenu) ?? 0) + 1);
    for (const m of [c.modeleRetenu, ...c.modelesEcartes]) {
      presentes.set(m, (presentes.get(m) ?? 0) + 1);
    }
  }

  const preferences = Array.from(presentes.keys())
    .map((modele) => {
      const retenu = retenus.get(modele) ?? 0;
      const presente = presentes.get(modele) ?? 0;
      return { modele, retenu, presente, taux: presente > 0 ? retenu / presente : 0 };
    })
    .sort((a, b) => b.taux - a.taux || b.retenu - a.retenu);

  if (choix.length < casMinimum) {
    return {
      preferences,
      cas: choix.length,
      vainqueur: null,
      reserve: `${choix.length} cas jugés sur ${casMinimum} : trop peu pour trancher. Choisir maintenant reviendrait à choisir au hasard.`,
    };
  }

  const [premier, second] = preferences;
  if (second && premier.taux - second.taux < 0.1) {
    return {
      preferences,
      cas: choix.length,
      vainqueur: null,
      reserve:
        `« ${premier.modele} » et « ${second.modele} » sont trop proches ` +
        `(${Math.round(premier.taux * 100)} % contre ${Math.round(second.taux * 100)} %) : ` +
        "l'écart ne dit rien. Départager sur un autre critère — coût, souveraineté, latence.",
    };
  }

  return { preferences, cas: choix.length, vainqueur: premier.modele };
}

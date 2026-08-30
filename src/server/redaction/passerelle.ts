/**
 * La passerelle vers un modèle de langage — et l'interrupteur qui l'éteint.
 *
 * Les trois exigences non négociables de l'étude (§ 4)
 * ---------------------------------------------------
 * 1. **Derrière une seule porte.** Une unique interface dans tout le code, une
 *    seule implémentation à la fois. Changer de fournisseur, ou passer à
 *    l'auto-hébergement d'un modèle ouvert, c'est remplacer UN fichier — pas
 *    parcourir l'application. C'est ce qui rend le choix réversible, et donc
 *    peu risqué à prendre.
 *
 * 2. **Toujours dégradable.** Chaque fonction qui s'appuie sur le modèle doit
 *    produire un résultat utile SANS lui. Modèle absent, lent ou en panne : le
 *    texte du moteur de règles s'affiche et personne n'est bloqué. Le SID sait
 *    déjà faire cela pour les notifications système (`push.ts`) — même patron.
 *
 * 3. **Interrupteur global.** Une clé en base, sur le modèle éprouvé du mode
 *    démonstration. Le Délégué coupe l'assistance en une seconde, sans
 *    redéploiement, si la hiérarchie l'exige.
 *
 * Aucune implémentation réelle n'est fournie ici, et c'est volontaire : le
 * modèle n'est pas choisi. Le banc d'essai (`bancEssai.ts`) sert précisément à
 * le choisir, et il fonctionne avec n'importe quelle passerelle.
 */
import type { PrismaClient } from "@prisma/client";

/** Ce qu'un modèle rend, quel qu'il soit. */
export interface PropositionModele {
  /** Le texte proposé, AVANT tout contrôle — il passera par les garde-fous. */
  texte: string;
  /** Le modèle qui l'a produit : « mistral-small », « llama-3.1-8b »… */
  modele: string;
  versionModele?: string;
  /** Durée de l'appel, en millisecondes. Sert à écarter un modèle trop lent. */
  latenceMs: number;
}

export interface DemandeRedaction {
  /** L'invite, déjà jetonnée : elle ne contient aucun chiffre. */
  invite: string;
  /** Au-delà, on abandonne et on se rabat sur le moteur de règles. */
  delaiMs?: number;
}

/**
 * LA porte. Une seule implémentation active à la fois.
 *
 * Une passerelle ne doit jamais lever : elle rend `null` quand elle ne peut pas
 * répondre. L'appelant se rabat alors sur le texte des règles — la dégradation
 * est le comportement normal, pas une exception.
 */
export interface PasserelleIA {
  /** Nom lisible, pour le journal et l'écran d'administration. */
  readonly nom: string;
  /** Faux si le modèle n'est pas joignable : on ne tente même pas l'appel. */
  disponible(): Promise<boolean>;
  proposer(demande: DemandeRedaction): Promise<PropositionModele | null>;
}

/**
 * La passerelle par défaut : aucune.
 *
 * Tant qu'aucun modèle n'est choisi, c'est elle qui est en place. Le SID
 * fonctionne exactement comme aujourd'hui — le moteur de règles rédige — et
 * rien dans le code appelant n'a besoin de le savoir.
 */
export const AUCUNE_PASSERELLE: PasserelleIA = {
  nom: "aucune",
  async disponible() {
    return false;
  },
  async proposer() {
    return null;
  },
};

// ---------------------------------------------------------------------------
// L'interrupteur global
// ---------------------------------------------------------------------------

/** Clé de `ConfigSysteme`, sur le modèle éprouvé de MODE_DEMO_GLOBAL. */
export const CLE_ASSISTANCE_IA = "ASSISTANCE_IA_ACTIVE";

/*
 * L'état est lu très souvent : on évite une requête à chaque appel avec un
 * cache court. Dix secondes suffisent — couper l'assistance doit prendre effet
 * tout de suite pour celui qui l'actionne, et en quelques secondes pour les
 * autres.
 */
let cache: { actif: boolean; expire: number } | null = null;

export function invaliderCacheAssistance(): void {
  cache = null;
}

/**
 * L'assistance rédactionnelle est-elle activée ?
 *
 * **Éteinte par défaut.** Une fonction qui écrit dans un document officiel ne
 * s'allume pas parce qu'on a déployé du code : elle s'allume parce que le
 * Délégué l'a décidé. En cas de doute — table absente, base indisponible — on
 * répond non : l'assistance manquante est un désagrément, l'assistance
 * inattendue est un incident.
 */
export async function assistanceActive(db: PrismaClient): Promise<boolean> {
  if (cache && cache.expire > Date.now()) return cache.actif;
  let actif = false;
  try {
    const config = await db.configSysteme.findUnique({ where: { cle: CLE_ASSISTANCE_IA } });
    actif = config?.valeur === "actif";
  } catch {
    actif = false;
  }
  cache = { actif, expire: Date.now() + 10_000 };
  return actif;
}

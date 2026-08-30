/**
 * Les garde-fous de l'assistance rédactionnelle.
 *
 * Ce module s'écrit AVANT qu'un modèle soit branché, et c'est délibéré : les
 * barrières se posent avant la machine, jamais après. Il ne dépend d'aucun
 * fournisseur, d'aucune clé, d'aucun réseau — il se teste entièrement avec des
 * réponses simulées, y compris malveillantes.
 *
 * Le principe, posé par le Délégué et durci par l'étude (§ 6.3)
 * ------------------------------------------------------------
 * « Le LLM ne doit pas devenir la calculatrice officielle » est nécessaire mais
 * insuffisant : c'est une consigne, et une consigne se contourne par accident.
 * On le rend STRUCTUREMENT impossible :
 *
 *   1. le modèle reçoit les faits avec des JETONS à la place des nombres ;
 *   2. il renvoie du texte contenant ces jetons ;
 *   3. le SID substitue les valeurs depuis la base de faits ;
 *   4. si la réponse contient un chiffre qui ne vient pas d'une substitution,
 *      elle est REJETÉE et le texte du moteur de règles est utilisé.
 *
 * Conséquence : il devient mécaniquement impossible qu'un faux chiffre entre
 * dans un rapport officiel. Ce n'est plus une promesse, c'est une propriété —
 * et elle se démontre sans demander de faire confiance à quoi que ce soit.
 *
 * Ce que le principe seul laisserait passer (§ 6.4)
 * ------------------------------------------------
 * Le faux QUALITATIF sans chiffre (« la situation sanitaire s'est dégradée »),
 * et surtout l'OMISSION — un texte sans erreur qui tait le seul tableau
 * alarmant. L'omission est le risque le plus sous-estimé : elle est
 * indétectable à la lecture. D'où le contrôle de couverture.
 */
import type { Fait } from "../trimestre/faits";

/** Un jeton : `{{F3.valeur}}`. Le point sépare le fait de sa propriété. */
const JETON = /\{\{([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\}\}/g;

/**
 * Tout groupe de chiffres, y compris collé à un signe ou une unité.
 * Les nombres écrits en toutes lettres ne sont pas visés : ils ne peuvent pas
 * porter une valeur statistique crédible (« deux mille trois cent quarante et
 * un » ne s'écrit pas dans un rapport de ce genre).
 */
const CHIFFRE = /\d/;

export interface FaitJetonne {
  /** Identifiant court du fait dans l'invite : « F1 », « F2 »… */
  id: string;
  fait: Fait;
}

export interface Preparation {
  /** Les faits, jetonnés, tels que le modèle les recevra. */
  faits: FaitJetonne[];
  /** Jeton complet → valeur réelle. C'est la SEULE source de chiffres. */
  substitutions: Map<string, string>;
  /**
   * Les faits que le texte DOIT mentionner. L'omission d'un fait important est
   * un défaut administratif : elle ne se voit pas à la lecture.
   */
  obligatoires: string[];
}

/**
 * Prépare les faits pour le modèle : chaque valeur devient un jeton.
 *
 * `seuilCouverture` : au-dessus de cette importance, le fait devient
 * obligatoire dans le texte rendu.
 */
export function preparerFaits(faits: Fait[], seuilCouverture = 0.6): Preparation {
  const substitutions = new Map<string, string>();
  const jetonnes: FaitJetonne[] = [];
  const obligatoires: string[] = [];

  faits.forEach((fait, i) => {
    const id = `F${i + 1}`;
    jetonnes.push({ id, fait });

    // La PHRASE du moteur de règles porte déjà les chiffres correctement
    // placés : elle est la valeur du jeton, et le repli en cas de rejet.
    substitutions.set(`{{${id}.phrase}}`, fait.phrase);
    substitutions.set(`{{${id}.libelle}}`, fait.libelle);

    if (fait.importance >= seuilCouverture) obligatoires.push(id);
  });

  return { faits: jetonnes, substitutions, obligatoires };
}

export type MotifRejet =
  | "CHIFFRE_NON_SUBSTITUE"
  | "JETON_INCONNU"
  | "COUVERTURE_INSUFFISANTE"
  | "LEXIQUE_NON_AUTORISE"
  | "TEXTE_VIDE";

export interface ResultatRedaction {
  /** Le texte à utiliser : celui du modèle s'il passe, sinon le repli. */
  texte: string;
  /** Vrai si la proposition du modèle a été retenue. */
  retenu: boolean;
  motif?: MotifRejet;
  /** Ce qu'il faut pouvoir montrer au Délégué, et écrire au journal. */
  explication?: string;
}

/**
 * Le lexique d'appréciation autorisé, en phase 1.
 *
 * Un modèle qui écrit « la situation sanitaire s'est dégradée » produit une
 * affirmation officielle sans aucun chiffre — donc invisible au contrôle des
 * nombres. En phase 1, il ne dispose que de ce vocabulaire, et tout autre terme
 * d'appréciation fait rejeter la proposition.
 */
export const LEXIQUE_AUTORISE = [
  "progression", "progresse", "hausse", "augmentation", "augmente",
  "recul", "recule", "baisse", "diminution", "diminue",
  "stabilité", "stable", "inchangé", "inchangée",
  "supérieur", "supérieure", "inférieur", "inférieure",
] as const;

/**
 * Les termes d'appréciation qu'un modèle emploie spontanément et que le SID
 * n'autorise pas : ils portent un jugement que personne n'a validé.
 */
const LEXIQUE_INTERDIT = [
  "dégradation", "dégradé", "dégradée", "détérioration", "détérioré",
  "alarmant", "alarmante", "préoccupant", "préoccupante", "inquiétant", "inquiétante",
  "catastrophique", "excellent", "excellente", "satisfaisant", "satisfaisante",
  "insuffisant", "insuffisante", "bon", "mauvais", "mauvaise",
  "grave", "critique", "encourageant", "encourageante",
];

/** Le texte de repli : celui du moteur de règles, qui porte son calcul. */
export function texteDeRepli(faits: Fait[]): string {
  return faits.map((f) => f.phrase).join(" ");
}

/**
 * Contrôle la proposition du modèle et substitue les valeurs.
 *
 * Renvoie TOUJOURS un texte utilisable : celui du modèle s'il franchit tous les
 * contrôles, celui du moteur de règles sinon. Une assistance rédactionnelle ne
 * doit jamais laisser le Délégué sans texte.
 */
export function controlerEtSubstituer(
  propositionModele: string,
  preparation: Preparation,
  faits: Fait[]
): ResultatRedaction {
  const repli = texteDeRepli(faits);
  const rejet = (motif: MotifRejet, explication: string): ResultatRedaction => ({
    texte: repli,
    retenu: false,
    motif,
    explication,
  });

  const proposition = propositionModele.trim();
  if (!proposition) return rejet("TEXTE_VIDE", "Le modèle n'a rien proposé.");

  // --- 1. Aucun jeton inventé ----------------------------------------------
  // Un jeton inconnu ne peut pas être substitué : il resterait tel quel dans le
  // document, ou pire, serait remplacé par une valeur voisine.
  const inconnus: string[] = [];
  const trouves = proposition.match(JETON) ?? [];
  for (const jeton of trouves) {
    if (!preparation.substitutions.has(jeton) && !inconnus.includes(jeton)) inconnus.push(jeton);
  }
  if (inconnus.length > 0) {
    return rejet("JETON_INCONNU", `Repères inventés par le modèle : ${inconnus.join(", ")}.`);
  }

  // --- 2. Aucun chiffre hors substitution ----------------------------------
  // Le contrôle porte sur la proposition AVANT substitution : à ce stade, elle
  // ne doit contenir aucun chiffre, puisque tous les nombres sont des jetons.
  // C'est le garde-fou décisif — il rend le faux chiffre impossible, au lieu de
  // le rendre improbable.
  const sansJetons = proposition.replace(JETON, "");
  if (CHIFFRE.test(sansJetons)) {
    const extrait = sansJetons.match(/.{0,28}\d.{0,28}/)?.[0]?.trim() ?? "";
    return rejet(
      "CHIFFRE_NON_SUBSTITUE",
      `Le modèle a écrit un chiffre de lui-même : « …${extrait}… ». Seul le SID produit un chiffre.`
    );
  }

  // --- 3. Lexique d'appréciation ------------------------------------------
  const minuscule = proposition.toLowerCase();
  const interdits = LEXIQUE_INTERDIT.filter((mot) =>
    new RegExp(`(^|[^a-zà-ÿ])${mot}([^a-zà-ÿ]|$)`, "i").test(minuscule)
  );
  if (interdits.length > 0) {
    return rejet(
      "LEXIQUE_NON_AUTORISE",
      `Appréciation non autorisée : ${interdits.join(", ")}. Le SID ne porte pas de jugement que personne n'a validé.`
    );
  }

  // --- 4. Couverture : rien d'important ne doit être tu ---------------------
  const manquants = preparation.obligatoires.filter(
    (id) => !new RegExp(`\\{\\{${id}\\.`).test(proposition)
  );
  if (manquants.length > 0) {
    const libelles = manquants
      .map((id) => preparation.faits.find((f) => f.id === id)?.fait.libelle ?? id)
      .join(", ");
    return rejet(
      "COUVERTURE_INSUFFISANTE",
      `Le texte tait des constats importants : ${libelles}. Une omission ne se voit pas à la lecture.`
    );
  }

  // --- La substitution, seule source de chiffres ---------------------------
  const texte = proposition.replace(JETON, (jeton) => preparation.substitutions.get(jeton) ?? jeton);

  return { texte, retenu: true };
}

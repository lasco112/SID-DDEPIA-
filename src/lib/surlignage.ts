/**
 * Repérer une case, une ligne, un tableau à l'écran — pour qu'« À corriger »
 * emmène l'utilisateur DROIT à l'endroit fautif (demande du Délégué,
 * 1er octobre 2026).
 *
 * Chaque élément repérable porte `data-cible`, une liste de jetons séparés
 * par des espaces (« m:T11_OVINS », « l:Vache c:Vache|Dschang »). L'adresse
 * porte `?cible=jeton,jeton` : le composant SurlignageCible trouve le premier
 * élément présent, le fait défiler à l'écran et l'encadre.
 *
 * Affichage seulement : rien ici ne lit ni n'écrit une donnée.
 */

/** Un jeton : type + valeurs, encodées pour ne contenir ni espace ni virgule. */
export const jeton = (type: string, ...valeurs: string[]) => `${type}:${valeurs.map((v) => encodeURIComponent(v)).join("|")}`;

/** La valeur de l'attribut `data-cible` d'un élément visé par plusieurs jetons. */
export const cibles = (...jetons: string[]) => jetons.join(" ");

/** Jetons des écrans. */
export const cibleMensuelle = {
  /** Une ligne d'un tableau MATRICE du mensuel. */
  champ: (fieldCode: string) => jeton("m", fieldCode),
  /** Une case d'un tableau NOMINATIF du mensuel. */
  caseNominative: (etablissementId: string, fieldCode: string) => jeton("n", etablissementId, fieldCode),
  /** La ligne d'un établissement. */
  etablissement: (etablissementId: string) => jeton("e", etablissementId),
  /** Une ligne d'événement (vaccination, foyer…). */
  evenement: (clientId: string) => jeton("ev", clientId),
  /** Un tableau dans la liste des 28. */
  tableau: (templateCode: string) => jeton("t", templateCode),
};

export const cibleTrimestrielle = {
  ligne: (ligne: string) => jeton("l", ligne),
  case: (ligne: string, colonne: string) => jeton("c", ligne, colonne),
};

/** Ajoute `?cible=` à un chemin. */
export function avecCible(chemin: string, jetons: string[]): string {
  if (jetons.length === 0) return chemin;
  const [base, requete = ""] = chemin.split("?");
  const p = new URLSearchParams(requete);
  p.set("cible", jetons.join(","));
  return `${base}?${p.toString()}`;
}

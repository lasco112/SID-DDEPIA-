/**
 * Les visites guidées : à la PREMIÈRE ouverture d'un écran, des bulles
 * expliquent un à un ses boutons ; on touche l'écran pour passer à la
 * suivante (demande du Délégué, 1er octobre 2026 — phase d'apprentissage).
 *
 * Fréquence (décision du Délégué) :
 *  - une fois par écran et par compte, retenu SUR LE TÉLÉPHONE : un nouveau
 *    téléphone rejoue la visite ;
 *  - quand un écran gagne un bouton, seule sa bulle (marquée « Nouveau ») est
 *    montrée — d'où la `version` de chaque visite et le `depuis` des étapes ;
 *  - à tout moment, « Revoir la visite de cet écran » (aide du bandeau, menu).
 *
 * Chaque élément expliqué porte `data-visite="nom"` (plusieurs noms possibles,
 * séparés par des espaces) ; la visite prend le premier élément VISIBLE.
 */

export interface EtapeVisite {
  /** Le nom porté par l'élément (`data-visite`). */
  cible: string;
  titre: string;
  /** Le texte, éventuellement selon le rôle. */
  texte: string | ((role: string) => string);
  /** Version de la visite où l'étape est apparue (1 par défaut). */
  depuis?: number;
}

export interface DefinitionVisite {
  /** À augmenter quand on ajoute une étape (avec `depuis` = la nouvelle version). */
  version: number;
  etapes: EtapeVisite[];
}

/** Demande de rejouer la visite de l'écran affiché. */
export const EVENEMENT_REVOIR_VISITE = "sid-revoir-visite";

const cle = (username: string, ecran: string) => `sid-visite|${username}|${ecran}`;

/** La version de la visite déjà vue sur ce téléphone par ce compte (0 : jamais). */
export function versionVue(username: string, ecran: string): number {
  try {
    return Number(localStorage.getItem(cle(username, ecran))) || 0;
  } catch {
    // stockage indisponible : on considère la visite vue, plutôt que de la rejouer sans fin
    return Number.MAX_SAFE_INTEGER;
  }
}

export function marquerVue(username: string, ecran: string, version: number): void {
  try {
    localStorage.setItem(cle(username, ecran), String(version));
  } catch {
    // sans conséquence
  }
}

/** Interrupteur (tests automatiques, démonstration) : `localStorage["sid-visites-off"] = "1"`. */
export function visitesCoupees(): boolean {
  try {
    return localStorage.getItem("sid-visites-off") === "1";
  } catch {
    return false;
  }
}

export function revoirLaVisite(): void {
  window.dispatchEvent(new Event(EVENEMENT_REVOIR_VISITE));
}

/** Le premier élément visible portant ce nom. */
export function elementDeVisite(cible: string): HTMLElement | null {
  const tous = document.querySelectorAll<HTMLElement>(`[data-visite~="${CSS.escape(cible)}"]`);
  for (const el of Array.from(tous)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // Sorti à GAUCHE : le tiroir du menu, replié sur téléphone. À droite, c'est
    // une colonne de tableau qu'on fera défiler jusqu'à elle.
    if (r.right <= 0) continue;
    return el;
  }
  return null;
}

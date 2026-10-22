/**
 * LE RETOUR AU TRIMESTRE (décision du Délégué, 22 octobre 2026) : un chef qui
 * part corriger un mois depuis une case du trimestre doit être ramené EXACTEMENT
 * là où il a vu l'erreur — sinon il s'embrouille, et corriger le mensuel ne
 * sert qu'à corriger le trimestre sur lequel il travaille.
 *
 *  1. l'écran du trimestre désigne la case en cours (`preparerRetour`) ;
 *  2. au départ vers le mois (« Ouvrir ce mois »), elle est retenue pour
 *     l'onglet (`partirVersLeMois`, sessionStorage) ;
 *  3. sur l'écran du mois, la barre « Revenir au trimestre » s'affiche en haut
 *     ET en bas (RetourTrimestre.tsx, dans le cadre commun : le module mensuel
 *     n'est pas touché) ;
 *  4. de retour, l'écran du trimestre rouvre le tableau, l'arrondissement et la
 *     case, montre le chiffre d'avant et celui d'après, puis oublie le retour.
 */
const CLE = "sid-retour-trimestre";
/** Au-delà, le retour est périmé : on ne ramène pas quelqu'un à une case d'hier. */
const DUREE_MS = 12 * 3600 * 1000;

export interface RetourTrimestre {
  /** L'adresse de l'écran du trimestre, case comprise (tableau, focus, ligne, colonne, revue). */
  url: string;
  /** « tableau n° 64 — Fongo-Tongo · PPR ». */
  libelle: string;
  /** Le chiffre affiché au départ, pour dire ce qui a changé au retour. */
  avant: string | null;
  le: number;
}

let candidat: Omit<RetourTrimestre, "le"> | null = null;

/** L'écran du trimestre désigne la case dont on pourrait partir vers le mois (null : aucune). */
export function preparerRetour(r: Omit<RetourTrimestre, "le"> | null) {
  candidat = r;
}

/** Au départ vers le mois : la case désignée est retenue pour cet onglet. */
export function partirVersLeMois() {
  if (!candidat) return;
  try {
    sessionStorage.setItem(CLE, JSON.stringify({ ...candidat, le: Date.now() }));
  } catch {
    // stockage indisponible : pas de barre de retour, rien de plus grave
  }
}

export function lireRetour(): RetourTrimestre | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(CLE) ?? "null") as RetourTrimestre | null;
    if (!r?.url || Date.now() - r.le > DUREE_MS) return null;
    return r;
  } catch {
    return null;
  }
}

export function oublierRetour() {
  try {
    sessionStorage.removeItem(CLE);
  } catch {
    // rien à faire
  }
}

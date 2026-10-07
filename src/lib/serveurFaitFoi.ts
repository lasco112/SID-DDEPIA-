/**
 * Une case déjà envoyée (SYNCHRONISE) dont le serveur porte désormais une
 * autre valeur — un chef de section ou le DD l'a corrigée : le téléphone se
 * remet sur le serveur. Rend les champs à changer, ou null s'ils concordent.
 *
 * Constaté le 7 octobre 2026 : après une correction du chef, le téléphone du
 * DA affichait toujours l'ancien chiffre. Une modification locale pas encore
 * envoyée n'est jamais concernée (l'appelant ne passe que les SYNCHRONISE).
 */
export interface ValeurServeur {
  valeur: string | number | null;
  valeurTexte?: string | null;
  nonRenseigne: boolean;
  motifNonRenseigne?: string | null;
}

export function alignerSurServeur(
  local: { valeur?: number | null; valeurTexte?: string | null; nonRenseigne: boolean; motifNonRenseigne?: string | null },
  distant: ValeurServeur,
  texte: boolean
): { valeur: number | null; valeurTexte: string | null; nonRenseigne: boolean; motifNonRenseigne: string | null } | null {
  const valeur = texte || distant.valeur == null ? null : Number(distant.valeur);
  const valeurTexte = texte ? distant.valeurTexte ?? null : null;
  const pareil =
    Boolean(local.nonRenseigne) === Boolean(distant.nonRenseigne) &&
    (texte ? (local.valeurTexte ?? null) === valeurTexte : (local.valeur ?? null) === valeur);
  if (pareil) return null;
  return { valeur, valeurTexte, nonRenseigne: distant.nonRenseigne, motifNonRenseigne: distant.motifNonRenseigne ?? null };
}

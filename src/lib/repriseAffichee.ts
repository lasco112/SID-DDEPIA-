/**
 * Une case est-elle « reprise du mois précédent, à confirmer » ?
 *
 * Le SERVEUR fait foi : c'est lui qui reprend les chiffres (à l'ouverture du
 * mois, ou dès que le mois précédent est transmis en retard) et lui qui
 * refuse la transmission tant qu'ils ne sont pas confirmés. Le téléphone ne
 * l'apprenait jamais — il ne lisait que son propre drapeau, que rien ne
 * mettait à vrai : ni cases grises, ni bouton « Confirmer ce tableau », et un
 * rapport impossible à transmettre (constaté le 1er octobre 2026).
 *
 * Règle : tant que la case du téléphone est identique au serveur
 * (SYNCHRONISE), on suit le serveur ; si elle porte une modification pas
 * encore envoyée, ce n'est plus une reprise — l'agent l'a touchée.
 *
 * Affichage seulement : aucune valeur n'est changée.
 */
export function repriseAffichee(
  local: { statutLocal: string; reporte?: boolean } | undefined,
  distant: { reporte?: boolean } | undefined
): boolean {
  if (local && local.statutLocal !== "SYNCHRONISE") return false;
  if (distant) return Boolean(distant.reporte);
  return Boolean(local?.reporte);
}

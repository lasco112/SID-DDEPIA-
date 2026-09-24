/**
 * Le trimestre qu'on est en train de rédiger : le dernier échu.
 *
 * Ouvrir l'écran sur le trimestre EN COURS ferait écrire des analyses sur une
 * période dont les mois ne sont pas encore transmis. Le rapport trimestriel se
 * rédige après coup ; c'est donc le trimestre précédent qu'on propose.
 */
export function trimestreEchu(maintenant = new Date()): { annee: number; trimestre: number } {
  const t = Math.floor(maintenant.getUTCMonth() / 3); // 0 en janvier-mars
  return t === 0
    ? { annee: maintenant.getUTCFullYear() - 1, trimestre: 4 }
    : { annee: maintenant.getUTCFullYear(), trimestre: t };
}

/**
 * Le trimestre À RAPPORTER — le même sur tous les écrans du trimestre (saisie,
 * analyses, textes, circuit), pour que personne ne rédige sur une période et
 * ne saisisse sur une autre.
 *
 * Pendant le DERNIER mois d'un trimestre, c'est lui : sa saisie trimestrielle
 * commence. Pendant les deux premiers mois du suivant, c'est encore lui : son
 * rapport se rédige et circule. Le 24 septembre, le T3 ; en octobre et en
 * novembre, toujours le T3 ; à partir du 1er décembre, le T4.
 */
export function trimestreARapporter(maintenant = new Date()): { annee: number; trimestre: number } {
  const mois = maintenant.getUTCMonth(); // 0 = janvier
  if (mois % 3 === 2) return { annee: maintenant.getUTCFullYear(), trimestre: Math.floor(mois / 3) + 1 };
  return trimestreEchu(maintenant);
}

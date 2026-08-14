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

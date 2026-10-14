/**
 * Le marqueur de purge des données d'essai, PAR DÉPARTEMENT.
 *
 * Les téléphones comparent la date de la dernière purge à la leur et, si elle
 * a changé, vident leurs saisies locales (voir lib/offlineStore.ts). Une clé
 * unique pour toute la base aurait fait vider les téléphones de TOUS les
 * départements — saisies non envoyées comprises — pour la purge d'un seul.
 *
 * Avant l'ouverture aux autres départements, la clé n'avait pas de suffixe :
 * elle était celle de la Menoua, seul département alors. Elle reste lue pour
 * elle, pour que ses téléphones retrouvent la même valeur et ne se vident pas
 * au passage à la nouvelle forme.
 */
import type { PrismaClient } from "@prisma/client";

const CLE_HISTORIQUE = "donnees_purgees_le";
const CODE_HISTORIQUE = "MEN";

export function cleMarqueurPurge(codeDepartement: string): string {
  return `${CLE_HISTORIQUE}|${codeDepartement}`;
}

/** La date de la dernière purge du département, ou `null` s'il n'a jamais été purgé. */
export async function dernierePurge(db: PrismaClient, codeDepartement: string): Promise<string | null> {
  const marqueur = await db.configSysteme.findUnique({ where: { cle: cleMarqueurPurge(codeDepartement) } });
  if (marqueur) return marqueur.valeur;
  if (codeDepartement !== CODE_HISTORIQUE) return null;
  return (await db.configSysteme.findUnique({ where: { cle: CLE_HISTORIQUE } }))?.valeur ?? null;
}

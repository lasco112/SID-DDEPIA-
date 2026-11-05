/**
 * L'étanchéité entre départements SUR L'APPAREIL de l'administrateur, quand il
 * entre dans un autre département ou en revient (lib/intervention.ts).
 *
 * Le SID garde une copie locale (base Dexie, cache des pages) pour travailler
 * sans réseau. Sans précaution, elle mélangerait deux départements : des
 * établissements ou des pages de l'un resteraient affichés chez l'autre, et un
 * travail en attente d'envoi partirait, au retour du réseau, dans le
 * département où l'on se trouve À CE MOMENT-LÀ — pas dans celui où il a été
 * fait (exigence du Délégué, 4 novembre 2026).
 *
 * D'où deux règles : on ne change pas de département tant que quelque chose
 * attend d'être envoyé ; et, au changement, la copie locale est vidée en
 * entier, puis retéléchargée pour le département où l'on arrive.
 */
import { offlineDB } from "@/lib/dexie";

/** Ce qui attend encore d'être envoyé depuis cet appareil. */
export async function travailEnAttente(): Promise<number> {
  try {
    const [operations, trimestre, saisies] = await Promise.all([
      offlineDB.fileAttente.count(),
      offlineDB.fileTrimestre.count(),
      offlineDB.saisies.filter((s) => s.statutLocal !== "SYNCHRONISE").count(),
    ]);
    return operations + trimestre + saisies;
  } catch {
    return 0; // base locale absente ou illisible : rien à perdre
  }
}

/** Vide entièrement la copie locale : base de l'appareil et pages gardées. */
export async function viderCopieLocale(): Promise<void> {
  try {
    offlineDB.close();
    await offlineDB.delete();
  } catch {
    // base déjà absente
  }
  try {
    if (typeof caches !== "undefined") for (const cle of await caches.keys()) await caches.delete(cle);
  } catch {
    // cache indisponible : sans conséquence pour l'étanchéité côté serveur
  }
  try {
    sessionStorage.clear();
  } catch {
    // stockage indisponible
  }
}

export const MESSAGE_TRAVAIL_EN_ATTENTE = (n: number) =>
  `${n} élément(s) attendent encore d'être envoyés depuis cet appareil. Envoyez-les d'abord (Outils → Synchronisation) : changer de département maintenant les ferait partir au mauvais endroit.`;

/**
 * synchronisation.ts — envoi des saisies en attente vers le serveur.
 *
 * Extrait de SyncButton pour être partagé avec l'écran de synchronisation :
 * deux implémentations séparées finiraient par diverger, et l'agent verrait
 * des chiffres différents selon l'écran consulté.
 *
 * N'inclut JAMAIS la soumission officielle du rapport : mettre ses données à
 * l'abri sur le serveur et déclarer son rapport au Délégué Départemental sont
 * deux décisions distinctes.
 */

import { offlineDB } from "@/lib/dexie";

const TAILLE_LOT = 200;
const CLE_DERNIERE_SYNCHRO = "sid-ddepia-derniere-synchro";

export interface EtatSynchronisation {
  saisiesEnAttente: number;
  operationsEnAttente: number;
  saisiesEnErreur: number;
  derniereSynchro: string | null;
}

export function memoriserSynchroReussie(): void {
  try {
    localStorage.setItem(CLE_DERNIERE_SYNCHRO, new Date().toISOString());
  } catch {
    // stockage indisponible : on perd seulement l'affichage de la date
  }
}

export function derniereSynchro(): string | null {
  try {
    return localStorage.getItem(CLE_DERNIERE_SYNCHRO);
  } catch {
    return null;
  }
}

export async function etatSynchronisation(username: string): Promise<EtatSynchronisation> {
  const [saisiesEnAttente, saisiesEnErreur, operationsEnAttente] = await Promise.all([
    offlineDB.saisies
      .where("[username+statutLocal]")
      .anyOf([username, "BROUILLON_LOCAL"], [username, "SYNCHRO_EN_ATTENTE"], [username, "ERREUR_SYNCHRO"])
      .count(),
    offlineDB.saisies.where("[username+statutLocal]").equals([username, "ERREUR_SYNCHRO"]).count(),
    offlineDB.fileAttente.count(),
  ]);
  return { saisiesEnAttente, saisiesEnErreur, operationsEnAttente, derniereSynchro: derniereSynchro() };
}

/**
 * Pousse la file locale des saisies vers /api/sync. Renvoie le nombre de
 * saisies confirmées par le serveur. Une saisie n'est marquée SYNCHRONISE que
 * si le serveur l'a explicitement confirmée (`confirmedIds`) — jamais par
 * optimisme.
 */
export async function envoyerSaisiesEnAttente(username: string, periodeId: string): Promise<number> {
  const file = await offlineDB.saisies
    .where("[username+statutLocal]")
    .anyOf([username, "BROUILLON_LOCAL"], [username, "SYNCHRO_EN_ATTENTE"], [username, "ERREUR_SYNCHRO"])
    .toArray();
  if (file.length === 0) return 0;

  await offlineDB.saisies.bulkPut(file.map((s) => ({ ...s, statutLocal: "SYNCHRO_EN_ATTENTE" as const })));

  let confirmees = 0;
  for (let i = 0; i < file.length; i += TAILLE_LOT) {
    const lot = file.slice(i, i + TAILLE_LOT);
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodeId, saisies: lot }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      // Les messages techniques de la base (« Unique constraint failed on the
      // fields... ») étaient affichés tels quels aux agents de terrain, en
      // anglais et incompréhensibles. On ne remonte que les messages
      // réellement destinés à l'utilisateur.
      const messageMetier =
        typeof err.message === "string" && !/prisma|constraint|invocation/i.test(err.message) ? err.message : null;
      const message =
        res.status === 423
          ? messageMetier ?? "Période verrouillée. Contactez le Délégué Départemental."
          : messageMetier ?? "Envoi impossible pour le moment. Vos données restent enregistrées sur cet appareil.";
      // Échec VISIBLE, jamais silencieux : la saisie reste sur l'appareil et
      // sera reprise telle quelle à la tentative suivante.
      await offlineDB.transaction("rw", offlineDB.saisies, async () => {
        for (const s of lot) {
          await offlineDB.saisies.update(s.clientId, { statutLocal: "ERREUR_SYNCHRO", erreurSynchro: message });
        }
      });
      throw new Error(message);
    }

    const { confirmedIds } = (await res.json()) as { confirmedIds: string[] };
    await offlineDB.transaction("rw", offlineDB.saisies, async () => {
      for (const id of confirmedIds) {
        await offlineDB.saisies.update(id, { statutLocal: "SYNCHRONISE" });
      }
    });
    confirmees += confirmedIds.length;
  }

  memoriserSynchroReussie();
  return confirmees;
}

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
  /**
   * Nombre de cases RENSEIGNÉES présentes sur cet appareil, tous statuts
   * confondus. Sans ce chiffre il était impossible de distinguer deux
   * situations opposées : un appareil qui a beaucoup de travail non transmis,
   * et un appareil qui n'en a plus du tout. Le comparer au « Remplissage du
   * canevas » de la Supervision répond immédiatement à la question « où sont
   * les données ? ».
   */
  saisiesSurCetAppareil: number;
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

  // Ne compte que les cases réellement renseignées : une valeur, un texte, ou
  // un « non renseigné » motivé. Les lignes vides ne sont pas du travail.
  const saisiesSurCetAppareil = await offlineDB.saisies
    .where("username")
    .equals(username)
    .filter((s) => s.valeur != null || Boolean(s.valeurTexte) || s.nonRenseigne || Boolean(s.payload))
    .count();

  return {
    saisiesEnAttente,
    saisiesEnErreur,
    operationsEnAttente,
    saisiesSurCetAppareil,
    derniereSynchro: derniereSynchro(),
  };
}

/**
 * Pousse la file locale des saisies vers /api/sync. Renvoie le nombre de
 * saisies confirmées par le serveur. Une saisie n'est marquée SYNCHRONISE que
 * si le serveur l'a explicitement confirmée (`confirmedIds`) — jamais par
 * optimisme.
 */
export async function envoyerSaisiesEnAttente(username: string, periodeId: string): Promise<number> {
  const toutesLesSaisies = await offlineDB.saisies
    .where("[username+statutLocal]")
    .anyOf([username, "BROUILLON_LOCAL"], [username, "SYNCHRO_EN_ATTENTE"], [username, "ERREUR_SYNCHRO"])
    .toArray();
  if (toutesLesSaisies.length === 0) return 0;

  // La file peut contenir des saisies de PLUSIEURS mois — depuis que la
  // période de travail est sélectionnable, un agent peut remplir juin puis
  // juillet avant de retrouver du réseau. Envoyer le tout sous un seul
  // periodeId ferait basculer les données de juin dans le rapport de juillet,
  // exactement ce que le cahier des charges interdit (§1). On envoie donc un
  // lot par période, chacun avec SA période.
  //
  // `periodeId` reste le repli des saisies antérieures à cette règle, qui
  // n'en portent pas.
  const parPeriode = new Map<string, typeof toutesLesSaisies>();
  for (const s of toutesLesSaisies) {
    const cle = s.periodeId || periodeId;
    if (!parPeriode.has(cle)) parPeriode.set(cle, []);
    parPeriode.get(cle)!.push(s);
  }

  await offlineDB.saisies.bulkPut(toutesLesSaisies.map((s) => ({ ...s, statutLocal: "SYNCHRO_EN_ATTENTE" as const })));

  let confirmees = 0;
  let refusees = 0;
  /** Premier refus d'un mois entier : les AUTRES mois partent quand même. */
  let refusDUnMois: string | null = null;
  for (const [periodeDuLot, file] of Array.from(parPeriode.entries())) {
  for (let i = 0; i < file.length; i += TAILLE_LOT) {
    const lot = file.slice(i, i + TAILLE_LOT);
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodeId: periodeDuLot, saisies: lot }),
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
      // sera reprise telle quelle à la tentative suivante. Tout le reste du
      // mois est marqué avec le même motif — « À corriger » le montre.
      const restant = file.slice(i);
      await offlineDB.transaction("rw", offlineDB.saisies, async () => {
        for (const s of restant) {
          await offlineDB.saisies.update(s.clientId, { statutLocal: "ERREUR_SYNCHRO", erreurSynchro: message });
        }
      });
      // Pas de réseau ou serveur en difficulté : inutile d'essayer les autres
      // mois maintenant. Un mois verrouillé ou déjà transmis, lui, ne doit
      // pas empêcher les autres de partir (constaté : un mois bloqué gardait
      // tout le travail du mois suivant sur le téléphone).
      if (res.status !== 423) throw new Error(message);
      refusDUnMois ??= message;
      break;
    }

    const { confirmedIds, echecs = [] } = (await res.json()) as {
      confirmedIds: string[];
      echecs?: Array<{ clientId: string; erreur: string }>;
    };
    await offlineDB.transaction("rw", offlineDB.saisies, async () => {
      for (const id of confirmedIds) {
        await offlineDB.saisies.update(id, { statutLocal: "SYNCHRONISE", erreurSynchro: null });
      }
      // Refusées par le serveur : CONSERVÉES en attente et signalées. Les faire
      // passer pour envoyées reviendrait à les perdre sans que personne ne le
      // remarque — c'est ce qui a vidé la file de Fokoué alors que le serveur
      // n'avait rien reçu.
      for (const e of echecs) {
        await offlineDB.saisies.update(e.clientId, {
          statutLocal: "ERREUR_SYNCHRO",
          erreurSynchro: "Refusée par le serveur : " + e.erreur,
        });
      }
    });
    confirmees += confirmedIds.length;
    refusees += echecs.length;
  }
  }

  // « Dernier envoi réussi » ne doit être mis à jour que si TOUT est passé,
  // sans quoi l'écran de synchronisation affiche un succès trompeur.
  if (refusDUnMois) throw new Error(refusDUnMois);
  if (refusees === 0) memoriserSynchroReussie();
  else throw new Error(`${refusees} saisie(s) refusée(s) par le serveur. Elles restent sur cet appareil.`);
  return confirmees;
}

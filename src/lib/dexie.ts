/**
 * dexie.ts — Schéma IndexedDB local (CDC §11, M2 saisie offline)
 * ---------------------------------------------------------------------------
 * Une ligne par cellule (MATRICE), par (établissement, champ) (NOMINATIF) ou
 * par événement (EVENEMENT). Un même store `saisies` couvre les 3 familles :
 * seuls les champs pertinents à la famille sont renseignés.
 *
 * `0 ≠ non renseigné` (CDC §4.3) : `valeur=0` est un zéro réel ; si la cellule
 * n'a jamais été touchée elle n'existe simplement pas encore dans Dexie.
 * `nonRenseigne=true` exige `motifNonRenseigne` et exclut `valeur`.
 *
 * Cloisonnement par utilisateur (`username`) : IndexedDB est partagé par
 * origine, pas par session. Si deux comptes DA se connectent sur le même
 * appareil/navigateur, les brouillons non synchronisés du premier ne doivent
 * jamais apparaître dans la saisie du second (CDC §A.2 : un DA ne voit que
 * SON arrondissement) — d'où le préfixe `username` sur tous les index.
 */

import Dexie, { type Table } from "dexie";

export type Famille = "MATRICE" | "NOMINATIF" | "EVENEMENT";
export type StatutLocal = "BROUILLON_LOCAL" | "SYNCHRO_EN_ATTENTE" | "SYNCHRONISE";

export interface SaisieOffline {
  clientId: string; // uuid v4 généré localement — clé d'idempotence de la sync
  username: string; // compte DA propriétaire de ce brouillon local
  periodeId: string;
  templateCode: string;
  famille: Famille;

  // MATRICE
  fieldCode?: string;
  valeur?: number | null;
  valeurTexte?: string | null; // champs MATRICE de type TEXTE (ex. T21_LIEUX)

  // NOMINATIF
  etablissementId?: string;
  // fieldCode + valeur réutilisés ci-dessus

  // EVENEMENT
  payload?: Record<string, unknown>;

  nonRenseigne: boolean;
  motifNonRenseigne?: string | null;

  statutLocal: StatutLocal;
  updatedAt: string; // ISO
}

export class SIDOfflineDB extends Dexie {
  saisies!: Table<SaisieOffline, string>;

  constructor() {
    super("SID_DDEPIA_MENOUA");
    this.version(2).stores({
      saisies:
        "clientId, statutLocal, templateCode, [periodeId+templateCode], [periodeId+templateCode+fieldCode], [periodeId+templateCode+etablissementId+fieldCode], updatedAt",
    });
    this.version(3)
      .stores({
        saisies:
          "clientId, username, statutLocal, [username+statutLocal], [username+periodeId+templateCode], [username+periodeId+templateCode+fieldCode], [username+periodeId+templateCode+etablissementId+fieldCode], updatedAt",
      })
      .upgrade((tx) => {
        // Brouillons d'avant le cloisonnement par utilisateur : on ne peut
        // pas deviner leur propriétaire légitime, donc on les vide plutôt
        // que de risquer de les montrer à un autre compte (rien n'est
        // sur-écrit côté serveur : ces brouillons non encore synchronisés
        // sont simplement retapés si besoin).
        return tx.table("saisies").clear();
      });
  }
}

export const offlineDB = new SIDOfflineDB();

/** Retrouve (ou non) la saisie locale existante d'une cellule MATRICE, pour éditer en place plutôt que dupliquer. */
export function trouverSaisieMatrice(username: string, periodeId: string, templateCode: string, fieldCode: string) {
  return offlineDB.saisies
    .where("[username+periodeId+templateCode+fieldCode]")
    .equals([username, periodeId, templateCode, fieldCode])
    .first();
}

/** Retrouve (ou non) la saisie locale existante d'une cellule NOMINATIF, pour éditer en place plutôt que dupliquer. */
export function trouverSaisieNominatif(
  username: string,
  periodeId: string,
  templateCode: string,
  etablissementId: string,
  fieldCode: string
) {
  return offlineDB.saisies
    .where("[username+periodeId+templateCode+etablissementId+fieldCode]")
    .equals([username, periodeId, templateCode, etablissementId, fieldCode])
    .first();
}

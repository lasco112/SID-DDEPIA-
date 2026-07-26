/**
 * dexie.ts — Schéma IndexedDB local (CDC §11, M2 saisie offline)
 * ---------------------------------------------------------------------------
 * Deux familles de données vivent ici :
 *
 * 1. LES SAISIES (`saisies`) — ce que l'utilisateur produit. Une ligne par
 *    cellule (MATRICE), par (établissement, champ) (NOMINATIF) ou par
 *    événement (EVENEMENT). C'est la source de vérité tant que le serveur
 *    n'a pas confirmé.
 *
 * 2. LES DONNÉES DE RÉFÉRENCE (`meta`, `tableaux`, `etablissements`,
 *    `referentiels`, `periodes`) — ce que l'application a besoin de LIRE pour
 *    afficher un formulaire : les 28 tableaux et leurs champs, le registre des
 *    établissements, les nomenclatures, la période en cours. Elles sont
 *    téléchargées en une fois à la connexion (voir /api/bootstrap et
 *    lib/offlineStore.ts) pour que l'ouverture d'un tableau ne dépende plus
 *    jamais du réseau — c'était le verrou principal du hors-ligne.
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
export type StatutLocal = "BROUILLON_LOCAL" | "SYNCHRO_EN_ATTENTE" | "SYNCHRONISE" | "ERREUR_SYNCHRO";

export interface SaisieOffline {
  clientId: string; // uuid v4 généré localement — clé d'idempotence de la sync
  username: string; // compte DA propriétaire de ce brouillon local
  periodeId: string;
  templateCode: string;
  famille: Famille;

  // MATRICE
  fieldCode?: string;
  valeur?: number | null;
  valeurTexte?: string | null; // champs de type TEXTE (ex. T21_LIEUX, Observations)

  // NOMINATIF
  etablissementId?: string;
  // fieldCode + valeur réutilisés ci-dessus

  // EVENEMENT
  payload?: Record<string, unknown>;

  nonRenseigne: boolean;
  motifNonRenseigne?: string | null;

  statutLocal: StatutLocal;
  /** Message d'erreur de la dernière tentative de synchronisation (statutLocal = ERREUR_SYNCHRO). */
  erreurSynchro?: string | null;
  updatedAt: string; // ISO
}

// ---------------------------------------------------------------------------
// Données de référence téléchargées (lecture seule côté client)
// ---------------------------------------------------------------------------

export interface MetaOffline {
  cle: "bootstrap";
  username: string;
  nom: string;
  role: string;
  arrondissementId: string | null;
  arrondissementNom: string | null;
  sectionId: string | null;
  periodeActiveId: string | null;
  /** Date du dernier téléchargement complet — sert à l'expiration de l'accès hors ligne. */
  telechargeLe: string;
  /**
   * Date de la dernière purge des données décidée par le DD, telle que reçue
   * du serveur. Si elle change, les brouillons locaux de cet appareil sont
   * obsolètes (ils recréeraient les données purgées en se synchronisant) et
   * sont vidés — voir offlineStore.telechargerBootstrap.
   */
  donneesPurgeesLe?: string | null;
  /** Empreinte SHA-256 du code PIN local (appareil partagé) — jamais le PIN en clair. */
  pinHash?: string;
}

export interface ChampOffline {
  code: string;
  libelle: string;
  uniteCode: string | null;
  uniteLibelle: string;
  typeValeur: string;
  ordre: number;
}

export interface TableauOffline {
  code: string;
  numero: string;
  titre: string;
  type: Famille;
  ordre: number;
  sectionCode: string;
  fields: ChampOffline[];
  schemaEvenement: unknown;
  /** Type d'établissement concerné pour les tableaux NOMINATIF (sinon null). */
  etablissementTypeCode: string | null;
}

export interface EtablissementOffline {
  id: string;
  typeCode: string;
  nom: string;
  localite: string;
  arrondissementId: string;
  actif: boolean;
  proprietaire?: string | null;
  telephone?: string | null;
  /**
   * Suppression demandée hors ligne (« tombstone ») : l'établissement
   * disparaît immédiatement des écrans mais reste stocké tant que le serveur
   * n'a pas confirmé, sinon l'opération serait perdue au rechargement.
   */
  deletedAt?: string | null;
  /** Créé/modifié sur cet appareil et pas encore confirmé par le serveur. */
  enAttenteSynchro?: boolean;
}

/**
 * File d'attente des opérations faites hors ligne sur des données autres que
 * les saisies (celles-ci ont déjà leur propre file via `saisies.statutLocal`).
 * Rejouée dans l'ordre dès le retour du réseau — voir lib/etablissementsLocal.
 */
export interface OperationEnAttente {
  id?: number;
  entite: "etablissement";
  operation: "CREATION" | "MODIFICATION" | "SUPPRESSION";
  /** Identifiant de la cible — généré sur l'appareil pour une création. */
  cibleId: string;
  payload: Record<string, unknown>;
  creeLe: string;
  tentatives: number;
  derniereErreur?: string | null;
}

export interface ReferentielOffline {
  /** `${categorie}:${code}` — IndexedDB exige une clé simple. */
  id: string;
  categorie: string;
  code: string;
  libelle: string;
  ordre: number;
}

export interface PeriodeOffline {
  id: string;
  type: string;
  annee: number;
  mois: number | null;
  statut: string;
  dateLimiteDA: string | null;
  dateLimiteDD: string | null;
}

export class SIDOfflineDB extends Dexie {
  saisies!: Table<SaisieOffline, string>;
  meta!: Table<MetaOffline, string>;
  tableaux!: Table<TableauOffline, string>;
  etablissements!: Table<EtablissementOffline, string>;
  referentiels!: Table<ReferentielOffline, string>;
  periodes!: Table<PeriodeOffline, string>;
  fileAttente!: Table<OperationEnAttente, number>;

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
    // v4 : ajout des données de référence hors ligne. Purement additif — les
    // saisies déjà présentes sur l'appareil sont conservées telles quelles.
    this.version(4).stores({
      meta: "cle",
      tableaux: "code, ordre, type",
      etablissements: "id, typeCode, arrondissementId, [typeCode+arrondissementId]",
      referentiels: "id, categorie",
      periodes: "id",
    });
    // v5 : file d'attente des opérations hors ligne sur les établissements
    // (création, modification, suppression). Purement additif — aucune donnée
    // existante n'est touchée.
    this.version(5).stores({
      fileAttente: "++id, entite, operation, creeLe",
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

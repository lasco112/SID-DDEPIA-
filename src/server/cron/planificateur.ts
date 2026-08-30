/**
 * planificateur.ts — fait réellement partir les relances calendaires.
 *
 * Jusqu'ici elles vivaient dans un processus séparé (`npm run cron`) que
 * Railway ne démarre jamais : personne n'a donc reçu le rappel du 27 ni
 * l'alerte de retard du 28 depuis la mise en service.
 *
 * Trois choix, dans cet ordre de priorité :
 *
 *  1. **Ne jamais empêcher l'application de démarrer.** Toute erreur ici est
 *     journalisée et avalée : une relance manquée est un désagrément, un
 *     service qui ne démarre pas est une panne pour six arrondissements.
 *
 *  2. **Rattrapage plutôt qu'horaire exact.** Un conteneur redémarre, se
 *     redéploie, dort. Une tâche programmée « le 27 à 08h00 » qui tombe
 *     pendant un redémarrage serait perdue à jamais. On vérifie donc chaque
 *     heure : « cette relance aurait-elle dû partir, et n'est-elle pas déjà
 *     partie ? »
 *
 *  3. **Une seule fois par mois visé.** Un marqueur en base empêche le
 *     doublon, y compris si plusieurs instances tournent en parallèle.
 *
 * Le marqueur porte sur le MOIS QUE LE DÉCLENCHEUR VISE, et non sur une
 * période choisie ici : chaque déclencheur résout lui-même sa période (le mois
 * calendaire en cours, ou le précédent pour le rappel de clôture). Marquer
 * autre chose reviendrait à noter « fait » une relance qui n'a rien traité.
 *
 * Cloisonnement — pourquoi une boucle et non une connexion d'administration
 * -------------------------------------------------------------------------
 * Une relance concerne tous les départements, mais la traiter avec un client
 * privilégié ouvrirait en permanence la seule porte qui contourne les
 * politiques de sécurité par ligne. On parcourt donc les départements l'un
 * après l'autre, avec le client cloisonné de chacun : plus long à écrire,
 * aucun chemin privilégié durable. Un département en échec n'empêche pas les
 * autres d'être traités.
 */
import cron from "node-cron";
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { clientCloisonne } from "@/lib/dbCloisonne";
import { purgerSortiesBrutes } from "@/server/redaction/journal";
import { rappelJ1DA, verrouillageEtAlerteRetardDA, alerteRetardSections, rappelClotureDD } from "@/server/cron/triggers";

let demarre = false;

/** Décalage du Cameroun (Africa/Douala, UTC+1, sans heure d'été). */
const DECALAGE_DOUALA_H = 1;

/** Instant UTC correspondant à `jour` à `heure` locale, dans le mois de `reference`. */
function instantLocal(reference: Date, jour: number, heure: number): Date {
  return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), jour, heure - DECALAGE_DOUALA_H, 0, 0));
}

interface Relance {
  code: string;
  /** Échéance à partir de laquelle la relance doit être partie. */
  echeance: (maintenant: Date) => Date;
  /** Mois visé par le déclencheur — sert de clé au marqueur. */
  moisVise: (maintenant: Date) => { annee: number; mois: number };
  /** Reçoit le client cloisonné du département en cours de traitement. */
  executer: (base: PrismaClient) => Promise<{ notifies: number }>;
}

const moisCourant = (d: Date) => ({ annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1 });
const moisPrecedent = (d: Date) => {
  const m = d.getUTCMonth(); // 0-indexé : le mois précédent en 1-indexé
  return m === 0 ? { annee: d.getUTCFullYear() - 1, mois: 12 } : { annee: d.getUTCFullYear(), mois: m };
};

const RELANCES: Relance[] = [
  // Rappel préventif la veille de l'échéance des DA.
  { code: "RAPPEL_J-1", echeance: (n) => instantLocal(n, 27, 8), moisVise: moisCourant, executer: rappelJ1DA },
  // Échéance dépassée : verrouillage de la période et alerte aux retardataires.
  { code: "RETARD_DA", echeance: (n) => instantLocal(n, 28, 18), moisVise: moisCourant, executer: verrouillageEtAlerteRetardDA },
  { code: "RETARD_SECTIONS", echeance: (n) => instantLocal(n, 29, 18), moisVise: moisCourant, executer: alerteRetardSections },
  // Le 2 du mois, sur le mois écoulé.
  { code: "RAPPEL_CLOTURE_DD", echeance: (n) => instantLocal(n, 2, 8), moisVise: moisPrecedent, executer: rappelClotureDD },
];

const UN_JOUR = 24 * 60 * 60 * 1000;

/**
 * Le marqueur porte le code du département : sans lui, le premier département
 * traité marquerait la relance « faite » pour tous les autres, qui ne seraient
 * jamais prévenus. `ConfigSysteme` est une table commune (pas de colonne
 * `departementId`), le département tient donc dans la clé.
 */
function cleMarqueur(code: string, departement: string, annee: number, mois: number) {
  return `relance_${code}_${departement}_${annee}-${String(mois).padStart(2, "0")}`;
}

/** Forme de la clé avant le cloisonnement, sans département. Voir plus bas. */
function cleMarqueurHeritee(code: string, annee: number, mois: number) {
  return `relance_${code}_${annee}-${String(mois).padStart(2, "0")}`;
}

/**
 * Passe en revue les relances dues et non encore parties, département par
 * département. Sans effet la plupart des heures du mois.
 *
 * `maintenant` n'est là que pour la vérification : sans lui, on ne pourrait
 * exercer cette fonction qu'aux quelques heures du mois où une relance est due
 * (voir `scripts/verifier-relances-cloisonnees.ts`). Les appelants réels ne le
 * passent jamais.
 */
export async function verifierRelances(maintenant: Date = new Date()): Promise<void> {
  // `Departement` n'est pas une table cloisonnée : c'est l'unité de
  // cloisonnement elle-même, lisible sans réglage de session.
  const departements = await db.departement.findMany({ orderBy: { code: "asc" } });

  for (const relance of RELANCES) {
    const due = relance.echeance(maintenant);
    if (maintenant < due) continue;

    // Au-delà de dix jours, une relance n'a plus d'objet : le mois est passé.
    // Cette borne évite aussi qu'un premier démarrage réveille des relances
    // très anciennes et inonde les téléphones.
    if (maintenant.getTime() - due.getTime() > 10 * UN_JOUR) continue;

    const vise = relance.moisVise(maintenant);

    for (const departement of departements) {
      const cle = cleMarqueur(relance.code, departement.code, vise.annee, vise.mois);

      // Le mois de la mise en service du cloisonnement, les relances déjà
      // parties ne portent que l'ancienne clé, sans département. La consulter
      // évite un second envoi sur les téléphones des DA. Uniquement quand il
      // n'y a qu'un département : c'est la situation dans laquelle cette clé a
      // été écrite, et au-delà elle en masquerait d'autres à tort.
      const cles = departements.length === 1
        ? [cle, cleMarqueurHeritee(relance.code, vise.annee, vise.mois)]
        : [cle];

      try {
        if (await db.configSysteme.findFirst({ where: { cle: { in: cles } } })) continue;

        const r = await relance.executer(clientCloisonne(db, departement.id));
        await db.configSysteme.upsert({
          where: { cle },
          update: { valeur: `${maintenant.toISOString()} — ${r.notifies} notification(s)` },
          create: { cle, valeur: `${maintenant.toISOString()} — ${r.notifies} notification(s)` },
        });
        console.log(`[relances] ${relance.code} ${departement.code} ${vise.mois}/${vise.annee} : ${r.notifies} notification(s).`);
      } catch (e) {
        console.error(`[relances] ${relance.code} a échoué pour ${departement.code} :`, e);
        // Pas de marqueur : la relance sera retentée à l'heure suivante, et les
        // départements suivants sont traités malgré cet échec.
      }
    }
  }

  /*
   * L'entretien des sorties brutes de l'assistance rédactionnelle : elles
   * portent de la donnée et ne se conservent que trente jours.
   *
   * Ici plutôt que dans une tâche à part : le passage horaire existe déjà, il
   * est éprouvé, et il tourne dans le processus de l'application. Ajouter un
   * ordonnanceur pour une requête par heure serait de l'infrastructure pour
   * rien. Un échec est avalé — un ménage manqué ne doit pas empêcher une
   * relance de partir.
   */
  for (const departement of departements) {
    try {
      // Département par département, comme les relances : `AppelIA` est une
      // table cloisonnée, et purger avec le client nu ne verrait AUCUNE ligne —
      // le ménage n'aurait jamais lieu, sans que rien ne le signale.
      await purgerSortiesBrutes(clientCloisonne(db, departement.id), maintenant);
    } catch (e) {
      console.error(`[assistance] purge des sorties brutes (${departement.code}) :`, e);
    }
  }
}

/**
 * Démarre la surveillance horaire. Sans effet si déjà démarrée (rechargement
 * à chaud en développement).
 */
export function demarrerPlanificateur(): void {
  if (demarre) return;
  demarre = true;

  // Un passage peu après le démarrage rattrape ce qui a été manqué pendant
  // l'arrêt ou le redéploiement du service.
  setTimeout(() => {
    verifierRelances().catch((e) => console.error("[relances] passage initial :", e));
  }, 30_000);

  cron.schedule("5 * * * *", () => {
    verifierRelances().catch((e) => console.error("[relances] passage horaire :", e));
  });

  console.log("[relances] planificateur démarré (vérification horaire).");
}

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
 */
import cron from "node-cron";
import { db } from "@/lib/db";
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
  executer: () => Promise<{ notifies: number }>;
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

function cleMarqueur(code: string, annee: number, mois: number) {
  return `relance_${code}_${annee}-${String(mois).padStart(2, "0")}`;
}

/**
 * Passe en revue les relances dues et non encore parties. Sans effet la
 * plupart des heures du mois.
 */
export async function verifierRelances(): Promise<void> {
  const maintenant = new Date();

  for (const relance of RELANCES) {
    const due = relance.echeance(maintenant);
    if (maintenant < due) continue;

    // Au-delà de dix jours, une relance n'a plus d'objet : le mois est passé.
    // Cette borne évite aussi qu'un premier démarrage réveille des relances
    // très anciennes et inonde les téléphones.
    if (maintenant.getTime() - due.getTime() > 10 * UN_JOUR) continue;

    const vise = relance.moisVise(maintenant);
    const cle = cleMarqueur(relance.code, vise.annee, vise.mois);

    try {
      if (await db.configSysteme.findUnique({ where: { cle } })) continue;

      const r = await relance.executer();
      await db.configSysteme.upsert({
        where: { cle },
        update: { valeur: `${maintenant.toISOString()} — ${r.notifies} notification(s)` },
        create: { cle, valeur: `${maintenant.toISOString()} — ${r.notifies} notification(s)` },
      });
      console.log(`[relances] ${relance.code} ${vise.mois}/${vise.annee} : ${r.notifies} notification(s).`);
    } catch (e) {
      console.error(`[relances] ${relance.code} a échoué :`, e);
      // Pas de marqueur : la relance sera retentée à l'heure suivante.
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

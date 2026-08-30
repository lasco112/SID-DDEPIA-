/**
 * alerts.ts — Planificateur des relances calendaires (CDC §12.1).
 * ---------------------------------------------------------------------------
 * Exécution : process séparé (`npm run cron`), supervisé par PM2/systemd sur
 * le VPS — ne dépend pas du cycle de vie du process Next.js.
 *
 * Ce fichier ne décide plus QUAND ni POUR QUI une relance part : il délègue à
 * `verifierRelances`, qui parcourt les départements l'un après l'autre avec le
 * client cloisonné de chacun et pose un marqueur en base. Deux conséquences :
 *
 *  - la logique du cloisonnement n'existe qu'à un seul endroit ;
 *  - ce process et celui de l'application peuvent tourner en même temps sans
 *    envoyer la relance deux fois — le marqueur les départage.
 */
import cron from "node-cron";
import { verifierRelances } from "./planificateur";

const TZ = "Africa/Douala";

// Comme dans l'application : vérification horaire plutôt qu'horaire exact, pour
// rattraper ce qui serait tombé pendant un arrêt du service.
cron.schedule(
  "5 * * * *",
  () => {
    verifierRelances().catch((e) => console.error("[CRON] passage horaire :", e));
  },
  { timezone: TZ }
);

verifierRelances().catch((e) => console.error("[CRON] passage initial :", e));

console.log(`[CRON] Planificateur d'alertes SID démarré (fuseau ${TZ}) — tous départements.`);

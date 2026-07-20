/**
 * alerts.ts — Planificateur des relances calendaires (CDC §12.1).
 * ---------------------------------------------------------------------------
 * Exécution : process séparé (`npm run cron`), supervisé par PM2/systemd sur
 * le VPS — ne dépend pas du cycle de vie du process Next.js.
 */
import cron from "node-cron";
import { rappelJ1DA, verrouillageEtAlerteRetardDA, alerteRetardSections, rappelClotureDD } from "./triggers";

const TZ = "Africa/Douala";

cron.schedule(
  "0 8 27 * *",
  async () => {
    const r = await rappelJ1DA();
    console.log(`[CRON] Rappel J-1 DA : ${r.notifies} notification(s).`);
  },
  { timezone: TZ }
);

cron.schedule(
  "0 18 28 * *",
  async () => {
    const r = await verrouillageEtAlerteRetardDA();
    console.log(`[CRON] Verrouillage période : ${r.verrouille}, ${r.notifies} alerte(s) de retard.`);
  },
  { timezone: TZ }
);

cron.schedule(
  "0 18 29 * *",
  async () => {
    const r = await alerteRetardSections();
    console.log(`[CRON] Alerte retard sections : ${r.notifies} notification(s).`);
  },
  { timezone: TZ }
);

cron.schedule(
  "0 8 2 * *",
  async () => {
    const r = await rappelClotureDD();
    console.log(`[CRON] Rappel clôture DD : ${r.notifies} notification(s).`);
  },
  { timezone: TZ }
);

console.log(`[CRON] Planificateur d'alertes SID DDEPIA-Menoua démarré (fuseau ${TZ}).`);

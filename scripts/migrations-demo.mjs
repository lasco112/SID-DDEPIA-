/**
 * Applique les migrations à la base de DÉMONSTRATION au démarrage.
 *
 * La base de production, elle, est migrée juste avant par la commande
 * `prisma migrate deploy` du script `start` — invocation inchangée et
 * éprouvée : le démarrage du service ne doit dépendre d'aucun script maison.
 *
 * Pourquoi ce script : `prisma migrate deploy` n'agit que sur DATABASE_URL.
 * La base de démonstration restait donc figée au schéma du jour de sa
 * création et prenait du retard à chaque migration, jusqu'à ce que les écrans
 * partagés (supervision, saisie…) demandent des colonnes inexistantes et
 * plantent — uniquement pour les comptes de démonstration, donc sans que
 * personne ne s'en aperçoive avant une présentation.
 *
 * Son échec n'empêche JAMAIS le démarrage : le mode démonstration est un
 * confort, la production est le service. Le script sort toujours en succès.
 */
import { spawnSync } from "node:child_process";

const demo = process.env.DEMO_DATABASE_URL;

if (!demo) {
  console.log("[migrations-demo] DEMO_DATABASE_URL absente : rien à faire.");
  process.exit(0);
}
if (demo === process.env.DATABASE_URL) {
  console.error("[migrations-demo] DEMO_DATABASE_URL identique à DATABASE_URL : migration ignorée (ces bases doivent rester distinctes).");
  process.exit(0);
}

console.log("[migrations-demo] Application des migrations à la base de démonstration…");
const res = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: demo },
  shell: process.platform === "win32",
});

if (res.status === 0) console.log("[migrations-demo] Base de démonstration à jour.");
else console.error(`[migrations-demo] Échec (code ${res.status ?? "inconnu"}). Le démarrage continue ; seul l'environnement de démonstration peut être affecté.`);

process.exit(0); // jamais bloquant

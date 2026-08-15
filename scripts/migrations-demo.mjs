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

/*
 * DEMO_DATABASE_URL est la connexion de l'APPLICATION à la base de
 * démonstration : depuis la séparation des rôles, elle n'a plus le droit de
 * modifier une table. Migrer avec elle échouerait. On prend donc la connexion
 * d'administration quand elle existe, avec le même repli qu'ailleurs — sans
 * quoi ce script casserait sur un environnement où la variable n'a pas encore
 * été créée.
 */
const demo = process.env.MIGRATE_DEMO_DATABASE_URL ?? process.env.DEMO_DATABASE_URL;

if (!demo) {
  console.log("[migrations-demo] DEMO_DATABASE_URL absente : rien à faire.");
  process.exit(0);
}
// La comparaison porte sur les deux connexions APPLICATIVES : ce sont elles
// qui doivent désigner des bases distinctes.
if (process.env.DEMO_DATABASE_URL === process.env.DATABASE_URL) {
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

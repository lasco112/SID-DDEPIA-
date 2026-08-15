/**
 * Exécute une commande Prisma Migrate avec la connexion d'ADMINISTRATION.
 *
 * L'application se connecte avec `sid_app`, qui n'a le droit ni de créer ni de
 * modifier une table — c'est précisément ce qui la rend soumise aux politiques
 * de sécurité par ligne. Les migrations, elles, ont besoin de ces droits.
 *
 * Repli délibéré : si MIGRATE_DATABASE_URL n'est pas renseignée, on retombe sur
 * DATABASE_URL, c'est-à-dire exactement le comportement d'avant ce lot. Sans ce
 * repli, déployer ce code sur un environnement où la variable n'a pas encore
 * été créée ferait échouer `migrate deploy` — et une migration qui échoue au
 * démarrage EMPÊCHE le conteneur de démarrer. L'application resterait éteinte
 * pour les six arrondissements, le temps qu'on s'en aperçoive.
 *
 *   node scripts/migrer.mjs deploy   (démarrage en production)
 *   node scripts/migrer.mjs dev --name mon_changement
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const sousCommande = args[0] ?? "deploy";

const admin = process.env.MIGRATE_DATABASE_URL;
const parDefaut = process.env.DATABASE_URL;

if (!admin && !parDefaut) {
  console.error("Ni MIGRATE_DATABASE_URL ni DATABASE_URL : impossible de migrer.");
  process.exit(1);
}
if (!admin) {
  console.warn(
    "MIGRATE_DATABASE_URL absente : migration avec DATABASE_URL. " +
      "C'est le comportement d'avant la séparation des rôles, pas une erreur — " +
      "mais le rôle applicatif ne devrait pas avoir les droits de migration."
  );
}

/*
 * `shell: true` sous Windows : `npx` y est un fichier .cmd, que spawnSync ne
 * sait pas exécuter directement. Sans cette option, la commande échouait en
 * silence — code de sortie 1, pas une ligne de sortie, aucune indication de la
 * cause. Une migration qui échoue sans rien dire au démarrage d'un conteneur
 * est exactement ce qu'on ne veut pas.
 */
const r = spawnSync("npx", ["prisma", "migrate", ...args], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: admin ?? parDefaut },
});

if (r.error) {
  console.error(`Impossible de lancer Prisma Migrate : ${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);

/**
 * Crée le rôle PostgreSQL avec lequel l'APPLICATION se connecte.
 *
 * Pourquoi ce lot existe
 * ----------------------
 * Jusqu'ici l'application se connectait en `postgres`, superutilisateur, avec
 * l'attribut `rolbypassrls`. Conséquence : toute politique de sécurité par
 * ligne (RLS) écrite sur ces tables serait IGNORÉE, sans message, sans erreur.
 * On croirait le cloisonnement en place alors qu'il ne le serait pas. Tant que
 * la base ne sert qu'un département, cela ne se voit pas ; le jour où les huit
 * départements de l'Ouest la partagent, c'est la seule barrière qui compte.
 *
 * Le piège du propriétaire
 * ------------------------
 * Il ne suffit PAS de retirer BYPASSRLS. En PostgreSQL, le PROPRIÉTAIRE d'une
 * table échappe lui aussi à ses politiques, sauf si la table porte
 * `FORCE ROW LEVEL SECURITY`. Donner les tables au rôle applicatif
 * reproduirait donc le trou qu'on vient de boucher, sous une autre forme.
 *
 * D'où la séparation retenue : `postgres` reste propriétaire et exécute les
 * MIGRATIONS ; le rôle applicatif n'a que le droit de lire et d'écrire des
 * lignes. Il ne peut ni créer, ni modifier, ni supprimer une table — ce dont
 * l'application n'a jamais besoin en fonctionnement.
 *
 * Emploi
 * ------
 *   node --env-file=.env scripts/creer-role-applicatif.mjs <mot-de-passe>
 *   node --env-file=.env scripts/creer-role-applicatif.mjs --engendrer
 *
 * La connexion d'administration est lue dans ADMIN_DATABASE_URL, à défaut
 * MIGRATE_DATABASE_URL, à défaut DATABASE_URL. Le script est IDEMPOTENT : on
 * peut le relancer sans rien casser — et il FAUT le relancer après une
 * migration qui crée des tables, si celles-ci n'ont pas hérité des droits.
 */
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const ROLE = process.env.ROLE_APPLICATIF ?? "sid_app";

/**
 * `CREATE ROLE` est une commande utilitaire : PostgreSQL n'y accepte AUCUN
 * paramètre lié. Le mot de passe doit donc entrer dans le texte de la
 * commande. Plutôt que de bricoler un échappement — la faute classique —, on
 * impose une forme sans guillemet, sans antislash, sans espace : le problème
 * d'injection ne se pose alors pas.
 */
const FORME = /^[A-Za-z0-9_.~-]{16,128}$/;

const engendrer = () => randomBytes(32).toString("base64url").slice(0, 40);

const arg = process.argv[2];
const motDePasse = arg === "--engendrer" ? engendrer() : arg;

if (!motDePasse) {
  console.error(
    "Emploi :\n" +
      "  node --env-file=.env scripts/creer-role-applicatif.mjs <mot-de-passe>\n" +
      "  node --env-file=.env scripts/creer-role-applicatif.mjs --engendrer"
  );
  process.exit(1);
}
if (!FORME.test(motDePasse)) {
  console.error(
    "Mot de passe refusé. Attendu : 16 à 128 caractères, uniquement lettres, " +
      "chiffres, « _ . ~ - ». Utiliser --engendrer pour en obtenir un."
  );
  process.exit(1);
}

const url =
  process.env.ADMIN_DATABASE_URL ?? process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Aucune URL d'administration : ADMIN_DATABASE_URL, MIGRATE_DATABASE_URL ou DATABASE_URL.");
  process.exit(1);
}

const db = new PrismaClient({ datasources: { db: { url } } });

/** Un identifiant SQL, correctement échappé. */
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;

const [{ d: base, u: moi, superutilisateur }] = await db.$queryRawUnsafe(
  `SELECT current_database() AS d, current_user AS u,
          (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superutilisateur`
);
console.log(`Base « ${base} », connecté en « ${moi} ».`);
if (!superutilisateur) {
  console.error(
    `« ${moi} » n'est pas superutilisateur : il ne peut pas créer de rôle. ` +
      `Renseigner ADMIN_DATABASE_URL avec une connexion d'administration.`
  );
  process.exit(1);
}

const dejaLa =
  (await db.$queryRawUnsafe(`SELECT 1 FROM pg_roles WHERE rolname = '${ROLE.replace(/'/g, "''")}'`)).length > 0;

const attributs = `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${motDePasse}'`;
if (dejaLa) {
  // Ne PAS recréer : le rôle porte déjà des droits, et peut avoir des
  // connexions ouvertes. On réaffirme ses attributs, rien de plus.
  await db.$executeRawUnsafe(`ALTER ROLE ${ident(ROLE)} WITH ${attributs}`);
  console.log(`Rôle « ${ROLE} » : existait déjà, attributs et mot de passe réaffirmés.`);
} else {
  await db.$executeRawUnsafe(`CREATE ROLE ${ident(ROLE)} WITH ${attributs}`);
  console.log(`Rôle « ${ROLE} » créé.`);
}

// --- Droits ----------------------------------------------------------------
// USAGE sur le schéma, mais PAS CREATE : le rôle applicatif ne crée aucun objet.
for (const ordre of [
  `GRANT CONNECT ON DATABASE ${ident(base)} TO ${ident(ROLE)}`,
  `GRANT USAGE ON SCHEMA public TO ${ident(ROLE)}`,
  `REVOKE CREATE ON SCHEMA public FROM ${ident(ROLE)}`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ident(ROLE)}`,
  // Les identifiants sont des cuid côté Prisma, mais PostGIS et d'éventuelles
  // colonnes série s'appuient sur des séquences.
  `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident(ROLE)}`,
  // PostGIS expose ses fonctions dans public : sans EXECUTE, toute requête
  // géométrique échouerait.
  `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${ident(ROLE)}`,
  // Et pour les tables que les MIGRATIONS FUTURES créeront, sans quoi il
  // faudrait relancer ce script après chaque déploiement.
  `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(moi)} IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ident(ROLE)}`,
  `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(moi)} IN SCHEMA public
     GRANT USAGE, SELECT ON SEQUENCES TO ${ident(ROLE)}`,
  `ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(moi)} IN SCHEMA public
     GRANT EXECUTE ON FUNCTIONS TO ${ident(ROLE)}`,
]) {
  await db.$executeRawUnsafe(ordre);
}
console.log("Droits accordés : lecture et écriture des lignes, rien de plus.");

// --- Contrôle --------------------------------------------------------------
const [ctrl] = await db.$queryRawUnsafe(
  `SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
     FROM pg_roles WHERE rolname = '${ROLE.replace(/'/g, "''")}'`
);
const fautes = Object.entries(ctrl).filter(([, v]) => v === true).map(([k]) => k);
if (fautes.length) {
  console.error(`FAUTE : « ${ROLE} » porte encore ${fautes.join(", ")}.`);
  process.exit(1);
}

const [{ n: possedees }] = await db.$queryRawUnsafe(
  `SELECT count(*)::int AS n FROM pg_tables
    WHERE schemaname = 'public' AND tableowner = '${ROLE.replace(/'/g, "''")}'`
);
if (possedees > 0) {
  console.error(
    `FAUTE : « ${ROLE} » possède ${possedees} table(s). Un propriétaire échappe aux ` +
      `politiques RLS : le rôle applicatif ne doit posséder aucune table.`
  );
  process.exit(1);
}

console.log(
  `\nContrôlé : ni superutilisateur, ni BYPASSRLS, ni création de base ou de rôle, ` +
    `et propriétaire d'aucune table.`
);
if (arg === "--engendrer") {
  console.log(`\nMot de passe engendré (à recopier dans DATABASE_URL) :\n  ${motDePasse}`);
}

await db.$disconnect();

/**
 * SAUVETAGE — copie complète de la base de production sur cette machine.
 *
 * À lancer dès qu'on dispose de la chaîne de connexion PUBLIQUE de la base
 * (celle qui contient un hôte joignable depuis l'extérieur, pas
 * « …railway.internal », qui n'est joignable que de l'intérieur de Railway).
 *
 * Emploi :
 *   1. Écrire la chaîne dans un fichier, HORS du dépôt :
 *        C:\Users\ThinkPad\sauvegarde-sid.txt
 *      (une seule ligne, rien d'autre)
 *   2. node scripts/sauver-production.mjs
 *
 * Pourquoi un fichier plutôt qu'une variable collée dans un terminal : elle ne
 * reste pas dans l'historique du shell, et le fichier est hors du dépôt, donc
 * hors de tout risque de commit.
 *
 * Le script ne modifie RIEN sur la production : `pg_dump` lit, il n'écrit pas.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const FICHIER_URL = process.env.SID_URL_FICHIER || path.join(os.homedir(), "sauvegarde-sid.txt");
const PG_DUMP = process.env.PG_DUMP_PATH || "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe";

function sortir(message, code = 1) {
  console.error(`\n  ${message}\n`);
  process.exit(code);
}

if (!fs.existsSync(PG_DUMP)) {
  sortir(`pg_dump introuvable : ${PG_DUMP}\n  Indiquer son chemin avec PG_DUMP_PATH.`);
}
if (!fs.existsSync(FICHIER_URL)) {
  sortir(
    `Fichier de connexion absent : ${FICHIER_URL}\n` +
      "  Y écrire la chaîne de connexion PUBLIQUE de la base de production,\n" +
      "  sur une seule ligne. Rien d'autre dans le fichier."
  );
}

const url = fs.readFileSync(FICHIER_URL, "utf8").trim();
if (!url.startsWith("postgres")) {
  sortir("Le fichier ne contient pas une chaîne « postgres://… » ou « postgresql://… ».");
}
if (url.includes(".railway.internal")) {
  sortir(
    "Cette chaîne est l'adresse INTERNE de Railway : elle n'est joignable que depuis\n" +
      "  l'intérieur de leur réseau, pas depuis cette machine.\n" +
      "  Dans Railway : service Postgres → onglet Variables → prendre DATABASE_PUBLIC_URL\n" +
      "  (ou l'adresse contenant « proxy.rlwy.net » / « rlwy.net »)."
  );
}

// Le nom du fichier porte la date : on ne veut jamais écraser une sauvegarde.
const horodatage = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dossier = path.join(os.homedir(), "sauvegardes-sid");
fs.mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, `sid_production_${horodatage}.sql`);

// On n'affiche JAMAIS l'URL : elle porte le mot de passe.
const hote = (() => {
  try {
    return new URL(url).host.replace(/:.*/, "");
  } catch {
    return "(hôte illisible)";
  }
})();

console.log(`\n  Sauvegarde de la base de production`);
console.log(`  serveur : ${hote}`);
console.log(`  vers    : ${sortie}`);
console.log(`\n  Cela peut prendre plusieurs minutes. Ne fermez pas cette fenêtre.\n`);

/*
 * `--no-owner` et `--no-acl` : la copie doit pouvoir être restaurée chez un
 * AUTRE hébergeur, où les rôles PostgreSQL ne portent pas les mêmes noms. Sans
 * cela, la restauration échouerait sur des propriétaires inexistants.
 */
const args = ["--no-owner", "--no-acl", "--format=plain", "--file", sortie, url];

const debut = Date.now();
const proc = spawn(PG_DUMP, args, { stdio: ["ignore", "inherit", "pipe"] });

let erreurs = "";
proc.stderr.on("data", (d) => {
  const texte = String(d);
  erreurs += texte;
  // On relaie sans jamais réafficher l'URL si elle apparaissait dans un message.
  process.stderr.write(texte.split(url).join("«connexion»"));
});

proc.on("close", (code) => {
  const secondes = Math.round((Date.now() - debut) / 1000);
  if (code !== 0) {
    console.error(`\n  ÉCHEC (code ${code}) après ${secondes} s.`);
    if (/password|authentification|authentication/i.test(erreurs)) {
      console.error("  → La chaîne de connexion semble refusée : mot de passe ou hôte incorrect.");
    } else if (/timeout|could not connect|n'a pas pu se connecter/i.test(erreurs)) {
      console.error("  → Serveur injoignable : la base est peut-être arrêtée par l'hébergeur.");
    }
    process.exit(1);
  }

  const taille = fs.statSync(sortie).size;
  if (taille < 1024) {
    console.error(`\n  ATTENTION : le fichier ne fait que ${taille} octets. La copie est probablement vide.`);
    process.exit(1);
  }

  const contenu = fs.readFileSync(sortie, "utf8");
  const tables = (contenu.match(/^CREATE TABLE /gm) || []).length;
  const copies = (contenu.match(/^COPY /gm) || []).length;

  console.log(`\n  ✔ Sauvegarde terminée en ${secondes} s`);
  console.log(`    fichier : ${sortie}`);
  console.log(`    taille  : ${(taille / 1024 / 1024).toFixed(1)} Mo`);
  console.log(`    contenu : ${tables} tables, ${copies} blocs de données`);
  console.log(`\n  METTEZ CE FICHIER EN LIEU SÛR — clé USB, disque externe, deuxième machine.`);
  console.log(`  Tant qu'il n'existe qu'ici, il n'existe qu'à un seul endroit.\n`);
});

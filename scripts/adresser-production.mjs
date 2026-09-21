/**
 * Remplace l'hôte interne de Railway par l'adresse publique du proxy TCP.
 *
 * La chaîne de connexion de l'application pointe vers `postgis.railway.internal`,
 * qui n'existe que dans le réseau de Railway. Le proxy TCP donne une adresse
 * joignable de l'extérieur ; seul l'hôte et le port changent, le reste — nom
 * d'utilisateur, mot de passe, nom de la base — est identique.
 *
 * Ce script fait la substitution SANS jamais afficher le mot de passe, et
 * conserve l'original à côté au cas où.
 *
 *   node scripts/adresser-production.mjs <hote-du-proxy> <port>
 *
 * Exemple :
 *   node scripts/adresser-production.mjs monorail.proxy.rlwy.net 41234
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const FICHIER = process.env.SID_URL_FICHIER || path.join(os.homedir(), "sauvegarde-sid.txt");
const [hote, port] = process.argv.slice(2);

function sortir(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!hote || !port) {
  sortir(
    "Emploi : node scripts/adresser-production.mjs <hote-du-proxy> <port>\n" +
      "  Ces deux valeurs viennent de : postgis → Settings → Networking → TCP Proxy."
  );
}
if (!/^\d+$/.test(port)) sortir(`Le port doit être un nombre, reçu « ${port} ».`);
if (!fs.existsSync(FICHIER)) sortir(`Fichier introuvable : ${FICHIER}`);

const original = fs.readFileSync(FICHIER, "utf8").trim();
if (!original.startsWith("postgres")) {
  sortir("Le fichier ne contient pas une chaîne « postgres://… » ou « postgresql://… ».");
}

let url;
try {
  url = new URL(original);
} catch {
  sortir("La chaîne de connexion est illisible. Vérifiez qu'elle a été collée en entier, sur une seule ligne.");
}

const ancienHote = url.hostname;
const ancienPort = url.port || "5432";
const base = url.pathname.replace(/^\//, "") || "(non précisée)";

url.hostname = hote;
url.port = port;

// L'original est conservé : si le proxy change d'adresse, on repart de la source.
const sauvegardeOriginal = FICHIER.replace(/\.txt$/, "") + ".origine.txt";
if (!fs.existsSync(sauvegardeOriginal)) fs.writeFileSync(sauvegardeOriginal, original + "\n");

fs.writeFileSync(FICHIER, url.toString() + "\n");

// On n'affiche que ce qui n'est pas secret.
console.log(`\n  Adresse mise à jour`);
console.log(`    avant : ${ancienHote}:${ancienPort}`);
console.log(`    après : ${hote}:${port}`);
console.log(`    base  : ${base}`);
console.log(`    utilisateur : ${url.username || "(non précisé)"}`);
console.log(`    mot de passe : ${url.password ? "présent" : "ABSENT — la connexion échouera"}`);
console.log(`\n  Original conservé dans : ${sauvegardeOriginal}`);
console.log(`\n  Étape suivante, une fois « postgis » redémarré :`);
console.log(`    node scripts/sauver-production.mjs\n`);

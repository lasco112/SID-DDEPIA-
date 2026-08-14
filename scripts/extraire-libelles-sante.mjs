/**
 * Extrait du canevas régional les listes de libellés de la quatrième partie —
 * santé animale, inspection et contrôle sanitaire — et les écrit en TypeScript.
 *
 * Ces listes vont jusqu'à cinquante-neuf entrées : les retaper à la main serait
 * garantir une faute. On les extrait, on ne les recopie pas.
 */
import PizZip from "pizzip";
import { readFileSync, writeFileSync } from "node:fs";

const texteDe = (f) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

const xml = new PizZip(readFileSync("docs/canevas/CANEVAS_REGIONAL_DREPIA-OUEST_S1-2026.docx"))
  .file("word/document.xml").asText();
const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
const tbls = [...corps.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((m) => m[0]);

const lit = (s) => JSON.stringify(s);

/** Territoires et totaux : ils relèvent de l'adaptation, pas du contenu. */
const cle = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const TERRITOIRE = new Set([
  "bamboutos", "btos", "hautnkam", "hautsplateaux", "hautplateaux", "hautspltx", "hautpltx",
  "koungkhi", "menoua", "mifi", "nde", "noun", "departement", "departements", "ecart",
]);
const estTerritoire = (s) => { const k = cle(s); return !k || k.startsWith("total") || TERRITOIRE.has(k); };

/** Les tableaux de la quatrième partie, repérés par leur position dans le corps. */
const CIBLES = [
  { index: 114, nom: "VACCINATION_AFFECTIONS", quoi: "colonnes" },
  { index: 116, nom: "SEMAINES_EPIDEMIOLOGIQUES", quoi: "lignes" },
  { index: 118, nom: "ESPECES_CONSULTATIONS", quoi: "colonnes" },
  { index: 119, nom: "ESPECES_DEPARASITAGES", quoi: "colonnes" },
  { index: 120, nom: "ESPECES_CASTRATIONS", quoi: "colonnes" },
  { index: 121, nom: "AFFECTIONS_RECURRENTES", quoi: "lignes" },
  { index: 124, nom: "ESPECES_ABATTAGES_INSPECTION", quoi: "colonnes" },
  { index: 125, nom: "LESIONS_DECELEES", quoi: "lignes" },
  { index: 126, nom: "PRODUITS_SAISIS", quoi: "lignes" },
  { index: 127, nom: "PRODUITS_INSPECTES_MARCHES", quoi: "lignes" },
];

const L = [];
L.push("/**");
L.push(" * Libellés de la quatrième partie du canevas RÉGIONAL — santé animale,");
L.push(" * inspection et contrôle sanitaire.");
L.push(" *");
L.push(" * EXTRAITS AUTOMATIQUEMENT du .docx de la DREPIA-Ouest par");
L.push(" * scripts/extraire-libelles-sante.mjs, et non retapés : certaines de ces");
L.push(" * listes comptent près de soixante entrées, où la moindre faute de frappe");
L.push(" * passerait inaperçue.");
L.push(" *");
L.push(" * Les noms de départements et les lignes de total en sont exclus : ils");
L.push(" * relèvent de l'adaptation départementale, pas du contenu du canevas.");
L.push(" */");
L.push("");

for (const c of CIBLES) {
  const tb = tbls[c.index - 1];
  if (!tb) { console.error(`tableau #${c.index} introuvable`); continue; }
  const trs = [...tb.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  const cel = (tr) => [...tr.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((x) => texteDe(x[0]));

  const valeurs = c.quoi === "colonnes"
    ? cel(trs[0]).filter((x) => x && !estTerritoire(x))
    : trs.slice(1).map((tr) => cel(tr)[0] ?? "").filter((x) => x && !estTerritoire(x));

  L.push(`/** ${valeurs.length} entrées, tableau régional #${c.index}. */`);
  L.push(`export const ${c.nom}: string[] = [`);
  for (const v of valeurs) L.push(`  ${lit(v)},`);
  L.push(`];`);
  L.push("");
  console.log(`${c.nom} : ${valeurs.length} entrées`);
}

writeFileSync("src/server/trimestre/canevas/libellesSanteAnimale.ts", L.join("\n"), "utf8");
console.log("\n-> src/server/trimestre/canevas/libellesSanteAnimale.ts");

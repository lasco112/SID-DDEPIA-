/**
 * Référence complète du canevas RÉGIONAL — celui qui fait foi.
 *
 * Le canevas de la DREPIA-Ouest porte 72 tableaux numérotés, exactement le
 * nombre du référentiel `referentiel_tableaux_v1.json` : les deux décrivent le
 * même document. Le canevas départemental en est une adaptation.
 *
 * Le document contient chaque légende DEUX fois — une dans la table des
 * illustrations, une dans le corps. Seule compte celle du corps, reconnaissable
 * à ce qu'un tableau la suit immédiatement.
 *
 *   node scripts/reference-canevas-regional.mjs <docx> <sortie.md>
 */
import PizZip from "pizzip";
import { readFileSync, writeFileSync } from "node:fs";

const texteDe = (f) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

const nettoyer = (t) =>
  t.replace(/SEQ\s+\w+\s+\\\*\s+ARABIC/gi, "")
   .replace(/PAGEREF\s+\S+\s+\\h/gi, "")
   .replace(/TOC\s+\\[^\n]*/gi, "")
   .replace(/\s+/g, " ").trim();

const zip = new PizZip(readFileSync(process.argv[2]));
const xml = zip.file("word/document.xml").asText();
const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));

/** Parcourt le corps dans l'ordre : titres, légendes, tableaux. */
const blocs = [];
let i = 0;
while (i < corps.length) {
  const cands = ["<w:p ", "<w:p>"].map((s) => corps.indexOf(s, i)).filter((x) => x >= 0);
  const dP = cands.length ? Math.min(...cands) : -1;
  const dT = corps.indexOf("<w:tbl>", i);

  if (dT >= 0 && (dP < 0 || dT < dP)) {
    let prof = 0, j = dT;
    while (j < corps.length) {
      const o = corps.indexOf("<w:tbl>", j), f = corps.indexOf("</w:tbl>", j);
      if (f < 0) break;
      if (o >= 0 && o < f) { prof++; j = o + 7; } else { prof--; j = f + 8; if (prof === 0) break; }
    }
    const tbl = corps.slice(dT, j);
    const trs = [...tbl.slice(7, -8).matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)]
      .map((m) => m[0]).filter((t) => !t.includes("<w:tbl>"));
    const cel = (tr) => [...tr.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => texteDe(c[0]));
    blocs.push({
      type: "tableau",
      entetes: trs.length ? cel(trs[0]) : [],
      lignes: trs.slice(1).map((tr) => cel(tr)[0] ?? "").filter(Boolean),
      nbLignes: Math.max(0, trs.length - 1),
    });
    i = j;
  } else if (dP >= 0) {
    const fin = corps.indexOf("</w:p>", dP);
    if (fin < 0) break;
    const frag = corps.slice(dP, fin + 6);
    const t = nettoyer(texteDe(frag));
    const style = /<w:pStyle w:val="([^"]+)"/.exec(frag)?.[1] ?? "";
    if (t) blocs.push({ type: "paragraphe", texte: t, style });
    i = fin + 6;
  } else break;
}

/**
 * Une légende ne compte que si un tableau la suit dans les deux blocs qui
 * viennent après : sinon c'est l'entrée de la table des illustrations.
 */
const L = [];
L.push("# Canevas RÉGIONAL — DREPIA-Ouest, premier semestre 2026");
L.push("");
L.push("**Ce document fait foi.** Le canevas départemental en est une adaptation ;");
L.push("là où les deux divergent, c'est celui-ci qui a raison — sauf sur ce qui");
L.push("relève légitimement de l'adaptation :");
L.push("");
L.push("| Régional | Départemental |");
L.push("|---|---|");
L.push("| `Départements` | `Arrondissement` |");
L.push("| les huit départements de l'Ouest | les six arrondissements |");
L.push("| semestriel — `TOTAL 1er S1 2026` | trimestriel — `TOTAL T1 2026` |");
L.push("");
L.push("Extrait automatiquement, sans interprétation, par");
L.push("`scripts/reference-canevas-regional.mjs`.");
L.push("");
L.push("---");
L.push("");

let sectionCourante = "";
let trouves = 0;
const numerosVus = new Set();

for (let k = 0; k < blocs.length; k++) {
  const b = blocs[k];
  if (b.type !== "paragraphe") continue;

  // Titres de section
  if (/^(Titre|Heading)[1-4]?$/i.test(b.style) && !/^Tableau n°/.test(b.texte)) {
    if (b.texte !== sectionCourante && b.texte.length < 120) {
      sectionCourante = b.texte;
      L.push(`\n## ${b.texte}\n`);
    }
    continue;
  }

  const m = /^Tableau n°\s*(\d+)\s*[:.]?\s*(.*)$/.exec(b.texte);
  if (!m) continue;

  /**
   * Le tableau doit suivre la légende de près. La fenêtre est de six blocs :
   * certaines légendes sont séparées de leur tableau par une ligne vide, une
   * note ou un graphique. Au-delà, on considère qu'il s'agit de l'entrée de la
   * table des illustrations, qui n'est suivie d'aucun tableau.
   */
  let suivant = null;
  for (let d = 1; d <= 6 && k + d < blocs.length; d++) {
    const b2 = blocs[k + d];
    if (b2.type === "tableau") { suivant = b2; break; }
    // Une autre légende avant le tableau : celle-ci n'a pas le sien.
    if (b2.type === "paragraphe" && /^Tableau n°\s*\d+/.test(b2.texte)) break;
  }
  if (!suivant) continue;

  const numero = Number(m[1]);
  if (numerosVus.has(numero)) continue;
  numerosVus.add(numero);
  trouves++;

  L.push(`### Tableau n° ${numero} — ${m[2] || "(sans intitulé)"}`);
  L.push("");
  L.push(`\`${suivant.entetes.length} colonnes · ${suivant.nbLignes} lignes\``);
  L.push("");
  L.push("| " + suivant.entetes.map((e) => e || "·").join(" | ") + " |");
  L.push("|" + suivant.entetes.map(() => "---").join("|") + "|");
  L.push("");
  if (suivant.lignes.length) {
    L.push(`**Libellés de ligne (${suivant.lignes.length}) :**`);
    L.push("");
    for (const l of suivant.lignes) L.push(`- ${l}`);
  } else {
    L.push("_Lignes libres._");
  }
  L.push("");
}

L.push("\n---\n");
L.push(`**${trouves} tableaux numérotés** retrouvés dans le corps du document.`);
L.push("");

writeFileSync(process.argv[3], L.join("\n"), "utf8");
console.log(`${trouves} tableaux -> ${process.argv[3]}`);

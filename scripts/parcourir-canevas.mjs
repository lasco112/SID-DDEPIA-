/**
 * Déroule le canevas officiel DANS L'ORDRE : titres, zones de texte, tableaux.
 *
 * Sert à décrire une section à la fois. `docs/CANEVAS_TRIMESTRIEL.md` donne le
 * détail de chaque tableau ; ce script donne l'ENCHAÎNEMENT, c'est-à-dire où se
 * placent les titres et les zones de texte entre les tableaux — ce qu'une liste
 * de tableaux ne montre pas.
 *
 *   node scripts/parcourir-canevas.mjs <docx> <du-tableau> <au-tableau>
 */
import PizZip from "pizzip";
import { readFileSync } from "node:fs";

const zip = new PizZip(readFileSync(process.argv[2]));
const xml = zip.file("word/document.xml").asText();
const depuis = Number(process.argv[3] ?? 1);
const jusqua = Number(process.argv[4] ?? 999);

const texteDe = (f) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

/** Retire les codes de champ Word des titres (SEQ, TOC, PAGEREF…). */
const nettoyer = (t) =>
  t.replace(/SEQ\s+\w+\s+\\\*\s+ARABIC/gi, "")
   .replace(/TOC\s+\\[^"]*("[^"]*")?[^\\]*\\?\w*/gi, "")
   .replace(/PAGEREF\s+\S+\s+\\h/gi, "")
   .replace(/\s+/g, " ").trim();

const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
let i = 0;
let n = 0;

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
    n++;
    if (n >= depuis && n <= jusqua) {
      const tbl = corps.slice(dT, j);
      const trs = [...tbl.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map((m) => m[0]).filter((t) => !t.includes("<w:tbl>"));
      const cellules = (tr) => [...tr.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => texteDe(c[0]) || "·");
      const entete = trs.length ? cellules(trs[0]) : [];
      console.log(`\n[TABLEAU #${n}]  ${entete.length} colonnes · ${trs.length - 1} lignes`);
      console.log(`   EN-TÊTE : ${entete.join(" | ")}`);
      const libelles = trs.slice(1).map((tr) => cellules(tr)[0]).filter((x) => x && x !== "·");
      if (libelles.length) console.log(`   LIGNES  : ${libelles.join(" / ")}`);
    }
    i = j;
  } else if (dP >= 0) {
    const fin = corps.indexOf("</w:p>", dP);
    if (fin < 0) break;
    const frag = corps.slice(dP, fin + 6);
    const t = nettoyer(texteDe(frag));
    const style = /<w:pStyle w:val="([^"]+)"/.exec(frag)?.[1] ?? "";
    if (t && n >= depuis - 1 && n <= jusqua) {
      if (/^\[.*\]$/.test(t)) console.log(`  <ZONE TEXTE> ${t}`);
      else if (/^(Titre|Heading)/.test(style)) console.log(`\n<${style}> ${t}`);
      else if (/^Tableau n°/.test(t)) console.log(`  <légende> ${t}`);
      else console.log(`  <para> ${t.slice(0, 200)}`);
    }
    i = fin + 6;
  } else break;
}

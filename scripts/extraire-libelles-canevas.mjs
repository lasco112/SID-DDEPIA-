/**
 * Produit les littéraux TypeScript des en-têtes et libellés de ligne d'une
 * plage de tableaux du canevas.
 *
 * Retaper ces libellés à la main est le meilleur moyen de remplacer une
 * apostrophe typographique par une droite, ou d'écrire « Castré » là où le
 * canevas écrit « Castre ». On les extrait donc, on ne les recopie pas.
 */
import PizZip from "pizzip";
import { readFileSync } from "node:fs";

const zip = new PizZip(readFileSync(process.argv[2]));
const xml = zip.file("word/document.xml").asText();
const depuis = Number(process.argv[3]);
const jusqua = Number(process.argv[4]);

const texteDe = (f) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

/** Littéral TS entre guillemets doubles, échappant ce qui doit l'être. */
const lit = (s) => JSON.stringify(s);

const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
let i = 0, n = 0;

while (i < corps.length) {
  const d = corps.indexOf("<w:tbl>", i);
  if (d < 0) break;
  let prof = 0, j = d;
  while (j < corps.length) {
    const o = corps.indexOf("<w:tbl>", j), f = corps.indexOf("</w:tbl>", j);
    if (f < 0) break;
    if (o >= 0 && o < f) { prof++; j = o + 7; } else { prof--; j = f + 8; if (prof === 0) break; }
  }
  n++;
  if (n >= depuis && n <= jusqua) {
    const tbl = corps.slice(d, j);
    const trs = [...tbl.slice(7, -8).matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)]
      .map((m) => m[0]).filter((t) => !t.includes("<w:tbl>"));
    const cellules = (tr) => [...tr.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => texteDe(c[0]));
    const entetes = trs.length ? cellules(trs[0]) : [];
    const lignes = trs.slice(1).map((tr) => cellules(tr)[0] ?? "").filter(Boolean);

    console.log(`\n// ---- TABLEAU #${n} ----`);
    console.log(`entetes: [${entetes.map(lit).join(", ")}],`);
    console.log(`lignes: [`);
    for (const l of lignes) console.log(`  ${lit(l)},`);
    console.log(`],`);
  }
  i = j;
}

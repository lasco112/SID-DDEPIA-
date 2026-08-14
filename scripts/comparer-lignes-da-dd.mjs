/**
 * Montre, sur les tableaux concernés, ce que le rapport d'un DA porte et ce que
 * porte celui du DD. Sert à vérifier de l'œil ce que le test vérifie tout seul :
 * la ligne « DDEPIA » sort du rapport d'arrondissement, la ligne « DAEPIA »
 * reste.
 */
import PizZip from "pizzip";
import { readFileSync } from "node:fs";

const D = "storage/exports";
const lire = (f) => new PizZip(readFileSync(`${D}/${f}`)).file("word/document.xml").asText();

/** Première colonne de chaque ligne, plus l'en-tête, pour chaque tableau. */
function tableaux(xml) {
  const out = [];
  for (const t of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []) {
    const lignes = (t.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []).map((r) =>
      (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).map((c) =>
        c.replace(/<[^>]+>/g, "").replace(/&apos;/g, "’").replace(/\s+/g, " ").trim()
      )
    );
    if (lignes.length) out.push({ entete: lignes[0], premieres: lignes.slice(1).map((l) => l[0]) });
  }
  return out;
}

const dd = tableaux(lire("Rapport_T32026_DDEPIA-Menoua.docx"));
const da = tableaux(lire("Rapport_T32026_DAEPIA-Dschang.docx"));

for (let i = 0; i < Math.max(dd.length, da.length); i++) {
  const a = dd[i], b = da[i];
  if (!a || !b) continue;
  const enteteChange = a.entete.join("|") !== b.entete.join("|");
  const perdues = a.premieres.filter((l) => !b.premieres.includes(l));
  const colPerdues = a.entete.filter((c) => !b.entete.includes(c));
  // On ne montre que ce qui diffère AUTREMENT que par les arrondissements —
  // la réduction à une colonne territoriale est attendue partout.
  const interessant = perdues.length > 0 || (enteteChange && colPerdues.includes("DDEPIA"));
  if (!interessant) continue;
  console.log(`\nTableau ${i + 1}`);
  console.log(`  DD lignes : ${a.premieres.join(" · ")}`);
  console.log(`  DA lignes : ${b.premieres.join(" · ")}`);
  if (perdues.length) console.log(`  → retirées : ${perdues.join(", ")}`);
  if (colPerdues.length) console.log(`  → colonnes retirées : ${colPerdues.join(", ")}`);
}

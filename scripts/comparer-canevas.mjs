/**
 * Rapproche le canevas DÉPARTEMENTAL de sa source RÉGIONALE.
 *
 * Le canevas départemental de la Menoua a été dérivé du canevas semestriel de
 * la DREPIA-Ouest. L'adaptation a consisté, pour l'essentiel, à remplacer les
 * départements de la région par les arrondissements du département. Certaines
 * cellules ont échappé au remplacement, et des accents ont pu se perdre.
 *
 * Ce script apparie chaque tableau départemental au tableau régional dont les
 * libellés lui ressemblent le plus, et signale les différences. Il ne corrige
 * RIEN : il donne au Délégué de quoi décider ce qui est une adaptation voulue
 * et ce qui est une coquille.
 *
 *   node scripts/comparer-canevas.mjs <departemental.docx> <regional.docx>
 */
import PizZip from "pizzip";
import { readFileSync } from "node:fs";

const texteDe = (f) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

/** Tous les tableaux d'un document, avec en-tête et libellés de ligne. */
function tableauxDe(chemin) {
  const xml = new PizZip(readFileSync(chemin)).file("word/document.xml").asText();
  const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
  const sortie = [];
  let i = 0;
  while (i < corps.length) {
    const d = corps.indexOf("<w:tbl>", i);
    if (d < 0) break;
    let prof = 0, j = d;
    while (j < corps.length) {
      const o = corps.indexOf("<w:tbl>", j), f = corps.indexOf("</w:tbl>", j);
      if (f < 0) break;
      if (o >= 0 && o < f) { prof++; j = o + 7; } else { prof--; j = f + 8; if (prof === 0) break; }
    }
    const tbl = corps.slice(d, j);
    const trs = [...tbl.slice(7, -8).matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)]
      .map((m) => m[0]).filter((t) => !t.includes("<w:tbl>"));
    const cel = (tr) => [...tr.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map((c) => texteDe(c[0]));
    sortie.push({
      entetes: trs.length ? cel(trs[0]) : [],
      lignes: trs.slice(1).map((tr) => cel(tr)[0] ?? "").filter(Boolean),
    });
    i = j;
  }
  return sortie;
}

/** Forme comparable : sans accents, sans casse, sans ponctuation ni espaces. */
const cle = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "")
   .toLowerCase().replace(/[^a-z0-9]/g, "");

/** Libellés qui ne servent pas à l'appariement : territoires et totaux. */
const TERRITOIRES = new Set(
  ["dschang", "fokoue", "fongotongo", "nkongni", "penkamichel", "santchou",
   "bamboutos", "hautnkam", "hautsplateaux", "koungkhi", "menoua", "mifi", "nde", "noun",
   "total", "ecart", "arrondissement", "departement", "departements", "arrondissements"]
);
const significatifs = (t) =>
  [...t.entetes, ...t.lignes].map(cle).filter((k) => k && !TERRITOIRES.has(k) && !/^total/.test(k));

/** Proportion de libellés significatifs communs. */
function ressemblance(a, b) {
  const A = new Set(significatifs(a)), B = new Set(significatifs(b));
  if (A.size === 0 || B.size === 0) return 0;
  let communs = 0;
  for (const x of A) if (B.has(x)) communs++;
  return communs / Math.max(A.size, B.size);
}

const dept = tableauxDe(process.argv[2]);
const region = tableauxDe(process.argv[3]);

console.log(`Départemental : ${dept.length} tableaux`);
console.log(`Régional      : ${region.length} tableaux\n`);

let apparies = 0, sansOriginal = 0;
const signalements = [];

dept.forEach((d, i) => {
  let meilleur = null, score = 0;
  for (const r of region) {
    const s = ressemblance(d, r);
    if (s > score) { score = s; meilleur = r; }
  }
  if (!meilleur || score < 0.5) {
    sansOriginal++;
    return;
  }
  apparies++;

  // Différences de libellé à forme comparable identique : accents, casse,
  // espaces, ponctuation. C'est là que se logent les coquilles d'adaptation.
  const parCle = new Map();
  for (const l of [...meilleur.entetes, ...meilleur.lignes]) parCle.set(cle(l), l);
  for (const l of [...d.entetes, ...d.lignes]) {
    const k = cle(l);
    const original = parCle.get(k);
    if (original && original !== l) {
      signalements.push({ tableau: i + 1, departemental: l, regional: original });
    }
  }
});

console.log(`Appariés à un original régional : ${apparies}`);
console.log(`Sans original identifiable      : ${sansOriginal}\n`);

if (signalements.length === 0) {
  console.log("Aucun libellé ne diverge de son original régional par les accents, la casse ou l'espacement.");
} else {
  console.log(`${signalements.length} libellé(s) diffèrent de leur original régional :\n`);
  for (const s of signalements) {
    console.log(`  tableau #${s.tableau}`);
    console.log(`    départemental : « ${s.departemental} »`);
    console.log(`    régional      : « ${s.regional} »`);
  }
}

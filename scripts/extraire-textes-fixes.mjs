/**
 * Extrait, d'un rapport trimestriel réel, les textes qui ne changent pas d'une
 * période à l'autre.
 *
 * Ces textes — situation et relief, pédologie, démographie, missions, vision,
 * organisation administrative — sont retapés à chaque trimestre par le
 * Délégué. Le SID doit les reprendre tout seul.
 *
 * Le script repère les titres du canevas et ramasse les paragraphes qui les
 * suivent, jusqu'au titre suivant ou au premier tableau.
 *
 *   node scripts/extraire-textes-fixes.mjs <rapport.docx>
 */
import PizZip from "pizzip";
import { readFileSync } from "node:fs";

const texteDe = (f) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

/** Les rubriques cherchées, et la clé de zone de texte qui leur correspond. */
const RUBRIQUES = [
  { cle: "I.introduction", motif: /^INTRODUCTION$/i },
  { cle: "I.geo.relief", motif: /situation\s+et\s+relief/i },
  { cle: "I.geo.pedologie", motif: /p[ée]dologie/i },
  { cle: "I.geo.demographie", motif: /donn[ée]es\s+d[ée]mographiques/i },
  { cle: "I1.missions", motif: /^\s*[a-z]?\)?\s*missions?\s*$/i },
  { cle: "I1.vision", motif: /^\s*[a-z]?\)?\s*vision\s*$/i },
  { cle: "I1.organisation", motif: /organisation\s+administrative/i },
];

const xml = new PizZip(readFileSync(process.argv[2])).file("word/document.xml").asText();
const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));

/** Parcourt le corps dans l'ordre : paragraphes et tableaux. */
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
    blocs.push({ type: "tableau" });
    i = j;
  } else if (dP >= 0) {
    const fin = corps.indexOf("</w:p>", dP);
    if (fin < 0) break;
    const frag = corps.slice(dP, fin + 6);
    const style = /<w:pStyle w:val="([^"]+)"/.exec(frag)?.[1] ?? "";
    blocs.push({ type: "paragraphe", texte: texteDe(frag), style, titre: /^(Titre|Heading)/i.test(style) });
    i = fin + 6;
  } else break;
}

/**
 * Le rapport réel numérote ses sections en A-1, A-2, B-1… là où le canevas
 * régional emploie I-1, II-1. Les deux formes doivent arrêter le ramassage,
 * sans quoi le titre suivant se retrouve collé au texte de la rubrique.
 */
const estTitre = (b) =>
  b.type === "paragraphe" &&
  (b.titre ||
    /^[A-E][-.]\s?\d/.test(b.texte) ||           // A-1, A.5.1, B-2…
    /^(I|II|III|IV|V)[-.\s]/.test(b.texte) ||    // I-1, II-3…
    /^[a-z]\)\s/i.test(b.texte) ||               // a) b) c)
    /^(MISSIONS?|VISION|ORGANISATION|INTRODUCTION|CONCLUSION)\b/.test(b.texte) ||
    /^PROGRAMME\s+\d/.test(b.texte));

/**
 * Le document porte une table des matières qui reprend TOUS les titres. Ses
 * entrées se reconnaissent au champ PAGEREF qui les suit. Un titre n'est le
 * vrai que si les paragraphes qui le suivent n'en portent pas.
 */
function positionDuVraiTitre(motif) {
  for (let k = 0; k < blocs.length; k++) {
    const b = blocs[k];
    if (b.type !== "paragraphe" || !b.texte || b.texte.length >= 80) continue;
    if (!motif.test(b.texte)) continue;
    if (/PAGEREF/.test(b.texte)) continue;
    const suite = blocs.slice(k + 1, k + 4).map((x) => x.texte ?? "").join(" ");
    if (/PAGEREF/.test(suite)) continue; // entrée de sommaire
    return k;
  }
  return -1;
}

const trouves = [];
for (const r of RUBRIQUES) {
  const k = positionDuVraiTitre(r.motif);
  if (k < 0) { trouves.push({ ...r, texte: null }); continue; }

  const morceaux = [];
  for (let j = k + 1; j < blocs.length; j++) {
    const b = blocs[j];
    if (b.type === "tableau") break;
    if (estTitre(b)) break;
    if (b.texte) morceaux.push(b.texte);
    // Deux pages de texte suffisent : au-delà, on a débordé sur autre chose.
    if (morceaux.join(" ").length > 4000) break;
  }
  trouves.push({ ...r, texte: morceaux.join("\n\n").trim() || null });
}

const source = process.argv[2].split(/[\\/]/).pop();

for (const t of trouves) {
  console.log(`${t.cle.padEnd(22)} ${t.texte ? `${t.texte.length} caractères` : "ABSENT du rapport"}`);
}

// ---- Écriture du module TypeScript ----------------------------------------
if (process.argv.includes("--ecrire")) {
  const { writeFileSync } = await import("node:fs");
  const L = [];
  L.push("/**");
  L.push(" * Textes qui ne changent pas d'un trimestre à l'autre.");
  L.push(" *");
  L.push(` * EXTRAITS du rapport réel « ${source} » fourni par le Délégué, par`);
  L.push(" * scripts/extraire-textes-fixes.mjs. Ils étaient jusqu'ici retapés à chaque");
  L.push(" * période ; le SID les reprend désormais tout seul.");
  L.push(" *");
  L.push(" * DEUX RUBRIQUES DU CANEVAS SONT ABSENTES du rapport réel — pédologie et");
  L.push(" * données démographiques. Elles ne figurent qu'à son sommaire, avec la mention");
  L.push(" * « Erreur ! Signet non défini ». Leur zone reste donc vide, avec sa consigne.");
  L.push(" *");
  L.push(" * À TERME, ces textes ont vocation à être rangés en base pour que le Délégué");
  L.push(" * les modifie sans développeur. Ils sont ici en attendant, versionnés et");
  L.push(" * relisibles.");
  L.push(" */");
  L.push("");
  L.push("/** clé de zone de texte → texte validé par le Délégué */");
  L.push("export const TEXTES_FIXES = new Map<string, string>([");
  for (const t of trouves) {
    if (!t.texte) continue;
    L.push(`  [`);
    L.push(`    ${JSON.stringify(t.cle)},`);
    L.push(`    ${JSON.stringify(t.texte)},`);
    L.push(`  ],`);
  }
  L.push("]);");
  L.push("");
  writeFileSync("src/server/trimestre/canevas/textesFixes.ts", L.join("\n"), "utf8");
  console.log(`\n-> src/server/trimestre/canevas/textesFixes.ts (${trouves.filter((t) => t.texte).length} textes)`);
}

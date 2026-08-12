/**
 * Référence COMPLÈTE du canevas trimestriel officiel : les 81 tableaux, leur
 * titre exact, leurs en-têtes et TOUS leurs libellés de ligne.
 *
 * C'est le document contre lequel le générateur devra être vérifié, ligne à
 * ligne. Rien n'y est interprété ni simplifié : ce qui est écrit ici est ce qui
 * est écrit dans le .docx du Délégué.
 */
import PizZip from "pizzip";
import { readFileSync, writeFileSync } from "node:fs";

const zip = new PizZip(readFileSync(process.argv[2]));
const xml = zip.file("word/document.xml").asText();

const texteDe = (f) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

/** Retire les codes de champ Word (SEQ, TOC, REF…) des titres. */
const nettoyerTitre = (t) =>
  t.replace(/SEQ\s+\w+\s+\\\*\s+ARABIC/gi, "").replace(/TOC\s+\\\w+\s+"[^"]*"\s*\\\w*/gi, "")
   .replace(/\s+/g, " ").trim();

const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
const blocs = [];
let i = 0;
while (i < corps.length) {
  const cands = ["<w:p ", "<w:p>"].map((s) => corps.indexOf(s, i)).filter((x) => x >= 0);
  const debutP = cands.length ? Math.min(...cands) : -1;
  const debutT = corps.indexOf("<w:tbl>", i);

  if (debutT >= 0 && (debutP < 0 || debutT < debutP)) {
    let prof = 0, j = debutT;
    while (j < corps.length) {
      const o = corps.indexOf("<w:tbl>", j);
      const f = corps.indexOf("</w:tbl>", j);
      if (f < 0) break;
      if (o >= 0 && o < f) { prof++; j = o + 7; } else { prof--; j = f + 8; if (prof === 0) break; }
    }
    blocs.push({ type: "tableau", xml: corps.slice(debutT, j) });
    i = j;
  } else if (debutP >= 0) {
    const fin = corps.indexOf("</w:p>", debutP);
    if (fin < 0) break;
    const frag = corps.slice(debutP, fin + 6);
    const t = nettoyerTitre(texteDe(frag));
    const style = /<w:pStyle w:val="([^"]+)"/.exec(frag)?.[1] ?? "";
    if (t) blocs.push({ type: "paragraphe", texte: t, style });
    i = fin + 6;
  } else break;
}

function lignesDe(tblXml) {
  const dedans = tblXml.slice(7, -8);
  const lignes = [];
  const re = /<w:tr[ >][\s\S]*?<\/w:tr>/g;
  let m;
  while ((m = re.exec(dedans))) {
    if (m[0].includes("<w:tbl>")) continue;
    const cellules = [];
    const reC = /<w:tc>[\s\S]*?<\/w:tc>/g;
    let c;
    while ((c = reC.exec(m[0]))) {
      const tc = c[0];
      cellules.push({
        texte: texteDe(tc),
        span: Number(/<w:gridSpan w:val="(\d+)"/.exec(tc)?.[1] ?? 1),
        vfusion: /<w:vMerge(?![^>]*restart)/.test(tc),
      });
    }
    lignes.push(cellules);
  }
  return lignes;
}

const L = [];
L.push("# Canevas du rapport trimestriel — structure officielle");
L.push("");
L.push("Extrait **automatiquement** de `CANEVAS_RAPPORT_TRIMESTRIEL_DDEPIA-MENOUA_v1.docx`");
L.push("fourni par le Délégué Départemental. Rien n'y est interprété ni simplifié.");
L.push("");
L.push("**Ce document fait foi.** Le rapport produit par le SID doit lui être identique :");
L.push("mêmes tableaux, mêmes colonnes, mêmes libellés de ligne, dans le même ordre.");
L.push("Aucune colonne en plus, aucune en moins.");
L.push("");
L.push("---");
L.push("");

let n = 0;
let titreEnAttente = "";
let sectionEnCours = "";
const stats = {};

for (const b of blocs) {
  if (b.type === "paragraphe") {
    if (/^Tableau n°/i.test(b.texte)) titreEnAttente = b.texte;
    else if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)[-.\s]/.test(b.texte) && b.texte.length < 90) {
      sectionEnCours = b.texte;
      L.push(`\n## ${b.texte}\n`);
    }
    continue;
  }
  n++;
  const lignes = lignesDe(b.xml);
  const nbCol = lignes.length ? Math.max(...lignes.map((l) => l.reduce((s, c) => s + c.span, 0))) : 0;
  stats[nbCol] = (stats[nbCol] ?? 0) + 1;

  L.push(`### Tableau #${n} — ${titreEnAttente || "(sans titre)"}`);
  L.push("");
  L.push(`\`${nbCol} colonnes · ${lignes.length} lignes\`` + (sectionEnCours ? ` — section : ${sectionEnCours}` : ""));
  L.push("");

  const entete = lignes[0] ?? [];
  L.push("**En-tête :**");
  L.push("");
  L.push("| " + entete.map((c) => (c.texte || "·") + (c.span > 1 ? ` (fusion ×${c.span})` : "")).join(" | ") + " |");
  L.push("|" + entete.map(() => "---").join("|") + "|");

  // Deuxième ligne d'en-tête si le tableau en a une (colonnes fusionnées).
  if (lignes.length > 1 && entete.some((c) => c.span > 1)) {
    L.push("| " + (lignes[1] ?? []).map((c) => c.texte || "·").join(" | ") + " |");
  }
  L.push("");

  const premiereDonnee = entete.some((c) => c.span > 1) ? 2 : 1;
  const libelles = lignes.slice(premiereDonnee).map((l) => l[0]?.texte ?? "").filter(Boolean);
  if (libelles.length) {
    L.push(`**Libellés de ligne imposés (${libelles.length}) :**`);
    L.push("");
    for (const lib of libelles) L.push(`- ${lib}`);
    L.push("");
  } else {
    L.push("_Tableau à lignes libres : le nombre de lignes dépend des déclarations._");
    L.push("");
  }
  titreEnAttente = "";
}

L.push("\n---\n");
L.push("## Récapitulatif\n");
L.push(`**${n} tableaux.** Répartition par nombre de colonnes :\n`);
L.push("| Colonnes | Tableaux |");
L.push("|---|---|");
for (const [c, k] of Object.entries(stats).sort((a, b) => b[1] - a[1])) L.push(`| ${c} | ${k} |`);
L.push("");

writeFileSync(process.argv[3], L.join("\n"), "utf8");
console.log(`${n} tableaux -> ${process.argv[3]} (${L.length} lignes)`);

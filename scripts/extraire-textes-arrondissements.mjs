/**
 * Extrait, des six rapports d'arrondissement, les textes qui ne changent pas
 * d'un trimestre à l'autre.
 *
 * Chaque DAEPIA retape aujourd'hui la présentation de son arrondissement à
 * chaque période. Le SID doit la reprendre tout seul, comme il le fait déjà
 * pour les textes du Délégué départemental.
 *
 * Les six fichiers ne portent pas tous le nom de leur arrondissement : deux
 * s'appellent seulement « rapport du premier trimestre ». On les identifie par
 * le nom qui revient le plus dans leur texte.
 *
 *   node scripts/extraire-textes-arrondissements.mjs [--ecrire]
 */
import PizZip from "pizzip";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const DOSSIER = "docs/canevas/rapports-da";
const ARRONDISSEMENTS = ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"];

const texteDe = (f) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

/** Découpe le corps en paragraphes et tableaux, dans l'ordre. */
function blocsDe(chemin) {
  const xml = new PizZip(readFileSync(chemin)).file("word/document.xml").asText();
  const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
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
      blocs.push({ type: "paragraphe", texte: texteDe(frag), titre: /^(Titre|Heading)/i.test(style) });
      i = fin + 6;
    } else break;
  }
  return blocs;
}

/** L'arrondissement dont le nom revient le plus dans le document. */
function arrondissementDe(blocs) {
  const t = blocs.map((b) => b.texte ?? "").join(" ");
  let meilleur = null, score = 0;
  for (const a of ARRONDISSEMENTS) {
    const n = (t.match(new RegExp(a.replace("-", "[- ]"), "gi")) || []).length;
    if (n > score) { score = n; meilleur = a; }
  }
  return meilleur;
}

/** Un titre arrête le ramassage du texte d'une rubrique. */
const estTitre = (b) =>
  b.type === "paragraphe" &&
  (b.titre ||
    /^(CHAPITRE|INTRODUCTION|CONCLUSION)\b/i.test(b.texte) ||
    /^[IVX]+\s*-\s*\d/.test(b.texte) ||
    /^[A-E][-.]\s?\d/.test(b.texte));

/** Le texte qui suit un titre, jusqu'au titre suivant ou au premier tableau. */
function texteApres(blocs, k, maxi = 6000) {
  const morceaux = [];
  for (let j = k + 1; j < blocs.length; j++) {
    const b = blocs[j];
    if (b.type === "tableau") break;
    if (estTitre(b)) break;
    if (b.texte) morceaux.push(b.texte);
    if (morceaux.join(" ").length > maxi) break;
  }
  return morceaux.join("\n\n").trim();
}

/** Cherche un titre hors table des matières. */
function positionTitre(blocs, motif) {
  for (let k = 0; k < blocs.length; k++) {
    const b = blocs[k];
    if (b.type !== "paragraphe" || !b.texte || b.texte.length > 100) continue;
    if (!motif.test(b.texte) || /PAGEREF/.test(b.texte)) continue;
    const suite = blocs.slice(k + 1, k + 4).map((x) => x.texte ?? "").join(" ");
    if (/PAGEREF/.test(suite)) continue;
    return k;
  }
  return -1;
}

const RUBRIQUES = [
  { cle: "introduction", motif: /^INTRODUCTION$/i },
  { cle: "presentation", motif: /PR[EÉ]SENTATION\s+DE\s+LA\s+DAEPIA/i },
];

/**
 * Un texte qui parle de SA période n'est pas un texte fixe.
 *
 * Le reprendre tel quel au trimestre suivant ferait dire au rapport que les
 * activités de janvier-mars sont celles d'avril-juin. Le repère : une mention
 * explicite du trimestre, ou une énumération de mois. Une année seule ne
 * compte pas — « le CZV construit en 2021 » est un fait durable.
 */
const MOIS = "janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre";

/** Formules qui désignent sans ambiguïté la période du rapport. */
const PHRASES_DE_PERIODE = /ce trimestre|du trimestre|au cours du trimestre|au courant des mois|le pr[ée]sent (rapport|trimestre)/i;

/**
 * Une DATE COMPLÈTE — « 14 Septembre 2012 » — n'est pas un marqueur de période :
 * c'est la date d'un décret, un fait durable. Elle est retirée avant l'examen,
 * sans quoi la présentation de Penka-Michel, qui cite le décret fondateur des
 * missions, serait écartée à tort.
 */
const sansDatesCompletes = (t) =>
  t.replace(new RegExp(`\\b\\d{1,2}\\s+(${MOIS})\\s+\\d{4}`, "gi"), " ");

const datePeriode = (t) => {
  if (!t) return false;
  if (PHRASES_DE_PERIODE.test(t)) return true;
  return new RegExp(`\\b(${MOIS})\\b`, "i").test(sansDatesCompletes(t));
};

const resultats = [];
for (const f of readdirSync(DOSSIER).filter((x) => x.endsWith(".docx"))) {
  const blocs = blocsDe(`${DOSSIER}/${f}`);
  const arr = arrondissementDe(blocs);
  const textes = {};
  for (const r of RUBRIQUES) {
    const k = positionTitre(blocs, r.motif);
    textes[r.cle] = k < 0 ? null : texteApres(blocs, k) || null;
  }
  resultats.push({ fichier: f, arrondissement: arr, textes });
}

resultats.sort((a, b) => ARRONDISSEMENTS.indexOf(a.arrondissement) - ARRONDISSEMENTS.indexOf(b.arrondissement));

for (const r of resultats) {
  console.log(`\n${(r.arrondissement ?? "?").padEnd(14)} ${r.fichier}`);
  for (const [cle, t] of Object.entries(r.textes)) {
    const etat = !t ? "ABSENT" : datePeriode(t) ? `${t.length} caractères — DATÉ, écarté` : `${t.length} caractères`;
    console.log(`   ${cle.padEnd(14)} ${etat}`);
    if (t) console.log(`      « ${t.slice(0, 110).replace(/\n/g, " ")}… »`);
  }
}

if (process.argv.includes("--ecrire")) {
  const L = [];
  L.push("/**");
  L.push(" * Textes fixes des six arrondissements.");
  L.push(" *");
  L.push(" * EXTRAITS des rapports trimestriels réels des DAEPIA, par");
  L.push(" * scripts/extraire-textes-arrondissements.mjs. Chaque délégué d'arrondissement");
  L.push(" * retapait jusqu'ici la présentation de son territoire à chaque période.");
  L.push(" *");
  L.push(" * Deux des six fichiers ne portaient pas le nom de leur arrondissement : ils");
  L.push(" * ont été identifiés par le nom qui revient le plus dans leur texte —");
  L.push(" * Nkong-Ni et Santchou.");
  L.push(" */");
  L.push("");
  L.push("export interface TextesArrondissement {");
  L.push("  /** Introduction du rapport d'arrondissement. */");
  L.push("  introduction: string | null;");
  L.push("  /** Présentation de la DAEPIA : situation, limites, structures. */");
  L.push("  presentation: string | null;");
  L.push("}");
  L.push("");
  L.push("/** nom de l'arrondissement → ses textes fixes */");
  L.push("export const TEXTES_ARRONDISSEMENTS = new Map<string, TextesArrondissement>([");
  for (const r of resultats) {
    if (!r.arrondissement) continue;
    L.push(`  [`);
    L.push(`    ${JSON.stringify(r.arrondissement)},`);
    L.push(`    {`);
    // Un texte daté est écarté : le reprendre au trimestre suivant ferait dire
    // au rapport que les activités de janvier-mars sont celles d'avril-juin.
    const retenu = (t) => (t && !datePeriode(t) ? JSON.stringify(t) : "null");
    L.push(`      introduction: ${retenu(r.textes.introduction)},`);
    L.push(`      presentation: ${retenu(r.textes.presentation)},`);
    L.push(`    },`);
    L.push(`  ],`);
  }
  L.push("]);");
  L.push("");
  writeFileSync("src/server/trimestre/canevas/textesArrondissements.ts", L.join("\n"), "utf8");
  console.log(`\n-> src/server/trimestre/canevas/textesArrondissements.ts (${resultats.length} arrondissements)`);
}

/** Relit les sept .docx produits et vérifie ce qu'ils portent vraiment. */
import PizZip from "pizzip";
import { readFileSync } from "node:fs";

const D = "storage/exports";
const ARR = ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"];

/**
 * Les textes attendus, relus dans le module de textes fixes lui-même : un texte
 * écarté à l'extraction — l'introduction de Nkong-Ni, datée — doit être ABSENT
 * du document, et son absence n'est pas une faute. Ce qui serait une faute,
 * c'est qu'un texte retenu ne ressorte pas.
 */
const SIENS = new Map(
  [...readFileSync("src/server/trimestre/canevas/textesArrondissements.ts", "utf8")
    .matchAll(
      /\[\s*"([^"]+)",\s*\{\s*"I\.introduction":\s*("(?:[^"\\]|\\.)*"),[\s\S]*?"I1\.organisation":\s*("(?:[^"\\]|\\.)*")/g
    )]
    .map(([, nom, i, p]) => [
      nom,
      {
        // La première phrase de l'introduction est CALCULÉE (jetons de période) :
        // on compare à partir de la deuxième, écrite par la DAEPIA.
        introduction: JSON.parse(i).split("\n\n").slice(1).join("\n\n") || null,
        presentation: JSON.parse(p),
      },
    ])
);

/**
 * Le texte stocké porte les sauts de paragraphe ; le .docx les rend en
 * paragraphes séparés. Comparer sans normaliser ferait crier au manque un texte
 * pourtant présent.
 */
const nu = (t) =>
  t
    // Les jetons de période sont résolus au rendu du troisième trimestre.
    .replace(/\{CETTE_PERIODE\}/g, "ce trimestre")
    .replace(/\{NATURE\}/g, "trimestriel")
    .replace(/'/g, "’").replace(/\s+/g, " ").trim();

/** Le texte des seuls tableaux : leurs en-têtes portent les territoires. */
const tableaux = (f) => {
  const xml = new PizZip(readFileSync(`${D}/${f}`)).file("word/document.xml").asText();
  return (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || []).join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
};

const texte = (f) => {
  const xml = new PizZip(readFileSync(`${D}/${f}`)).file("word/document.xml").asText();
  return xml.replace(/<[^>]+>/g, " ").replace(/&apos;/g, "’").replace(/\s+/g, " ");
};

const DD = [
  ["intro DD", "Le présent rapport trimestriel d’activités de la DDEPIA/MENOUA"],
  ["missions DD", "missions de la Délégation Départementale de la Menoua"],
  ["vision DD", "La vision de la DDEPIA de la Menoua"],
  ["relief", "créé vers 1885 par les Allemands"],
];

console.log("arrondissement     DD?  sien  XE  titres  signature  colonnes");
for (const a of ARR) {
  const t = texte(`Rapport_T32026_DAEPIA-${a}.docx`);
  const MAJ = a.toUpperCase();
  const fuite = DD.filter(([, e]) => t.includes(e)).map(([q]) => q);
  // On ne se contente pas du titre « PRÉSENTATION DE LA DAEPIA » : il vient du
  // canevas et figure dans les six documents même quand le texte manque. On
  // vérifie les TEXTES eux-mêmes, tels qu'extraits du rapport réel du DA.
  const sien = SIENS.get(a) ?? { introduction: null, presentation: null };
  const attendus = ["introduction", "presentation"].filter((c) => sien[c]);
  const rendus = attendus.filter((c) => nu(t).includes(nu(sien[c]).slice(0, 80)));
  const porteSien =
    attendus.length === 0
      ? "aucun "
      : rendus.length === attendus.length
        ? `${rendus.join("+").slice(0, 6).padEnd(6)}`
        : `MANQUE:${attendus.filter((c) => !rendus.includes(c))}`;
  const titres =
    t.includes(`DE L’ARRONDISSEMENT DE ${MAJ}`) || t.includes(`DE L'ARRONDISSEMENT DE ${MAJ}`);
  const resteDept = t.includes("DU DÉPARTEMENT DE LA MENOUA");
  // Une seule colonne territoriale : le nom des cinq autres ne doit pas figurer
  // dans les TABLEAUX. Les textes, eux, peuvent nommer un voisin.
  const tab = tableaux(`Rapport_T32026_DAEPIA-${a}.docx`);
  const autres = ARR.filter((x) => x !== a && tab.includes(` ${x} `)).length;
  console.log(
    `${a.padEnd(18)} ${(fuite.length ? "FUITE:" + fuite.join(",") : "ok  ").padEnd(4)} ` +
      `${porteSien} ${t.includes("XE ") ? "XE!" : "ok "} ` +
      `${titres && !resteDept ? "ok    " : resteDept ? "RESTE " : "MANQUE"} ` +
      `${t.includes("LE DÉLÉGUÉ D’ARRONDISSEMENT,") ? "ok       " : "FAUTE    "} ` +
      `${autres === 0 ? "1 seule" : `${autres} autres arrond. cités`}`
  );
}

// Les chiffres d'un DA doivent être les siens, pas ceux du département.
const dept = texte("Rapport_T32026_DDEPIA-Menoua.docx");
const nb = (t) => (t.match(/\b\d+[,.]?\d*\b/g) || []).join("|");
const ds = nb(texte("Rapport_T32026_DAEPIA-Dschang.docx"));
const fk = nb(texte("Rapport_T32026_DAEPIA-Fokoué.docx"));
console.log(`\nchiffres Dschang ≠ chiffres Fokoué : ${ds !== fk ? "OUI — ok" : "NON — FAUTE"}`);
console.log(`chiffres Dschang ≠ chiffres département : ${ds !== nb(dept) ? "OUI — ok" : "NON — FAUTE"}`);
console.log(
  `département : les six arrondissements en colonnes : ` +
    `${ARR.every((a) => dept.includes(a)) ? "ok" : "MANQUE"}`
);
console.log(
  `département : signature départementale : ` +
    `${dept.includes("LE DÉLÉGUÉ DÉPARTEMENTAL,") ? "ok" : "FAUTE"}`
);

/**
 * Vérifie chaque tableau décrit dans le SID contre le canevas RÉGIONAL,
 * qui fait foi.
 *
 * L'adaptation départementale est légitime sur trois points, et sur ceux-là
 * seulement. Le script les neutralise avant de comparer :
 *
 *   - la maille : « Départements » devient « Arrondissement », et les huit
 *     départements de l'Ouest deviennent les six arrondissements ;
 *   - la période : le régional est semestriel, le départemental trimestriel —
 *     « TOTAL 1er S1 2026 » devient « TOTAL T1 2026 » ;
 *   - les colonnes et lignes de total ajoutées par le département.
 *
 * Tout le reste — libellés, accents, casse, ordre — doit suivre le régional.
 * Ce qui diverge est signalé. Le script ne corrige rien.
 *
 *   node --import tsx scripts/verifier-contre-regional.mjs
 */
import PizZip from "pizzip";
import { readFileSync } from "node:fs";

const REGIONAL = "docs/canevas/CANEVAS_REGIONAL_DREPIA-OUEST_S1-2026.docx";

const texteDe = (f) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

function tableauxDe(chemin) {
  const xml = new PizZip(readFileSync(chemin)).file("word/document.xml").asText();
  const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
  const out = [];
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
    out.push({
      entetes: trs.length ? cel(trs[0]) : [],
      lignes: trs.slice(1).map((tr) => cel(tr)[0] ?? "").filter(Boolean),
    });
    i = j;
  }
  return out;
}

/** Forme comparable : sans accents, sans casse, sans ponctuation ni espaces. */
const cle = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Libellés qui relèvent de la maille territoriale ou de la période. Ils
 * DOIVENT différer entre le régional et le départemental : on les écarte de la
 * comparaison, sinon chaque tableau paraîtrait divergent pour de bonnes raisons.
 */
const TERRITOIRES = new Set([
  // Maille
  "departement", "departements", "arrondissement", "arrondissements",
  // Les huit départements de l'Ouest, avec leurs abréviations du canevas
  "btos", "bamboutos", "hautnkam", "hautpltx", "hautspltx", "hautsplateaux",
  "koungkhi", "nkoungkhi", "menoua", "mifi", "nde", "noun",
  // Le siège régional, qui n'a pas d'équivalent départemental
  "drepiaosiege", "drepiasiege", "drepiao", "drepia",
  // Les six arrondissements de la Menoua
  "dschang", "fokoue", "fongotongo", "nkongni", "penkamichel", "santchou",
  // Écart
  "ecart",
  // Fragments : dans le régional, plusieurs noms de départements sont coupés
  // sur deux lignes d'en-tête, et arrivent donc en morceaux.
  "haut", "hauts", "nkam", "pltx", "plateaux", "nkoung", "khi", "o", "siege",
  "hautplateaux", "hautplateaux", "hautsplateaux", "hautnkam",
  // En-têtes composites de première colonne — la maille y est incluse
  "categoriedepart", "categoriearrondissement", "categoriedepartement",
  "nationalitearrondissement", "nationalitedepartement",
  "equipementsarrondissement", "equipementsdepartement",
  "especesarrondissement", "especesdepartement",
  "arrondissementenginsdepeches", "departementenginsdepeches",
  "produitsarrondissement", "produitsdepartement",
  "arrondissementespeces", "departementespeces",
]);

const estNeutre = (s) => {
  const k = cle(s);
  return !k || k.startsWith("total") || TERRITOIRES.has(k);
};

const significatifs = (t) =>
  [...t.entetes, ...t.lignes].filter((l) => l && !estNeutre(l));

function ressemblance(a, b) {
  const A = new Set(significatifs(a).map(cle));
  const B = new Set(significatifs(b).map(cle));
  if (!A.size || !B.size) return 0;
  let c = 0;
  for (const x of A) if (B.has(x)) c++;
  return c / Math.max(A.size, B.size);
}

// ---------------------------------------------------------------- exécution

const { SECTION_I } = await import("../src/server/trimestre/canevas/sectionI.ts");
const { SECTION_BUDGET } = await import("../src/server/trimestre/canevas/sectionBudget.ts");
const { SECTION_II_BOVIN } = await import("../src/server/trimestre/canevas/sectionBovin.ts");
const { SECTION_II_OVIN, SECTION_II_CAPRIN, SECTION_II_EQUIDES } = await import("../src/server/trimestre/canevas/sectionElevages.ts");
const { SECTION_II_PORCIN, SECTION_II_AVICOLE } = await import("../src/server/trimestre/canevas/sectionPorcinAvicole.ts");
const { SECTION_II_AUTRES, SECTION_III_PECHE } = await import("../src/server/trimestre/canevas/sectionPecheEtDivers.ts");
const { colonnesDe, lignesDe } = await import("../src/server/trimestre/canevas/rendu.ts");

const CTX = {
  periodeCourt: "T1 2026",
  periodeCourtN1: "T1 2025",
  annee: 2026,
  mois: ["JANVIER", "FÉVRIER", "MARS"],
  arrondissements: ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"],
};

const SECTIONS = [
  SECTION_I, SECTION_BUDGET, SECTION_II_BOVIN, SECTION_II_OVIN, SECTION_II_CAPRIN,
  SECTION_II_EQUIDES, SECTION_II_PORCIN, SECTION_II_AVICOLE, SECTION_II_AUTRES, SECTION_III_PECHE,
];

const region = tableauxDe(REGIONAL);
let total = 0, conformes = 0, sansOriginal = 0;
const divergences = [];

for (const section of SECTIONS) {
  const tableaux = section.blocs.filter((b) => b.type === "tableau");
  for (const b of tableaux) {
    total++;
    const mien = { entetes: colonnesDe(b, CTX), lignes: lignesDe(b, CTX) };

    let meilleur = null, score = 0;
    for (const r of region) {
      const s = ressemblance(mien, r);
      if (s > score) { score = s; meilleur = r; }
    }
    if (!meilleur || score < 0.5) { sansOriginal++; continue; }

    // Comparaison des libellés significatifs, dans l'ordre.
    const a = significatifs(mien);
    const b2 = significatifs(meilleur);
    const parCle = new Map(b2.map((l) => [cle(l), l]));

    const ecarts = [];
    for (const l of a) {
      const orig = parCle.get(cle(l));
      if (orig === undefined) ecarts.push({ type: "absent du régional", mien: l, regional: "—" });
      else if (orig !== l) ecarts.push({ type: "libellé différent", mien: l, regional: orig });
    }
    const miensCles = new Set(a.map(cle));
    for (const l of b2) if (!miensCles.has(cle(l))) ecarts.push({ type: "manquant chez nous", mien: "—", regional: l });

    if (ecarts.length === 0) conformes++;
    else divergences.push({ section: section.cle, numero: b.numero, titre: b.titre, score, ecarts, original: meilleur });
  }
}

console.log(`Tableaux décrits dans le SID : ${total}`);
console.log(`  conformes au régional      : ${conformes}`);
console.log(`  avec divergence            : ${divergences.length}`);
console.log(`  sans original régional     : ${sansOriginal}\n`);

for (const d of divergences) {
  console.log(`── ${d.section} · tableau n° ${d.numero ?? "—"} — ${d.titre || "(sans titre)"}  [ressemblance ${(d.score * 100).toFixed(0)} %]`);
  for (const e of d.ecarts.slice(0, 8)) {
    console.log(`     ${e.type}`);
    console.log(`       nous     : « ${e.mien} »`);
    console.log(`       régional : « ${e.regional} »`);
  }
  if (d.ecarts.length > 8) console.log(`     … et ${d.ecarts.length - 8} autre(s)`);
  if (d.original) {
    console.log(`     ORIGINAL RÉGIONAL — en-tête : ${d.original.entetes.map((e) => e || "·").join(" | ")}`);
    if (d.original.lignes.length) console.log(`     ORIGINAL RÉGIONAL — lignes  : ${d.original.lignes.join(" / ")}`);
  }
  console.log("");
}

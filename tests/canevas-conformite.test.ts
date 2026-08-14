/**
 * Conformité du rapport trimestriel au canevas RÉGIONAL, qui fait foi.
 *
 * Décision du Délégué du 14 août 2026 : le canevas de la DREPIA-Ouest fait
 * autorité ; le canevas départemental n'en est qu'une adaptation, et là où les
 * deux divergent, c'est le régional qui a raison.
 *
 * TROIS ADAPTATIONS SONT LÉGITIMES, et neutralisées avant comparaison. Sans
 * cela, tous les tableaux paraîtraient divergents pour de bonnes raisons :
 *
 *   - la maille : huit départements et le siège régional deviennent six
 *     arrondissements ;
 *   - la période : semestrielle devient trimestrielle ;
 *   - les totaux : le département ajoute la comparaison à la même période de
 *     l'année précédente, que le régional n'a pas.
 *
 * Tout le reste — libellés, accents, casse, ordre — doit suivre le régional.
 *
 * LES DIVERGENCES CONNUES sont listées dans DIVERGENCES_ATTENDUES. Le test
 * échoue si une NOUVELLE apparaît, et aussi si l'une d'elles est corrigée sans
 * mettre la liste à jour : la liste doit se vider à mesure du travail.
 *
 *   npm run test:canevas
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import PizZip from "pizzip";
import { SECTION_I } from "../src/server/trimestre/canevas/sectionI";
import { SECTION_BUDGET } from "../src/server/trimestre/canevas/sectionBudget";
import { SECTION_II_BOVIN } from "../src/server/trimestre/canevas/sectionBovin";
import { SECTION_II_OVIN, SECTION_II_CAPRIN, SECTION_II_EQUIDES } from "../src/server/trimestre/canevas/sectionElevages";
import { SECTION_II_PORCIN, SECTION_II_AVICOLE } from "../src/server/trimestre/canevas/sectionPorcinAvicole";
import { SECTION_II_AUTRES, SECTION_III_PECHE } from "../src/server/trimestre/canevas/sectionPecheEtDivers";
import { colonnesDe, lignesDe, inventaireSection } from "../src/server/trimestre/canevas/rendu";
import { type Bloc, type ContexteCanevas, type SectionCanevas } from "../src/server/trimestre/canevas/types";

const REGIONAL = "docs/canevas/CANEVAS_REGIONAL_DREPIA-OUEST_S1-2026.docx";

const CTX: ContexteCanevas = {
  periodeCourt: "T1 2026",
  periodeCourtN1: "T1 2025",
  annee: 2026,
  mois: ["JANVIER", "FÉVRIER", "MARS"],
  arrondissements: ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"],
};

const SECTIONS: SectionCanevas[] = [
  SECTION_I, SECTION_BUDGET, SECTION_II_BOVIN, SECTION_II_OVIN, SECTION_II_CAPRIN,
  SECTION_II_EQUIDES, SECTION_II_PORCIN, SECTION_II_AVICOLE, SECTION_II_AUTRES, SECTION_III_PECHE,
];

/**
 * Tableaux dont les libellés ne correspondent pas encore au régional.
 * Chaque entrée porte la raison. La liste doit se vider.
 */
const DIVERGENCES_ATTENDUES = new Set([
  "I n° 4",     // le régional laisse sa première cellule vide, nous l'intitulons « Désignation »
  "I n° 7",     // colonne « DEFICIT » du régional, non encore reprise
  "I n° 12",    // en-tête « Structures » du régional
  "I n° —",     // contraintes stratégiques : appariement incertain avec le régional
  "II-1 n° 21", // « Prix moyen FCFA/Unité » — espace ajouté par le département
  "II-4 n° 36", // « Mulets » du régional non repris ; « RAS » propre au département
  "II-6 n° 42", // en-tête composite « Catégorie » du régional
  "II-6 n° 44", // en-tête composite « Catégorie »
]);

// ------------------------------------------------------------ lecture du canevas

const texteDe = (f: string) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

interface TableauOfficiel { entetes: string[]; lignes: string[] }
const region: TableauOfficiel[] = [];

before(() => {
  if (!existsSync(REGIONAL)) return;
  const xml = new PizZip(readFileSync(REGIONAL)).file("word/document.xml")!.asText();
  const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));
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
    const trs = Array.from(tbl.slice(7, -8).matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g))
      .map((m) => m[0]).filter((t) => !t.includes("<w:tbl>"));
    const cel = (tr: string) => Array.from(tr.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)).map((c) => texteDe(c[0]));
    region.push({
      entetes: trs.length ? cel(trs[0]) : [],
      lignes: trs.slice(1).map((tr) => cel(tr)[0] ?? "").filter(Boolean),
    });
    i = j;
  }
});

// -------------------------------------------------------------- neutralisation

const cle = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Libellés relevant de la maille ou de la période : ils DOIVENT différer. */
const TERRITOIRES = new Set([
  "departement", "departements", "arrondissement", "arrondissements",
  "btos", "bamboutos", "hautnkam", "hautpltx", "hautspltx", "hautsplateaux", "hautplateaux",
  "koungkhi", "nkoungkhi", "menoua", "mifi", "nde", "noun",
  "drepiaosiege", "drepiasiege", "drepiao", "drepia",
  "dschang", "fokoue", "fongotongo", "nkongni", "penkamichel", "santchou",
  "ecart",
  "haut", "hauts", "nkam", "pltx", "plateaux", "nkoung", "khi", "o", "siege",
  "categoriedepart", "categoriearrondissement", "categoriedepartement", "categoriedepartements",
  "nationalitearrondissement", "nationalitedepartement", "nationalitedepartements",
  "equipementsarrondissement", "equipementsdepartement", "equipementsdepartements",
  "especesarrondissement", "especesdepartement", "especesdepartements",
  "arrondissementenginsdepeches", "departementenginsdepeches", "departementsenginsdepeches",
  "produitsarrondissement", "produitsdepartement", "produitsdepartements",
  "arrondissementespeces", "departementespeces",
]);

const estNeutre = (s: string) => {
  const k = cle(s);
  return !k || k.startsWith("total") || TERRITOIRES.has(k);
};

const significatifs = (t: TableauOfficiel) => [...t.entetes, ...t.lignes].filter((l) => l && !estNeutre(l));

function ressemblance(a: TableauOfficiel, b: TableauOfficiel): number {
  const A = new Set(significatifs(a).map(cle));
  const B = new Set(significatifs(b).map(cle));
  if (!A.size || !B.size) return 0;
  let c = 0;
  A.forEach((x) => { if (B.has(x)) c++; });
  return c / Math.max(A.size, B.size);
}

const tableauxDe = (s: SectionCanevas) =>
  s.blocs.filter((b): b is Extract<Bloc, { type: "tableau" }> => b.type === "tableau");

/** Compare chaque tableau décrit à son original régional. */
function analyser() {
  const divergents: { id: string; titre: string; ecarts: string[] }[] = [];
  let conformes = 0, sansOriginal = 0, total = 0;

  for (const section of SECTIONS) {
    for (const b of tableauxDe(section)) {
      total++;
      const mien: TableauOfficiel = { entetes: colonnesDe(b, CTX), lignes: lignesDe(b, CTX) };
      let meilleur: TableauOfficiel | null = null, score = 0;
      for (const r of region) {
        const s = ressemblance(mien, r);
        if (s > score) { score = s; meilleur = r; }
      }
      if (!meilleur || score < 0.5) { sansOriginal++; continue; }

      const a = significatifs(mien);
      const b2 = significatifs(meilleur);
      const parCle = new Map(b2.map((l) => [cle(l), l]));
      const ecarts: string[] = [];
      for (const l of a) {
        const orig = parCle.get(cle(l));
        if (orig === undefined) ecarts.push(`« ${l} » absent du régional`);
        else if (orig !== l) ecarts.push(`« ${l} » au lieu de « ${orig} »`);
      }
      const miens = new Set(a.map(cle));
      for (const l of b2) if (!miens.has(cle(l))) ecarts.push(`« ${l} » manquant chez nous`);

      if (ecarts.length === 0) conformes++;
      else divergents.push({ id: `${section.cle} n° ${b.numero ?? "—"}`, titre: b.titre, ecarts });
    }
  }
  return { divergents, conformes, sansOriginal, total };
}

// ------------------------------------------------------------------- tests

test("le canevas régional est présent dans le dépôt", () => {
  assert.ok(existsSync(REGIONAL), `Fichier absent : ${REGIONAL}`);
  assert.ok(region.length > 100, `seulement ${region.length} tableaux lus`);
});

test("aucune divergence NOUVELLE avec le canevas régional", () => {
  const { divergents } = analyser();
  const inattendues = divergents.filter((d) => !DIVERGENCES_ATTENDUES.has(d.id));
  assert.deepEqual(
    inattendues.map((d) => `${d.id} — ${d.titre} : ${d.ecarts.join(" ; ")}`),
    [],
    "un tableau s'écarte du régional sans être dans la liste des divergences connues"
  );
});

test("les divergences connues qui ont été corrigées sont retirées de la liste", () => {
  const { divergents } = analyser();
  const ids = new Set(divergents.map((d) => d.id));
  const corrigees = Array.from(DIVERGENCES_ATTENDUES).filter((id) => !ids.has(id));
  assert.deepEqual(
    corrigees, [],
    "ces divergences ne se produisent plus : retirez-les de DIVERGENCES_ATTENDUES pour que le filet reste tendu"
  );
});

test("la conformité progresse", () => {
  const { conformes, total, sansOriginal } = analyser();
  console.log(`      ${conformes} conformes · ${total - conformes - sansOriginal} divergents · ${sansOriginal} sans original régional`);
  assert.ok(conformes >= 47, `régression : ${conformes} tableaux conformes au lieu de 47 au minimum`);
});

// -------------------------------------------------- contrôles de structure

test("un SEUL tableau porte une colonne « Écart », et c'est le n° 62", () => {
  const porteurs: string[] = [];
  for (const section of SECTIONS) {
    for (const b of tableauxDe(section)) {
      if (colonnesDe(b, CTX).some((c) => /^écart$/i.test(c))) porteurs.push(`${section.cle} n° ${b.numero}`);
    }
  }
  assert.deepEqual(porteurs, ["III n° 62"]);
});

test("les jetons de période sont tous substitués", () => {
  for (const section of SECTIONS) {
    for (const b of tableauxDe(section)) {
      const restants = [...colonnesDe(b, CTX), ...lignesDe(b, CTX)].filter((x) => x.includes("{"));
      assert.deepEqual(restants, [], `${section.cle} : jeton non remplacé`);
    }
  }
});

test("les clés des zones de texte sont uniques dans chaque section", () => {
  for (const section of SECTIONS) {
    const cles = section.blocs.filter((b) => b.type === "zoneTexte").map((b) => (b as { cle: string }).cle);
    assert.equal(new Set(cles).size, cles.length, `${section.cle} : deux zones portent la même clé`);
  }
});

test("le budget-programme décrit ses quatre programmes, sans légende", () => {
  const titres = SECTION_BUDGET.blocs.filter((b) => b.type === "titre" && b.niveau === 2).map((b) => (b as { texte: string }).texte);
  assert.equal(titres.length, 4);
  for (const code of ["053", "055", "057", "059"]) {
    assert.ok(titres.some((t) => t.startsWith(`PROGRAMME ${code} :`)), `programme ${code} manquant`);
  }
  for (const b of tableauxDe(SECTION_BUDGET)) {
    assert.equal(b.titre, "");
    assert.equal(b.numero, null);
  }
});

test("l'inventaire des sections est cohérent", () => {
  let tableaux = 0;
  for (const section of SECTIONS) {
    const inv = inventaireSection(section, CTX);
    assert.ok(inv.titres > 0, `${section.cle} : aucun titre`);
    tableaux += inv.tableaux;
  }
  assert.equal(tableaux, 68, "68 tableaux décrits à ce jour");
});

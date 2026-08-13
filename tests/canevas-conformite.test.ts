/**
 * Conformité du rapport trimestriel au canevas officiel.
 *
 * Ce test ouvre le .docx du Délégué et compare, tableau par tableau, ce que le
 * SID s'apprête à produire avec ce que le canevas impose : intitulé de chaque
 * colonne, libellé de chaque ligne, dans l'ordre.
 *
 * Il est réglé sur la période du canevas lui-même — premier trimestre 2026 —
 * de sorte que les jetons {P}, {P-1} et {M1..3} produisent exactement les
 * chaînes du document officiel. Toute divergence, fût-elle une apostrophe,
 * fait échouer le test : éprouvé en remplaçant le « ’ » de « Centre
 * d’alevinage » par une apostrophe droite.
 *
 * Chaque nouvelle section décrite s'ajoute à SECTIONS ci-dessous, avec l'indice
 * de son premier tableau dans le canevas.
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
import { colonnesDe, lignesDe, inventaireSection } from "../src/server/trimestre/canevas/rendu";
import { type Bloc, type ContexteCanevas, type SectionCanevas } from "../src/server/trimestre/canevas/types";

const CANEVAS = "docs/canevas/CANEVAS_RAPPORT_TRIMESTRIEL_DDEPIA-MENOUA_v1.docx";

/** Réglé sur la période du canevas : c'est ce qui rend la comparaison littérale. */
const CTX: ContexteCanevas = {
  periodeCourt: "T1 2026",
  periodeCourtN1: "T1 2025",
  annee: 2026,
  mois: ["JANVIER", "FÉVRIER", "MARS"],
  arrondissements: ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"],
};

/**
 * Les sections décrites, et l'indice (base 0) de leur premier tableau dans le
 * canevas. Le tableau #1 du document est l'en-tête bilingue, le #2 la liste des
 * acronymes : la section I commence donc au troisième, soit l'indice 2.
 */
const SECTIONS: { section: SectionCanevas; premierTableau: number; nbTableaux: number }[] = [
  { section: SECTION_I, premierTableau: 2, nbTableaux: 14 },
  { section: SECTION_BUDGET, premierTableau: 16, nbTableaux: 4 },
  { section: SECTION_II_BOVIN, premierTableau: 20, nbTableaux: 9 },
  { section: SECTION_II_OVIN, premierTableau: 29, nbTableaux: 5 },
  { section: SECTION_II_CAPRIN, premierTableau: 34, nbTableaux: 5 },
  { section: SECTION_II_EQUIDES, premierTableau: 39, nbTableaux: 4 },
];

const texteDe = (f: string) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

interface TableauOfficiel { entetes: string[]; lignes: string[] }
const officiels: TableauOfficiel[] = [];

before(() => {
  if (!existsSync(CANEVAS)) return;
  const xml = new PizZip(readFileSync(CANEVAS)).file("word/document.xml")!.asText();
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
      .map((m) => m[0])
      .filter((t) => !t.includes("<w:tbl>"));
    const cellulesDe = (tr: string) => Array.from(tr.matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)).map((c) => texteDe(c[0]));
    officiels.push({
      entetes: trs.length ? cellulesDe(trs[0]) : [],
      // Les tableaux « à lignes libres » du canevas ont des premières cellules
      // vides : on les écarte des deux côtés de la comparaison.
      lignes: trs.slice(1).map((tr) => cellulesDe(tr)[0] ?? "").filter(Boolean),
    });
    i = j;
  }
});

const tableauxDe = (s: SectionCanevas) =>
  s.blocs.filter((b): b is Extract<Bloc, { type: "tableau" }> => b.type === "tableau");

test("le canevas officiel est présent dans le dépôt", () => {
  assert.ok(existsSync(CANEVAS), `Fichier absent : ${CANEVAS}`);
  assert.ok(officiels.length >= 20, `seulement ${officiels.length} tableaux lus dans le canevas`);
});

for (const { section, premierTableau, nbTableaux } of SECTIONS) {
  test(`${section.cle} — le bon nombre de tableaux est décrit`, () => {
    assert.equal(tableauxDe(section).length, nbTableaux, section.titre);
  });

  test(`${section.cle} — chaque tableau a EXACTEMENT les colonnes du canevas`, () => {
    const ecarts: string[] = [];
    tableauxDe(section).forEach((bloc, k) => {
      const officiel = officiels[premierTableau + k];
      if (!officiel) { ecarts.push(`tableau ${k + 1} : absent du canevas`); return; }
      const attendues = officiel.entetes.map((e) => e || "·");
      const obtenues = colonnesDe(bloc, CTX);
      const nom = bloc.numero == null ? `« ${bloc.titre || "sans titre"} »` : `n° ${bloc.numero}`;
      if (obtenues.length !== attendues.length) {
        ecarts.push(`${nom} : ${obtenues.length} colonnes au lieu de ${attendues.length}`);
        return;
      }
      obtenues.forEach((c, i) => {
        if (c !== attendues[i]) ecarts.push(`${nom} colonne ${i + 1} : « ${c} » au lieu de « ${attendues[i]} »`);
      });
    });
    assert.deepEqual(ecarts, [], `\n${ecarts.length} écart(s) :\n` + ecarts.map((e) => `  - ${e}`).join("\n") + "\n");
  });

  test(`${section.cle} — chaque tableau a EXACTEMENT les libellés de ligne du canevas`, () => {
    const ecarts: string[] = [];
    tableauxDe(section).forEach((bloc, k) => {
      const officiel = officiels[premierTableau + k];
      if (!officiel) return;
      const attendues = officiel.lignes;
      const obtenues = lignesDe(bloc, CTX).filter(Boolean);
      const nom = bloc.numero == null ? `« ${bloc.titre || "sans titre"} »` : `n° ${bloc.numero}`;
      if (obtenues.length !== attendues.length) {
        ecarts.push(
          `${nom} : ${obtenues.length} lignes au lieu de ${attendues.length}\n` +
            `      décrites : ${obtenues.join(" / ")}\n      canevas  : ${attendues.join(" / ")}`
        );
        return;
      }
      obtenues.forEach((l, i) => {
        if (l !== attendues[i]) ecarts.push(`${nom} ligne ${i + 1} : « ${l} » au lieu de « ${attendues[i]} »`);
      });
    });
    assert.deepEqual(ecarts, [], `\n${ecarts.length} écart(s) :\n` + ecarts.map((e) => `  - ${e}`).join("\n") + "\n");
  });

  test(`${section.cle} — les clés des zones de texte sont uniques`, () => {
    const cles = section.blocs.filter((b) => b.type === "zoneTexte").map((b) => (b as { cle: string }).cle);
    assert.equal(new Set(cles).size, cles.length, "deux zones de texte portent la même clé");
  });
}

test("aucune colonne « Écart » n'est ajoutée là où le canevas n'en a pas", () => {
  const fautifs: string[] = [];
  for (const { section } of SECTIONS) {
    for (const b of tableauxDe(section)) {
      if (colonnesDe(b, CTX).some((c) => /^écart$/i.test(c))) fautifs.push(`${section.cle} n° ${b.numero}`);
    }
  }
  assert.deepEqual(fautifs, [], "le canevas ne porte de colonne « Écart » dans aucun de ces tableaux");
});

test("les jetons de période sont tous substitués", () => {
  for (const { section } of SECTIONS) {
    for (const b of tableauxDe(section)) {
      const restants = [...colonnesDe(b, CTX), ...lignesDe(b, CTX)].filter((x) => x.includes("{"));
      assert.deepEqual(restants, [], `${section.cle} : jeton non remplacé`);
    }
  }
});

test("le budget-programme décrit bien ses quatre programmes", () => {
  const titres = SECTION_BUDGET.blocs
    .filter((b) => b.type === "titre" && b.niveau === 2)
    .map((b) => (b as { texte: string }).texte);
  assert.equal(titres.length, 4);
  for (const code of ["053", "055", "057", "059"]) {
    assert.ok(titres.some((t) => t.startsWith(`PROGRAMME ${code} :`)), `programme ${code} manquant`);
  }
});

test("les tableaux du budget-programme n'ont pas de légende", () => {
  // Le canevas ne leur en donne pas : leur en inventer une les ferait entrer
  // dans la liste des tableaux, où ils n'ont rien à faire.
  for (const b of tableauxDe(SECTION_BUDGET)) {
    assert.equal(b.titre, "", "un tableau du budget-programme porte une légende");
    assert.equal(b.numero, null);
  }
});

test("l'inventaire des sections est cohérent", () => {
  for (const { section, nbTableaux } of SECTIONS) {
    const inv = inventaireSection(section, CTX);
    assert.equal(inv.tableaux, nbTableaux, section.cle);
    // Toutes les sections ne portent pas de zone de texte : le canevas n'en
    // met aucune dans II-4, les élevages d'asins et d'équidés.
    assert.ok(inv.titres > 0, `${section.cle} : aucun titre`);
  }
});

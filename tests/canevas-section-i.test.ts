/**
 * Conformité de la section I au canevas officiel.
 *
 * Ce test ouvre le .docx du Délégué et compare, tableau par tableau, ce que le
 * SID s'apprête à produire avec ce que le canevas impose : intitulé de chaque
 * colonne, libellé de chaque ligne, dans l'ordre.
 *
 * Il est réglé sur la période du canevas lui-même — premier trimestre 2026 —
 * de sorte que les jetons {P}, {P-1} et {M1..3} produisent exactement les
 * chaînes du document officiel. Toute divergence, fût-elle une apostrophe,
 * fait échouer le test.
 *
 *   npm run test:canevas
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import PizZip from "pizzip";
import { SECTION_I } from "../src/server/trimestre/canevas/sectionI";
import { colonnesDe, inventaireSection } from "../src/server/trimestre/canevas/rendu";
import { resoudre, type Bloc, type ContexteCanevas } from "../src/server/trimestre/canevas/types";

const CANEVAS = "docs/canevas/CANEVAS_RAPPORT_TRIMESTRIEL_DDEPIA-MENOUA_v1.docx";

/** Réglé sur la période du canevas : c'est ce qui rend la comparaison littérale. */
const CTX: ContexteCanevas = {
  periodeCourt: "T1 2026",
  periodeCourtN1: "T1 2025",
  mois: ["JANVIER", "FÉVRIER", "MARS"],
  arrondissements: ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"],
};

const texteDe = (f: string) =>
  f.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")
   .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/\s+/g, " ").trim();

interface TableauOfficiel { entetes: string[]; lignes: string[] }
let officiels: TableauOfficiel[] = [];

before(() => {
  if (!existsSync(CANEVAS)) return;
  const xml = new PizZip(readFileSync(CANEVAS)).file("word/document.xml")!.asText();
  const corps = xml.slice(xml.indexOf("<w:body>"), xml.lastIndexOf("</w:body>"));

  // Tous les tableaux de premier niveau, dans l'ordre du document.
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
      lignes: trs.slice(1).map((tr) => cellulesDe(tr)[0] ?? "").filter(Boolean),
    });
    i = j;
  }
});

/** Les tableaux de la section I sont, dans le canevas, les #3 à #16 (index 2 à 15). */
const INDEX_PREMIER_TABLEAU_SECTION_I = 2;

const tableauxDecrits = () =>
  SECTION_I.blocs.filter((b): b is Extract<Bloc, { type: "tableau" }> => b.type === "tableau");

test("le canevas officiel est présent dans le dépôt", () => {
  assert.ok(existsSync(CANEVAS), `Fichier absent : ${CANEVAS}`);
  assert.ok(officiels.length >= 16, `seulement ${officiels.length} tableaux lus dans le canevas`);
});

test("la section I décrit le bon nombre de tableaux", () => {
  assert.equal(tableauxDecrits().length, 14, "quatorze tableaux du canevas relèvent de la section I");
});

test("chaque tableau a EXACTEMENT les colonnes du canevas", () => {
  const decrits = tableauxDecrits();
  const ecarts: string[] = [];

  decrits.forEach((bloc, k) => {
    const officiel = officiels[INDEX_PREMIER_TABLEAU_SECTION_I + k];
    if (!officiel) { ecarts.push(`tableau ${k + 1} : absent du canevas`); return; }
    const attendues = officiel.entetes.map((e) => e || "·");
    const obtenues = colonnesDe(bloc, CTX);
    if (obtenues.length !== attendues.length) {
      ecarts.push(`n° ${bloc.numero ?? "—"} « ${bloc.titre} » : ${obtenues.length} colonnes au lieu de ${attendues.length}`);
      return;
    }
    obtenues.forEach((c, i) => {
      if (c !== attendues[i]) {
        ecarts.push(`n° ${bloc.numero ?? "—"} colonne ${i + 1} : « ${c} » au lieu de « ${attendues[i]} »`);
      }
    });
  });

  assert.deepEqual(ecarts, [], `\n${ecarts.length} écart(s) de colonnes :\n` + ecarts.map((e) => `  - ${e}`).join("\n") + "\n");
});

test("chaque tableau a EXACTEMENT les libellés de ligne du canevas", () => {
  const decrits = tableauxDecrits();
  const ecarts: string[] = [];

  decrits.forEach((bloc, k) => {
    const officiel = officiels[INDEX_PREMIER_TABLEAU_SECTION_I + k];
    if (!officiel) return;
    const attendues = officiel.lignes;
    const obtenues = bloc.lignes.map((l) => resoudre(l, CTX));
    if (obtenues.length !== attendues.length) {
      ecarts.push(
        `n° ${bloc.numero ?? "—"} « ${bloc.titre} » : ${obtenues.length} lignes au lieu de ${attendues.length}\n` +
          `      décrites : ${obtenues.join(" / ")}\n      canevas  : ${attendues.join(" / ")}`
      );
      return;
    }
    obtenues.forEach((l, i) => {
      if (l !== attendues[i]) {
        ecarts.push(`n° ${bloc.numero ?? "—"} ligne ${i + 1} : « ${l} » au lieu de « ${attendues[i]} »`);
      }
    });
  });

  assert.deepEqual(ecarts, [], `\n${ecarts.length} écart(s) de libellés :\n` + ecarts.map((e) => `  - ${e}`).join("\n") + "\n");
});

test("aucune colonne « Écart » n'est ajoutée là où le canevas n'en a pas", () => {
  const fautifs = tableauxDecrits()
    .filter((b) => colonnesDe(b, CTX).some((c) => /^écart$/i.test(c)))
    .map((b) => b.numero);
  assert.deepEqual(fautifs, [], "le canevas ne porte de colonne « Écart » dans aucun tableau de la section I");
});

test("les zones de texte analytiques du canevas sont toutes reprises", () => {
  const inv = inventaireSection(SECTION_I, CTX);
  // Le canevas de la section I impose quinze zones : introduction, six données
  // de référence, mouvements du personnel, préambule des recettes, performances,
  // difficultés, perspectives, AFOP, ACEFA, autres activités, contraintes,
  // points d'attention.
  assert.ok(inv.zonesTexte >= 15, `seulement ${inv.zonesTexte} zones de texte décrites`);
  const cles = SECTION_I.blocs.filter((b) => b.type === "zoneTexte").map((b) => (b as { cle: string }).cle);
  assert.equal(new Set(cles).size, cles.length, "deux zones de texte portent la même clé");
});

test("les jetons de période sont bien substitués", () => {
  const t13 = tableauxDecrits().find((b) => b.numero === 13)!;
  const lignes = t13.lignes.map((l) => resoudre(l, CTX));
  assert.deepEqual(lignes.slice(0, 3), ["JANVIER", "FÉVRIER", "MARS"]);
  assert.ok(lignes.includes("TOTAL T1 2026"));
  assert.ok(!lignes.some((l) => l.includes("{")), "un jeton n'a pas été remplacé");
});

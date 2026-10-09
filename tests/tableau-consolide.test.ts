/**
 * Le tableau consolidé, en lecture, sous l'analyse (demande du Délégué,
 * 9 octobre 2026) : un chef de section y voit chaque arrondissement ; un DA,
 * le sien seulement. Base locale, lecture seule.
 *
 *   node --env-file=.env --import tsx --test tests/tableau-consolide.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { consulterTableau } from "../src/server/trimestre/saisieTrimestrielle";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { listerArrondissements } from "../src/lib/arrondissements";

after(() => base.$disconnect());
const periode = trimestrielle(2026, 3);

test("le chef de section voit une ligne par arrondissement, et les totaux", async () => {
  const arrondissements = (await listerArrondissements(base)).map((a) => a.nom);
  const c = await consulterTableau(base, periode, { role: "CHEF_PSA" }, 14);
  assert.ok(c);
  assert.equal(c!.axe, "lignes");
  assert.equal(c!.arrondissement, null);
  const libelles = c!.tableau.lignes.map((l) => l.libelle);
  for (const a of arrondissements) assert.ok(libelles.includes(a), `ligne de ${a}`);
  assert.ok(libelles.some((l) => /^TOTAL/.test(l)), "ligne de total");
  for (const l of c!.tableau.lignes) assert.equal(l.valeurs.length, c!.tableau.colonnes.length);
});

test("un DA ne voit que son arrondissement", async () => {
  const [premier, ...autres] = (await listerArrondissements(base)).map((a) => a.nom);
  const c = await consulterTableau(base, periode, { role: "DA", arrondissement: premier }, 14);
  assert.equal(c!.arrondissement, premier);
  const libelles = c!.tableau.lignes.map((l) => l.libelle);
  assert.ok(libelles.includes(premier));
  for (const a of autres) assert.ok(!libelles.includes(a), `${a} n'apparaît pas`);
  assert.deepEqual(c!.versions, []);
});

test("les points à vérifier ne s'adressent qu'au département, et chaque case visée existe", async () => {
  const [premier] = (await listerArrondissements(base)).map((a) => a.nom);
  const da = await consulterTableau(base, periode, { role: "DA", arrondissement: premier }, 14);
  assert.deepEqual(da!.points, [], "un DA a son propre écran de saisie et « À corriger »");
  const c = await consulterTableau(base, periode, { role: "CHEF_PSA" }, 14);
  const cles = new Set(c!.tableau.lignes.map((l) => l.cle));
  for (const p of c!.points) {
    for (const k of p.cases) {
      assert.ok(cles.has(k.ligne), `ligne « ${k.ligne} » du point « ${p.texte} »`);
      if (k.colonne) assert.ok(c!.tableau.colonnes.includes(k.colonne), `colonne « ${k.colonne} »`);
    }
  }
});

test("un tableau dont toutes les catégories sont calculées (viande) n'a pas d'erreur de somme", async () => {
  for (const numero of [18, 40]) {
    const c = await consulterTableau(base, periode, { role: "CHEF_PSA" }, numero);
    const fausses = c!.points.filter((p) => p.genre === "erreur" && /somme des catégories \(0\)/.test(p.texte));
    assert.deepEqual(fausses, [], `tableau ${numero}`);
  }
});

test("un tableau inconnu ne rend rien", async () => {
  assert.equal(await consulterTableau(base, periode, { role: "CHEF_PSA" }, 9999), null);
});

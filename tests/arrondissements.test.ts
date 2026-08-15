/**
 * Les arrondissements viennent de la base, et leur graphie s'en déduit.
 *
 * Deux tables de correspondance écrites à la main disparaissent : les six codes
 * d'arrondissement, et leur graphie canevas (majuscules, sans accent ni tiret).
 * Remplacer une table écrite à la main par une règle n'est légitime que si la
 * règle redonne EXACTEMENT ce que la table disait — sinon un libellé change
 * dans un document officiel, sans que personne ne l'ait demandé.
 *
 * Ce test fige donc les six correspondances telles qu'elles étaient écrites en
 * dur avant le lot 9, et vérifie que la règle les reproduit.
 *
 *   node --env-file=.env --import tsx --test tests/arrondissements.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, baseBrute } from "../src/lib/baseDeTravail";
import { graphieCanevas, listerArrondissements } from "../src/lib/arrondissements";

/** Recopié de rapport-docx.ts et buildReportTemplates.ts AVANT le lot 9. */
const GRAPHIE_HISTORIQUE: Record<string, string> = {
  Dschang: "DSCHANG",
  Fokoué: "FOKOUE",
  "Fongo-Tongo": "FONGO TONGO",
  "Nkong-Ni": "NKONG NI",
  "Penka-Michel": "PENKA MICHEL",
  Santchou: "SANTCHOU",
};

test("la règle redonne exactement les six graphies écrites en dur", () => {
  for (const [nom, attendu] of Object.entries(GRAPHIE_HISTORIQUE)) {
    assert.equal(graphieCanevas(nom), attendu, `« ${nom} » ne redonne plus « ${attendu} ».`);
  }
});

test("elle retire les accents, les tirets, et met en majuscules", () => {
  assert.equal(graphieCanevas("Bafoussam-Ier"), "BAFOUSSAM IER");
  assert.equal(graphieCanevas("Bandjoun"), "BANDJOUN");
  assert.equal(graphieCanevas("Baham"), "BAHAM");
  // Un nom déjà conforme ne doit pas être abîmé.
  assert.equal(graphieCanevas("SANTCHOU"), "SANTCHOU");
});

test("elle ne laisse ni espace double ni espace en bord", () => {
  assert.equal(graphieCanevas("  Nkong - Ni  "), "NKONG NI");
});

test("les arrondissements lus en base sont ceux du département, dans l'ordre du canevas", async () => {
  const arrondissements = await listerArrondissements(base);

  assert.ok(arrondissements.length > 0, "Aucun arrondissement lu : le test ne prouverait rien.");
  assert.deepEqual(
    arrondissements.map((a) => a.code),
    ["DSC", "FOK", "FGT", "NKN", "PKM", "STC"],
    "L'ordre du canevas n'est plus celui rendu par la base."
  );
  for (const a of arrondissements) {
    assert.equal(a.nomCanevas, GRAPHIE_HISTORIQUE[a.nom], `Graphie inattendue pour « ${a.nom} ».`);
  }
});

test("sans département déclaré, la liste est vide plutôt que celle du voisin", async () => {
  assert.deepEqual(await listerArrondissements(baseBrute), []);
});

after(async () => { await baseBrute.$disconnect(); });

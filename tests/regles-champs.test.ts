/**
 * Tests des règles d'agrégation trimestrielle (E4).
 *
 * Le test décisif est le dernier : il parcourt TOUS les champs actifs de la
 * base et vérifie que chacun tombe sur une règle explicite. Un champ ajouté au
 * canevas sans règle fait échouer ce test — et non le rapport trimestriel d'un
 * jour de clôture.
 *
 *   npm run test:regles
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import {
  regleDuChamp, regleExpliquee, champsDePonderation,
  verifierCouverture, ChampSansRegleError,
} from "../src/server/trimestre/reglesChamps";

const db = base;
after(async () => { await db.$disconnect(); });

// ------------------------------------------------------- ce qui ne s'additionne pas

test("le cheptel est un stock : dernière valeur, jamais la somme", () => {
  for (const c of ["T11_CHEPTEL_BOVIN", "T11_CHEPTEL_OVIN", "T11_CHEPTEL_CAPRIN", "T11_CHEPTEL_PORCIN"]) {
    assert.equal(regleDuChamp(c), "DERNIERE_VALEUR", c);
  }
});

test("la volaille est un stock elle aussi", () => {
  assert.equal(regleDuChamp("T12_VOL_MOD_PONDEUSE"), "DERNIERE_VALEUR");
  assert.equal(regleDuChamp("T12_VOL_TRAD_POULET_CHAIR"), "DERNIERE_VALEUR");
});

test("un effectif « en début de mois » est un stock, malgré son tableau de production", () => {
  // Piège : T14 et T15 sont des tableaux de PRODUCTION (donc SOMME par famille),
  // mais ces trois champs-là décrivent un effectif présent. La règle
  // particulière doit l'emporter sur la famille.
  assert.equal(regleDuChamp("T14_PONDEUSES_DEBUT"), "DERNIERE_VALEUR");
  assert.equal(regleDuChamp("T15_POULETS_DEBUT"), "DERNIERE_VALEUR");
  assert.equal(regleDuChamp("T13_REPRO_PONTE_DEBUT"), "DERNIERE_VALEUR");
  // …alors que la production du même tableau s'additionne bien.
  assert.equal(regleDuChamp("T14_OEUFS_PRODUITS"), "SOMME");
  assert.equal(regleDuChamp("T15_POULETS_SORTIS"), "SOMME");
});

test("étangs, superficies et champs fourragers sont un patrimoine, pas une production", () => {
  assert.equal(regleDuChamp("T17_NB_ETANGS"), "DERNIERE_VALEUR");
  assert.equal(regleDuChamp("T17_SUPERFICIE"), "DERNIERE_VALEUR");
  assert.equal(regleDuChamp("T24_BRACHARIA_NBCHAMPS"), "DERNIERE_VALEUR");
  assert.equal(regleDuChamp("T24_BRACHARIA_SUPERFICIE"), "DERNIERE_VALEUR");
  // Le foin récolté sur ces champs, lui, s'additionne.
  assert.equal(regleDuChamp("T24_BRACHARIA_FOIN"), "SOMME");
});

// ------------------------------------------------------------------ les flux

test("abattages, viande, œufs, captures et ventes s'additionnent", () => {
  for (const c of [
    "T21_ABAT_BOVIN", "T22_VIANDE_BOVIN", "T14_OEUFS_PRODUITS",
    "T16_POISSON_CONTINENTALE", "T17_POISSON_TILAPIA",
    "T25_LAIT_FRAIS", "T26_YAOURT", "T34_INSP_VIANDE_BOVINE_FRAICHE",
    "T51_BOVIN_VACHE_VENDU_D1", "T55_VOLAILLE_PONDEUSE_MEV_D2",
  ]) {
    assert.equal(regleDuChamp(c), "SOMME", c);
  }
});

// ------------------------------------------------------------------ les prix

test("un prix moyen est pondéré, jamais additionné ni moyenné bêtement", () => {
  assert.equal(regleDuChamp("T51_BOVIN_VACHE_PRIX_MOYEN"), "MOYENNE_PONDEREE");
  assert.equal(regleDuChamp("T55_VOLAILLE_POULET_CHAIR_PRIX_MOYEN"), "MOYENNE_PONDEREE");
  assert.equal(regleDuChamp("T56_ANE_PRIX_MOYEN"), "MOYENNE_PONDEREE");
});

test("la pondération d'un prix pointe les ventes de sa propre catégorie", () => {
  assert.deepEqual(champsDePonderation("T51_BOVIN_VACHE_PRIX_MOYEN"), [
    "T51_BOVIN_VACHE_VENDU_D1", "T51_BOVIN_VACHE_VENDU_D2", "T51_BOVIN_VACHE_VENDU_D3",
  ]);
  assert.deepEqual(champsDePonderation("T21_ABAT_BOVIN"), [], "un champ qui n'est pas un prix n'a pas de pondération");
});

// ------------------------------------------------------------------ le texte

test("les champs libres ne sont ni sommés ni moyennés", () => {
  assert.equal(regleDuChamp("T21_LIEUX"), "TEXTE");
  assert.equal(regleDuChamp("T13_OBSERVATIONS"), "TEXTE");
  assert.equal(regleDuChamp("T23_OBSERVATIONS"), "TEXTE");
});

// -------------------------------------------------------- refus, et explication

test("un champ inconnu fait échouer le calcul au lieu de passer en silence", () => {
  assert.throws(() => regleDuChamp("T99_CHAMP_INVENTE"), ChampSansRegleError);
  assert.throws(() => regleDuChamp(""), ChampSansRegleError);
  assert.throws(
    () => regleDuChamp("T99_CHAMP_INVENTE"),
    (e: Error) => /ne laissez JAMAIS/.test(e.message),
    "le message doit dire quoi faire"
  );
});

test("chaque règle porte son motif, affichable au Délégué", () => {
  const r = regleExpliquee("T11_CHEPTEL_BOVIN");
  assert.equal(r.regle, "DERNIERE_VALEUR");
  assert.ok(r.pourquoi.length > 20, "le motif doit être une phrase, pas un code");
  assert.ok(/stock/i.test(r.pourquoi));
});

// ============================================================================
// LE TEST DÉCISIF
// ============================================================================

test("TOUS les champs actifs de la base ont une règle explicite", async () => {
  const champs = await db.formField.findMany({ where: { actif: true }, select: { code: true } });
  assert.ok(champs.length > 300, `base anormalement vide : ${champs.length} champs`);

  const sansRegle = verifierCouverture(champs.map((c) => c.code));

  assert.deepEqual(
    sansRegle.map((c) => c.code),
    [],
    `\n${sansRegle.length} champ(s) du canevas n'ont AUCUNE règle d'agrégation trimestrielle :\n` +
      sansRegle.slice(0, 20).map((c) => `  - ${c.code}`).join("\n") +
      `\n\nAjoutez-les dans src/server/trimestre/reglesChamps.ts.\n`
  );
});

test("la répartition des règles reste cohérente avec le canevas", async () => {
  const champs = await db.formField.findMany({ where: { actif: true }, select: { code: true } });
  const parRegle: Record<string, number> = {};
  for (const c of champs) parRegle[regleDuChamp(c.code)] = (parRegle[regleDuChamp(c.code)] ?? 0) + 1;

  console.log("      répartition :", JSON.stringify(parRegle));
  // Garde-fous grossiers : si l'un de ces nombres s'effondre, une famille de
  // règles a cessé de correspondre et des champs ont basculé ailleurs.
  assert.ok(parRegle.DERNIERE_VALEUR >= 30, "trop peu de stocks — une famille a cessé de correspondre");
  assert.ok(parRegle.SOMME >= 200, "trop peu de flux");
  // 31 prix moyens : 6 bovins + 4 ovins + 4 caprins + 4 porcins + 9 volailles + 4 équidés.
  assert.equal(parRegle.MOYENNE_PONDEREE, 31, "un prix moyen par catégorie commercialisée");
  assert.equal(parRegle.TEXTE, 5);
});

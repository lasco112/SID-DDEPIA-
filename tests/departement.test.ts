/**
 * L'identité du département se compose, et la composition ne change rien.
 *
 * Une trentaine de libellés portaient « Menoua » écrit à la main : en-têtes de
 * documents officiels, messages de relance, métadonnées d'export. Les remplacer
 * par une composition n'est légitime que si la composition redonne EXACTEMENT le
 * même texte — sinon un rapport transmis au MINEPIA change d'intitulé sans que
 * personne ne l'ait demandé.
 *
 * Ce test fige donc les intitulés tels qu'ils étaient écrits avant le lot 15.
 *
 *   node --env-file=.env --import tsx --test tests/departement.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, baseBrute } from "../src/lib/baseDeTravail";
import { composerIdentite, identiteDepartement } from "../src/lib/departement";

/** Recopiés du code AVANT le lot 15, au caractère près. */
const HISTORIQUE = {
  application: "SID DDEPIA-Menoua",
  expediteur: "MINEPIA DDEPIA-Menoua",
  sigle: "DDEPIA-Menoua",
  intituleOfficiel:
    "DÉLÉGATION DÉPARTEMENTALE DE L’ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES DE LA MENOUA",
  intituleCourt: "Délégation Départementale de la Menoua",
  colonneTotal: "TOTAL MENOUA",
  nomCanevas: "MENOUA",
};

const MENOUA = { id: "dep_menoua", code: "MEN", nom: "Menoua", nomAvecArticle: "de la Menoua" };

test("la composition redonne exactement les intitulés écrits en dur", () => {
  const i = composerIdentite(MENOUA);
  for (const [cle, attendu] of Object.entries(HISTORIQUE)) {
    assert.equal((i as any)[cle], attendu, `« ${cle} » ne redonne plus le libellé historique.`);
  }
});

test("l'apostrophe de « L’ÉLEVAGE » est celle du document officiel", () => {
  // Une apostrophe droite au lieu de la typographique passerait inaperçue à
  // l'écran et ferait diverger l'en-tête du canevas papier.
  const i = composerIdentite(MENOUA);
  assert.ok(i.intituleOfficiel.includes("L’ÉLEVAGE"), "L'apostrophe typographique a été perdue.");
  assert.ok(!i.intituleOfficiel.includes("L'ÉLEVAGE"), "Une apostrophe droite s'est glissée dans l'en-tête.");
});

test("l'article vient de la donnée, pas d'une règle", () => {
  // C'est tout l'objet de la colonne : « du Noun », et non « de Noun ».
  const noun = composerIdentite({ id: "x", code: "NOU", nom: "Noun", nomAvecArticle: "du Noun" });
  assert.equal(noun.intituleCourt, "Délégation Départementale du Noun");
  assert.ok(noun.intituleOfficiel.endsWith("DU NOUN"));

  const bamboutos = composerIdentite({ id: "x", code: "BAM", nom: "Bamboutos", nomAvecArticle: "des Bamboutos" });
  assert.ok(bamboutos.intituleOfficiel.endsWith("DES BAMBOUTOS"));
  assert.equal(bamboutos.colonneTotal, "TOTAL BAMBOUTOS");
});

test("sans article renseigné, on se rabat sur « de <nom> » — visible, jamais silencieux", () => {
  const sans = composerIdentite({ id: "x", code: "ZZZ", nom: "Ndé", nomAvecArticle: null });
  assert.equal(sans.nomAvecArticle, "de Ndé");
  assert.equal(sans.intituleCourt, "Délégation Départementale de Ndé");
});

test("l'identité lue en base est celle du département de la session", async () => {
  const i = await identiteDepartement(base);
  assert.equal(i.code, "MEN");
  assert.equal(i.application, HISTORIQUE.application);
  assert.equal(i.intituleOfficiel, HISTORIQUE.intituleOfficiel);
});

test("sans département déclaré, on refuse de nommer le service", async () => {
  // Mieux vaut une erreur qu'un rapport officiel au nom d'un département au hasard.
  await assert.rejects(() => identiteDepartement(baseBrute), /Département introuvable/);
});

after(async () => { await baseBrute.$disconnect(); });

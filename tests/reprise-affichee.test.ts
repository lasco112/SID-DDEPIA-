/**
 * Une case « reprise du mois précédent » doit s'afficher en gris — et le
 * bouton « Confirmer ce tableau » apparaître — dès que le SERVEUR l'a reprise,
 * même si le téléphone avait déjà sa copie (constaté le 1er octobre 2026 : le
 * DA ne voyait ni case grise ni bouton, et ne pouvait plus transmettre).
 *
 *   node --import tsx --test tests/reprise-affichee.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { repriseAffichee } from "../src/lib/repriseAffichee";

test("copie du téléphone identique au serveur : le serveur fait foi", () => {
  assert.equal(repriseAffichee({ statutLocal: "SYNCHRONISE", reporte: false }, { reporte: true }), true);
  assert.equal(repriseAffichee({ statutLocal: "SYNCHRONISE", reporte: true }, { reporte: false }), false);
});

test("case modifiée sur le téléphone, pas encore envoyée : ce n'est plus une reprise", () => {
  for (const statutLocal of ["BROUILLON_LOCAL", "SYNCHRO_EN_ATTENTE", "ERREUR_SYNCHRO"]) {
    assert.equal(repriseAffichee({ statutLocal, reporte: false }, { reporte: true }), false, statutLocal);
  }
});

test("sans réseau : ce que le téléphone sait", () => {
  assert.equal(repriseAffichee({ statutLocal: "SYNCHRONISE", reporte: true }, undefined), true);
  assert.equal(repriseAffichee({ statutLocal: "SYNCHRONISE" }, undefined), false);
});

test("pas de copie sur le téléphone : le serveur", () => {
  assert.equal(repriseAffichee(undefined, { reporte: true }), true);
  assert.equal(repriseAffichee(undefined, undefined), false);
});

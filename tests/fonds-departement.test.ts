/**
 * Les photos des départements : chacun des huit a la sienne, et le fichier
 * existe bien dans public/fonds/ — une photo nommée ici mais absente du
 * dossier donnerait un écran de passage vide chez tout un département.
 *
 *   node --import tsx --test tests/fonds-departement.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { FOND_REGION, fondDepartement } from "../src/lib/fondsDepartement";

const CODES = ["MEN", "BAM", "HNK", "HPL", "KKH", "MIF", "NDE", "NOU"];
const JOUR = 86_400_000;

test("chacun des huit départements a sa propre photo, et le fichier existe", () => {
  for (const code of CODES) {
    const fond = fondDepartement(code);
    assert.notEqual(fond.src, FOND_REGION.src, code);
    assert.ok(existsSync(path.join("public", fond.src)), fond.src);
    assert.ok(fond.legende.length > 0, code);
  }
  assert.ok(existsSync(path.join("public", FOND_REGION.src)));
});

test("la Menoua alterne ses deux photos d'un jour à l'autre", () => {
  const jour1 = fondDepartement("MEN", new Date(20_000 * JOUR));
  const jour2 = fondDepartement("MEN", new Date(20_001 * JOUR));
  assert.notEqual(jour1.src, jour2.src);
  assert.ok(existsSync(path.join("public", jour1.src)));
  assert.ok(existsSync(path.join("public", jour2.src)));
});

test("un département inconnu reçoit la photo de la région", () => {
  assert.equal(fondDepartement("ZZZ"), FOND_REGION);
  assert.equal(fondDepartement(null), FOND_REGION);
});

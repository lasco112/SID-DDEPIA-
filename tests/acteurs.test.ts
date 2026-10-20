/**
 * Les informations structurelles des acteurs du registre (20 octobre 2026) :
 * coordonnées GPS, espèces, jours de marché, équipements — ce qui passe, ce
 * qui est refusé.
 *
 *   node --import tsx --test tests/acteurs.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CODES_ACTEURS, nettoyerInfos } from "../src/lib/acteurs";

test("les neuf types de la liste de référence, les quatre du mensuel en tête", () => {
  assert.equal(CODES_ACTEURS.length, 9);
  assert.deepEqual(CODES_ACTEURS.slice(0, 4), ["ETAB_COUVOIR", "ETAB_FERME_PONTE", "ETAB_FERME_CHAIR", "ETAB_PROVENDERIE"]);
  assert.ok(CODES_ACTEURS.includes("ETAB_MARCHE"));
});

test("coordonnées GPS : virgule acceptée, les deux ou aucune, bornes vérifiées", () => {
  const ok = nettoyerInfos({ latitude: "5,4467", longitude: "10.0533" });
  assert.deepEqual("donnees" in ok && ok.donnees, { latitude: 5.4467, longitude: 10.0533 });
  assert.ok("erreur" in nettoyerInfos({ latitude: "5.4", longitude: "" }));
  assert.ok("erreur" in nettoyerInfos({ latitude: "95", longitude: "10" }));
  assert.ok("erreur" in nettoyerInfos({ latitude: "abc", longitude: "10" }));
  // Effacer les deux : permis.
  const vide = nettoyerInfos({ latitude: "", longitude: "" });
  assert.deepEqual("donnees" in vide && vide.donnees, { latitude: null, longitude: null });
});

test("listes : seuls les codes connus passent, sans doublon", () => {
  const r = nettoyerInfos({ especes: ["BOVINS", "BOVINS", "INCONNU"], joursMarche: ["JEUDI", "jeudi"], infrastructures: ["CLOTURE"] });
  assert.ok("donnees" in r);
  if ("donnees" in r) {
    assert.deepEqual(r.donnees.especes, ["BOVINS"]);
    assert.deepEqual(r.donnees.joursMarche, ["JEUDI"]);
    assert.deepEqual(r.donnees.infrastructures, ["CLOTURE"]);
  }
});

test("un champ absent n'est pas touché", () => {
  const r = nettoyerInfos({ observations: "  gestionnaire : comité  " });
  assert.deepEqual("donnees" in r && r.donnees, { observations: "gestionnaire : comité" });
});

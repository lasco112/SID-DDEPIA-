/**
 * Les garde-fous de l'assistance rédactionnelle.
 *
 * Ces tests s'écrivent AVANT qu'un modèle soit branché, et c'est le but : les
 * barrières se posent avant la machine. Ils simulent des réponses de modèle, y
 * compris celles qu'on redoute — un chiffre inventé, un jugement non demandé,
 * un constat important passé sous silence.
 *
 * L'invariant qu'ils protègent est le deuxième du projet : « Aucun LLM ne
 * produit un chiffre officiel. » Il ne doit pas reposer sur une consigne donnée
 * au modèle, mais sur une propriété du code.
 *
 *   node --import tsx --test tests/garde-fous-ia.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  preparerFaits,
  controlerEtSubstituer,
  texteDeRepli,
} from "../src/server/redaction/gardeFous";
import type { Fait } from "../src/server/trimestre/faits";

const fait = (n: number, importance: number, libelle: string, phrase: string): Fait => ({
  fieldCode: `T${n}`,
  libelle,
  type: "EVOLUTION",
  importance,
  phrase,
  calcul: "calcul de contrôle",
});

const FAITS: Fait[] = [
  fait(1, 0.9, "Œufs produits", "La production d'œufs s'établit à 128 400 unités, en progression de +12,0 % sur un an."),
  fait(2, 0.8, "Abattages contrôlés", "Les abattages contrôlés atteignent 3 412 têtes."),
  fait(3, 0.2, "Étangs", "Le département compte 47 étangs."),
];

/** Une proposition de modèle bien élevée : que des jetons, aucun chiffre. */
const BONNE = "{{F1.phrase}} {{F2.phrase}}";

test("une proposition bien formée est retenue et substituée", () => {
  const p = preparerFaits(FAITS);
  const r = controlerEtSubstituer(BONNE, p, FAITS);

  assert.equal(r.retenu, true, r.explication);
  assert.ok(r.texte.includes("128 400"), "La valeur n'a pas été substituée.");
  assert.ok(!r.texte.includes("{{"), "Un jeton est resté dans le texte final.");
});

test("un chiffre écrit par le modèle fait REJETER la proposition", () => {
  // Le cas qui doit être impossible : le modèle « améliore » un chiffre.
  const p = preparerFaits(FAITS);
  const r = controlerEtSubstituer("{{F1.phrase}} Le total atteint 5 000 têtes. {{F2.phrase}}", p, FAITS);

  assert.equal(r.retenu, false);
  assert.equal(r.motif, "CHIFFRE_NON_SUBSTITUE");
  assert.equal(r.texte, texteDeRepli(FAITS), "Le repli doit être le texte du moteur de règles.");
  assert.ok(r.explication?.includes("Seul le SID produit un chiffre"));
});

test("un chiffre isolé, même vraisemblable, est rejeté", () => {
  // Vraisemblable est pire qu'absurde : personne ne le relèvera à la lecture.
  const p = preparerFaits(FAITS);
  const r = controlerEtSubstituer("{{F1.phrase}} {{F2.phrase}} soit 12 % de plus.", p, FAITS);
  assert.equal(r.motif, "CHIFFRE_NON_SUBSTITUE");
});

test("un jeton inventé fait rejeter la proposition", () => {
  const p = preparerFaits(FAITS);
  const r = controlerEtSubstituer("{{F1.phrase}} {{F2.phrase}} {{F9.valeur}}", p, FAITS);

  assert.equal(r.motif, "JETON_INCONNU");
  assert.ok(r.explication?.includes("{{F9.valeur}}"));
});

test("un jugement non autorisé fait rejeter la proposition", () => {
  // Le faux QUALITATIF : aucune erreur de chiffre, une affirmation officielle
  // que personne n'a validée.
  const p = preparerFaits(FAITS);
  const r = controlerEtSubstituer("{{F1.phrase}} {{F2.phrase}} La situation est préoccupante.", p, FAITS);

  assert.equal(r.motif, "LEXIQUE_NON_AUTORISE");
  assert.ok(r.explication?.includes("préoccupante"));
});

test("le vocabulaire autorisé, lui, passe", () => {
  const p = preparerFaits(FAITS);
  const r = controlerEtSubstituer("{{F1.phrase}} {{F2.phrase}} La tendance reste stable.", p, FAITS);
  assert.equal(r.retenu, true, r.explication);
});

test("taire un constat important fait rejeter la proposition", () => {
  // L'omission est le risque le plus sous-estimé : un texte sans erreur qui
  // passe sous silence le seul tableau qui compte est indétectable.
  const p = preparerFaits(FAITS);
  const r = controlerEtSubstituer("{{F1.phrase}}", p, FAITS); // F2 est important et absent

  assert.equal(r.motif, "COUVERTURE_INSUFFISANTE");
  assert.ok(r.explication?.includes("Abattages contrôlés"));
});

test("un constat mineur peut être tu sans faire rejeter", () => {
  const p = preparerFaits(FAITS);
  const r = controlerEtSubstituer(BONNE, p, FAITS); // F3, importance 0,2, est absent
  assert.equal(r.retenu, true, r.explication);
});

test("une réponse vide bascule sur le moteur de règles", () => {
  const p = preparerFaits(FAITS);
  const r = controlerEtSubstituer("   ", p, FAITS);
  assert.equal(r.motif, "TEXTE_VIDE");
  assert.equal(r.texte, texteDeRepli(FAITS));
});

test("le Délégué n'est JAMAIS laissé sans texte", () => {
  // Quel que soit le motif de rejet, il reste un texte exact et sourcé.
  const p = preparerFaits(FAITS);
  for (const mauvaise of ["", "12345", "{{F9.x}}", "C'est catastrophique.", "{{F1.phrase}}"]) {
    const r = controlerEtSubstituer(mauvaise, p, FAITS);
    assert.ok(r.texte.length > 0, `Aucun texte rendu pour « ${mauvaise} ».`);
    if (!r.retenu) assert.equal(r.texte, texteDeRepli(FAITS));
  }
});

test("les faits préparés ne contiennent aucun chiffre en clair côté invite", () => {
  // Ce que le modèle REÇOIT ne doit porter aucune valeur qu'il puisse réécrire.
  const p = preparerFaits(FAITS);
  for (const j of Array.from(p.substitutions.keys())) {
    assert.ok(/^\{\{F\d+\.\w+\}\}$/.test(j), `Jeton mal formé : ${j}`);
  }
  assert.deepEqual(p.obligatoires, ["F1", "F2"], "Le seuil de couverture ne retient pas les bons faits.");
});

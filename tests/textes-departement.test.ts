/**
 * Les textes permanents d'un département (lot D, décision du Délégué du
 * 14 octobre 2026) : rédigés par son DD — ou par l'administrateur du système —
 * et repris dans son rapport trimestriel, sans jamais déborder sur un autre.
 *
 * Écrit dans le Noun (préparé, éteint), puis efface tout à la fin.
 *
 *   node --env-file=.env --import tsx --test tests/textes-departement.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { baseBrute, base } from "../src/lib/baseDeTravail";
import { clientCloisonne } from "../src/lib/dbCloisonne";
import { TEXTES_FIXES } from "../src/server/trimestre/canevas/textesFixes";
import { TEXTES_ARRONDISSEMENTS } from "../src/server/trimestre/canevas/textesArrondissements";
import { ecrireTextePermanent, textesDuDepartement, textesDeLArrondissement, TexteRefuse } from "../src/server/trimestre/textesDepartement";
import { genererRapportCanevas } from "../src/server/trimestre/rapportCanevas";
import { trimestrielle } from "../src/server/periodes/calendrier";

const NOUN = clientCloisonne(baseBrute, "dep_noun");
const AUTEUR = "usr_dd_noun";
const RELIEF_NOUN = "Le département du Noun s'étend sur le plateau bamoun, entre le Mbam et le Noun (texte d'essai).";

after(async () => {
  await NOUN.texteDepartement.deleteMany({});
  await NOUN.auditLog.deleteMany({ where: { action: "TEXTE_PERMANENT" } });
  await baseBrute.$disconnect();
  await base.$disconnect();
});

test("la Menoua garde exactement ses textes de référence tant que rien n'est écrit", async () => {
  assert.equal(await base.texteDepartement.count(), 0, "aucun texte écrit pour la Menoua dans cette base");
  assert.deepEqual(Array.from(await textesDuDepartement(base, "MEN")), Array.from(TEXTES_FIXES).filter(([, t]) => t.trim()));
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true, nom: true } });
  assert.deepEqual(Object.fromEntries(await textesDeLArrondissement(base, "MEN", dschang)), TEXTES_ARRONDISSEMENTS.get("Dschang"));
});

test("un nouveau département part de zéro : aucun texte de la Menoua", async () => {
  assert.equal((await textesDuDepartement(NOUN, "NOU")).size, 0);
});

test("le texte écrit pour le Noun entre dans SON rapport, et nulle part ailleurs", async () => {
  assert.equal(await ecrireTextePermanent(NOUN, "", "I.geo.relief", RELIEF_NOUN, AUTEUR), "ecrit");
  assert.equal((await textesDuDepartement(NOUN, "NOU")).get("I.geo.relief"), RELIEF_NOUN);
  assert.ok(!(await textesDuDepartement(base, "MEN")).get("I.geo.relief")?.includes("plateau bamoun"), "la Menoua n'en voit rien");

  const r = await genererRapportCanevas(NOUN, trimestrielle(2026, 3), { autoriserIncomplet: true, circuitIncomplet: "essai" });
  const xml = new PizZip(r.buffer).file("word/document.xml")!.asText();
  assert.ok(xml.includes("plateau bamoun"), "le texte du DD est dans le rapport du Noun");
  assert.ok(!xml.includes("Menoua"), "aucun texte de la Menoua dans le rapport du Noun");
});

test("un texte d'arrondissement ne vaut que pour cet arrondissement", async () => {
  const foumban = await NOUN.arrondissement.findFirstOrThrow({ where: { nom: "Foumban" }, select: { id: true, nom: true } });
  await ecrireTextePermanent(NOUN, foumban.id, "I1.missions", "Missions de la DAEPIA de Foumban (essai).", AUTEUR);
  assert.equal((await textesDeLArrondissement(NOUN, "NOU", foumban)).get("I1.missions"), "Missions de la DAEPIA de Foumban (essai).");
  assert.equal((await textesDuDepartement(NOUN, "NOU")).get("I1.missions"), undefined);
});

test("refus : zone inconnue, arrondissement d'un autre département", async () => {
  await assert.rejects(() => ecrireTextePermanent(NOUN, "", "II.inexistante", "x", AUTEUR), TexteRefuse);
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true } });
  await assert.rejects(() => ecrireTextePermanent(NOUN, dschang.id, "I1.missions", "intrusion", AUTEUR), TexteRefuse);
});

test("effacer rend la zone vide (pas de référence hors Menoua)", async () => {
  assert.equal(await ecrireTextePermanent(NOUN, "", "I.geo.relief", "  ", AUTEUR), "efface");
  assert.equal((await textesDuDepartement(NOUN, "NOU")).get("I.geo.relief"), undefined);
});

/**
 * Les ordres de correction du DD aux chefs de section (20 octobre 2026) :
 * sans ordre, un chef ne modifie pas une case remplie par un arrondissement ;
 * avec l'ordre, il la corrige ; la révocation referme ; l'ordre lève la
 * validation du domaine. Le BAC suit la même règle pour les colonnes des
 * arrondissements.
 *
 *   node --env-file=.env --import tsx --test tests/ordres-correction.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { ecrireSaisieCanevas } from "../src/server/trimestre/saisieCanevas";
import { refusDeSaisie, refusCorrectionAnPasse, chefDuTableau, grille } from "../src/server/trimestre/saisieTrimestrielle";
import { etatCircuit, validerSection, transmettreParLeDD } from "../src/server/trimestre/circuit";
import { donnerOrdreCorrection, revoquerOrdreCorrection, ordresEnCours, ACTION_ORDRE, ACTION_REVOCATION } from "../src/server/trimestre/ordresCorrection";

const P = trimestrielle(2034, 1);
const N1 = "TOTAL T1 2033";
let periodeId: string | null = null;
const debut = new Date();

after(async () => {
  await new Promise((r) => setTimeout(r, 2000)); // notifications vers les téléphones, en arrière-plan
  if (periodeId) {
    await base.saisieCanevas.deleteMany({ where: { periodeId } });
    await base.circuitTrimestre.deleteMany({ where: { periodeId } });
    await base.periodeReporting.delete({ where: { id: periodeId } }).catch(() => {});
  }
  await base.auditLog.deleteMany({ where: { action: { in: [ACTION_ORDRE, ACTION_REVOCATION] }, entiteId: "2034-1" } });
  await base.notification.deleteMany({ where: { declencheur: { in: [ACTION_ORDRE, ACTION_REVOCATION, "TRANSMISSION_TRIMESTRE_PAR_DD"] }, createdAt: { gt: debut } } });
  await base.$disconnect();
});

test("sans ordre le chef ne corrige pas l'arrondissement ; avec l'ordre oui ; révoqué, non", async () => {
  periodeId = await periodeTrimestrielle(base, P);
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true } });
  const da = await base.user.findFirstOrThrow({ where: { role: "DA", arrondissementId: dschang.id }, select: { id: true } });
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const chef = chefDuTableau(41)!;
  const section = chef.replace("CHEF_", "");

  // Le DA a rempli sa viande (2034) et son an passé.
  await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 41, ligne: "Dschang", colonne: "Viande" }, { valeur: 12 }, da.id);
  await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 41, ligne: "Dschang", colonne: N1 }, { valeur: 30 }, da.id);

  // Sans ordre : refus, en 2034 comme pour l'an passé, et la case est « à signaler ».
  assert.match((await refusDeSaisie(base, P, { role: chef }, 41, "Dschang", "Viande")) ?? "", /ordre du Délégué/);
  assert.match((await refusCorrectionAnPasse(base, P, { role: chef }, 41, "Dschang", N1)) ?? "", /ordre du Délégué/);
  const sansOrdre = await grille(base, P, { role: chef }, 41);
  assert.equal(sansOrdre!.ordreCorrection, false);
  assert.equal(sansOrdre!.lignes.find((l) => l.libelle === "Dschang")!.cases.find((c) => c.colonne === "Viande")!.reservee, true);
  // Une case encore vide se complète toujours sans ordre.
  assert.equal(await refusDeSaisie(base, P, { role: chef }, 41, "Fokoué", "Viande"), null);

  // L'ordre : le chef corrige.
  await donnerOrdreCorrection(base, transaction, periodeId, P, section, "Revoir la viande de Dschang", dd.id);
  assert.ok((await ordresEnCours(base, P)).has(chef));
  assert.equal(await refusDeSaisie(base, P, { role: chef }, 41, "Dschang", "Viande"), null);
  assert.equal(await refusCorrectionAnPasse(base, P, { role: chef }, 41, "Dschang", N1), null);
  const avecOrdre = await grille(base, P, { role: chef }, 41);
  assert.equal(avecOrdre!.ordreCorrection, true);
  assert.notEqual(avecOrdre!.lignes.find((l) => l.libelle === "Dschang")!.cases.find((c) => c.colonne === "Viande")!.reservee, true);
  // Un autre chef n'en profite pas.
  const autre = ["CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"].find((r) => r !== chef)!;
  assert.equal((await ordresEnCours(base, P)).has(autre), false);

  // Révoqué : refermé.
  await revoquerOrdreCorrection(base, P, section, dd.id);
  assert.match((await refusDeSaisie(base, P, { role: chef }, 41, "Dschang", "Viande")) ?? "", /ordre du Délégué/);
  await assert.rejects(revoquerOrdreCorrection(base, P, section, dd.id), /Aucun ordre/);
});

test("l'ordre lève la validation du domaine", async () => {
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const chef = chefDuTableau(41)!;
  const section = chef.replace("CHEF_", "");
  // Tous les arrondissements transmis (par le DD), puis le chef valide.
  for (const a of (await etatCircuit(base, P)).arrondissements) {
    if (a.statut !== "TRANSMIS") await transmettreParLeDD(base, transaction, periodeId!, P, a.id, "essai", dd.id);
  }
  const chefUser = await base.user.findFirst({ where: { role: chef as never }, select: { id: true } });
  await validerSection(base, transaction, periodeId!, P, chef, chefUser?.id ?? dd.id);
  assert.equal((await etatCircuit(base, P)).sections.find((s) => s.code === section)!.statut, "VALIDE");

  const r = await donnerOrdreCorrection(base, transaction, periodeId!, P, section, "Deuxième relecture", dd.id);
  assert.equal(r.validationAnnulee, true);
  assert.notEqual((await etatCircuit(base, P)).sections.find((s) => s.code === section)!.statut, "VALIDE");
  await revoquerOrdreCorrection(base, P, section, dd.id);
});

test("le chef BAC garde sa liberté : il corrige la colonne d'un arrondissement sans ordre", async () => {
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true } });
  const da = await base.user.findFirstOrThrow({ where: { role: "DA", arrondissementId: dschang.id }, select: { id: true } });
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  // Recettes (n° 13) : Dschang a rempli sa colonne de janvier.
  await ecrireSaisieCanevas(base, transaction, periodeId!, { numeroTableau: 13, ligne: "JANVIER", colonne: "Dschang" }, { valeur: 5000 }, da.id);
  assert.equal(await refusDeSaisie(base, P, { role: "CHEF_BAC" }, 13, "JANVIER", "Dschang"), null);
  assert.equal(await refusDeSaisie(base, P, { role: "CHEF_BAC" }, 13, "JANVIER", "DDEPIA"), null);
  // Aucun ordre n'est donné au BAC : il n'en a pas besoin.
  await assert.rejects(donnerOrdreCorrection(base, transaction, periodeId!, P, "BAC", "inutile", dd.id), /librement/);
});
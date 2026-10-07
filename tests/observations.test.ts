/**
 * Les observations d'un chef de section sur une donnée précise (demande du
 * Délégué, 7 octobre 2026) : à traiter par le DA tant qu'il n'a ni corrigé la
 * case ni répondu ; à relire par le chef ensuite ; réglée une fois close.
 *
 * Sur une donnée existante de la base locale, SANS la modifier : seules des
 * lignes de journal sont créées, puis supprimées.
 *
 *   node --import tsx --test tests/observations.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { observationsDes, aTraiterParLeDA, aRelireParLAuteur, type DetailsObservation } from "../src/server/observations";

const crees: string[] = [];
after(async () => {
  await base.auditLog.deleteMany({ where: { id: { in: crees } } });
  await base.auditLog.deleteMany({ where: { entite: "Observation", entiteId: { in: crees } } });
  await base.$disconnect();
});

async function uneDonnee() {
  const s = await base.saisieMatrice.findFirst({
    include: { field: { include: { template: true } } },
    orderBy: { syncedAt: "desc" },
  });
  assert.ok(s, "il faut au moins une donnée envoyée dans la base locale");
  return s!;
}

function details(s: Awaited<ReturnType<typeof uneDonnee>>): DetailsObservation {
  return {
    famille: "MATRICE", saisieId: s.id, templateCode: s.field.template.code, numero: s.field.template.numero, titre: s.field.template.titre,
    fieldCode: s.fieldCode, etablissementId: null, clientId: null, libelle: s.field.libelle, valeur: String(s.valeur ?? ""),
    texte: "Le nombre n'est pas correct.", auteurNom: "test", auteurRole: "CHEF_SSV",
  };
}

test("une observation est à traiter par le DA, puis à relire par le chef après sa réponse, puis close", async () => {
  const s = await uneDonnee();
  const o = await base.auditLog.create({
    data: { action: "OBSERVATION", entite: "RapportArrondissement", entiteId: s.rapportId, details: details(s) as object },
  });
  crees.push(o.id);

  let [obs] = (await observationsDes(base, [s.rapportId])).filter((x) => x.id === o.id);
  assert.ok(obs, "l'observation est lue");
  assert.equal(obs.corrigee, false, "la case n'a pas bougé depuis");
  assert.equal(aTraiterParLeDA(obs), true);
  assert.equal(aRelireParLAuteur(obs), false);

  const r = await base.auditLog.create({ data: { action: "OBSERVATION_REPONSE", entite: "Observation", entiteId: o.id, details: { texte: "Le chiffre est juste." } } });
  [obs] = (await observationsDes(base, [s.rapportId])).filter((x) => x.id === o.id);
  assert.equal(obs.reponse?.texte, "Le chiffre est juste.");
  assert.equal(aTraiterParLeDA(obs), false, "répondue : plus rien à faire pour le DA");
  assert.equal(aRelireParLAuteur(obs), true, "le chef lit la réponse");

  await base.auditLog.create({ data: { action: "OBSERVATION_CLOSE", entite: "Observation", entiteId: o.id } });
  [obs] = (await observationsDes(base, [s.rapportId])).filter((x) => x.id === o.id);
  assert.equal(aRelireParLAuteur(obs), false, "close");
  void r;
});

test("une observation antérieure au dernier envoi de la case est réglée (le DA l'a renvoyée)", async () => {
  const s = await uneDonnee();
  const avant = new Date(s.syncedAt.getTime() - 60_000);
  const o = await base.auditLog.create({
    data: { action: "OBSERVATION", entite: "RapportArrondissement", entiteId: s.rapportId, details: details(s) as object, createdAt: avant },
  });
  crees.push(o.id);
  const [obs] = (await observationsDes(base, [s.rapportId])).filter((x) => x.id === o.id);
  assert.equal(obs.corrigee, true);
  assert.equal(aTraiterParLeDA(obs), false);
  assert.equal(aRelireParLAuteur(obs), true, "le chef voit que c'est corrigé, et peut clore");
});

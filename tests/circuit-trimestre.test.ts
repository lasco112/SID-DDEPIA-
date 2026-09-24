/**
 * Le circuit de validation du trimestre : agent → DA → chefs de section → DD.
 *
 * Le protocole scripts/verifier-protocole.ts l'éprouve sur l'application qui
 * tourne, rôle par rôle ; ce test en garde les règles sans serveur.
 * Écrit sur un trimestre lointain (T3 2031), supprimé à la fin.
 *
 *   node --env-file=.env --import tsx --test tests/circuit-trimestre.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import {
  etatCircuit, transmettre, renvoyer, validerSection, motifDeVerrou, RefusCircuit, messageIncomplet,
} from "../src/server/trimestre/circuit";

const P = trimestrielle(2031, 3);
let periodeId: string | null = null;

after(async () => {
  if (periodeId) {
    await base.circuitTrimestre.deleteMany({ where: { periodeId } });
    await base.periodeReporting.delete({ where: { id: periodeId } }).catch(() => {});
  }
  await base.$disconnect();
});

test("le circuit, de l'agent au DD — et le renvoi", async () => {
  periodeId = await periodeTrimestrielle(base, P);
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const arrondissements = await base.arrondissement.findMany({ select: { id: true, nom: true } });
  const [premier] = arrondissements;

  // Au départ : rien de transmis, rien de figé, pas de définitif.
  let etat = await etatCircuit(base, P);
  assert.equal(etat.complet, false);
  assert.ok(etat.sections.every((s) => s.statut === "EN_ATTENTE"));
  assert.equal(await motifDeVerrou(base, P, { role: "AGENT_SAISIE", arrondissementId: premier.id }), null);

  // Un chef ne valide pas tant que les six n'ont pas transmis.
  await assert.rejects(validerSection(base, transaction, periodeId, P, "CHEF_PSA", dd.id), RefusCircuit);

  // Le DA transmet : son rapport est figé, pour lui comme pour ses agents.
  await transmettre(base, transaction, periodeId, P, premier.id, dd.id);
  await assert.rejects(transmettre(base, transaction, periodeId, P, premier.id, dd.id), RefusCircuit);
  assert.match((await motifDeVerrou(base, P, { role: "AGENT_SAISIE", arrondissementId: premier.id })) ?? "", /transmis/);
  assert.match((await motifDeVerrou(base, P, { role: "DA", arrondissementId: premier.id })) ?? "", /transmis/);
  // Le voisin, lui, n'est pas figé.
  assert.equal(await motifDeVerrou(base, P, { role: "DA", arrondissementId: arrondissements[1].id }), null);

  for (const a of arrondissements.slice(1)) await transmettre(base, transaction, periodeId, P, a.id, dd.id);
  etat = await etatCircuit(base, P);
  assert.ok(etat.tousTransmis);
  assert.ok(etat.sections.every((s) => s.statut === "A_VALIDER"));
  assert.match(messageIncomplet(etat), /domaine non validé : BAC, PSA, SPAIH, SSV/);

  for (const chef of ["CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"]) await validerSection(base, transaction, periodeId, P, chef, dd.id);
  etat = await etatCircuit(base, P);
  assert.ok(etat.complet, "six transmis et quatre domaines validés : le DD produit le définitif");
  assert.match((await motifDeVerrou(base, P, { role: "CHEF_PSA" })) ?? "", /validé/);
  // Le DD n'est jamais bloqué.
  assert.equal(await motifDeVerrou(base, P, { role: "DD" }), null);

  // Renvoi : motif obligatoire ; le rapport rouvre ; les validations tombent.
  await assert.rejects(renvoyer(base, transaction, periodeId, P, premier.id, "  ", dd.id), RefusCircuit);
  await renvoyer(base, transaction, periodeId, P, premier.id, "Tableau 14 à revoir.", dd.id);
  etat = await etatCircuit(base, P);
  const sien = etat.arrondissements.find((a) => a.id === premier.id)!;
  assert.equal(sien.statut, "RENVOYE");
  assert.equal(sien.motif, "Tableau 14 à revoir.");
  assert.equal(etat.complet, false);
  assert.ok(etat.sections.every((s) => s.statut === "EN_ATTENTE"));
  assert.equal(await motifDeVerrou(base, P, { role: "AGENT_SAISIE", arrondissementId: premier.id }), null);
});

test("le DD prend le relais d'un DA ou d'un chef défaillant — motif obligatoire, étape marquée", async () => {
  const { transmettreParLeDD, validerSectionParLeDD, finaliserParLeDD } = await import("../src/server/trimestre/circuit");
  const P2 = trimestrielle(2031, 4);
  const pid = await periodeTrimestrielle(base, P2);
  try {
    const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
    const [a] = await base.arrondissement.findMany({ select: { id: true }, take: 1 });

    await assert.rejects(transmettreParLeDD(base, transaction, pid, P2, a.id, " ", dd.id), RefusCircuit, "sans motif");
    await transmettreParLeDD(base, transaction, pid, P2, a.id, "DA absent.", dd.id);
    let etat = await etatCircuit(base, P2);
    const sien = etat.arrondissements.find((x) => x.id === a.id)!;
    assert.equal(sien.statut, "TRANSMIS");
    assert.equal(sien.parLeDD, true);
    assert.equal(sien.motif, "DA absent.");

    // Le DD valide un domaine sans attendre les six : c'est sa responsabilité.
    await validerSectionParLeDD(base, transaction, pid, "SSV", "Chef en mission.", dd.id);
    etat = await etatCircuit(base, P2);
    assert.deepEqual(
      etat.sections.find((s) => s.code === "SSV"),
      { ...etat.sections.find((s) => s.code === "SSV")!, statut: "VALIDE", parLeDD: true, motif: "Chef en mission." }
    );

    // Finaliser : tout ce qui reste, d'un coup, au nom du DD.
    const franchi = await finaliserParLeDD(base, transaction, pid, P2, "Délais dépassés.", dd.id);
    assert.equal(franchi.arrondissements.length, 5);
    assert.deepEqual(franchi.sections.sort(), ["BAC", "PSA", "SPAIH"]);
    etat = await etatCircuit(base, P2);
    assert.ok(etat.complet);
    // Ce que le DA a transmis lui-même ne serait pas marqué ; ici, tout l'est.
    assert.ok(etat.arrondissements.every((x) => x.parLeDD));
    // Les DA et les chefs concernés sont prévenus.
    const notes = await base.notification.count({ where: { declencheur: { in: ["TRANSMISSION_TRIMESTRE_PAR_DD", "VALIDATION_TRIMESTRE_PAR_DD"] }, sentAt: { gte: new Date(Date.now() - 60_000) } } });
    assert.ok(notes > 0, "notifications envoyées");
  } finally {
    await base.circuitTrimestre.deleteMany({ where: { periodeId: pid } });
    await base.notification.deleteMany({ where: { declencheur: { in: ["TRANSMISSION_TRIMESTRE_PAR_DD", "VALIDATION_TRIMESTRE_PAR_DD"] } } });
    await base.periodeReporting.delete({ where: { id: pid } }).catch(() => {});
  }
});

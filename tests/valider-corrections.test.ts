/**
 * Après un renvoi, le DD valide lui-même les corrections du DA et le rapport,
 * sans attendre que le DA le retransmette (décision du Délégué, 20 octobre 2026).
 *
 *   node --env-file=.env --import tsx --test tests/valider-corrections.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import {
  etatCircuit, transmettre, renvoyer, validerCorrectionsParLeDD, correctionsDepuisRenvoi, RefusCircuit, MOTIF_CORRECTIONS_VALIDEES,
} from "../src/server/trimestre/circuit";

const P = trimestrielle(2033, 1);
let periodeId: string | null = null;
const journal: string[] = [];

after(async () => {
  // Les notifications partent aussi vers les téléphones, en arrière-plan : on
  // les laisse finir avant de fermer la base.
  await new Promise((r) => setTimeout(r, 2000));
  if (periodeId) {
    await base.circuitTrimestre.deleteMany({ where: { periodeId } });
    await base.periodeReporting.delete({ where: { id: periodeId } }).catch(() => {});
  }
  await base.auditLog.deleteMany({ where: { id: { in: journal } } });
  await base.notification.deleteMany({ where: { declencheur: { in: ["CORRECTIONS_VALIDEES_PAR_DD", "RENVOI_TRIMESTRE"] }, createdAt: { gt: debut } } });
  await base.$disconnect();
});
const debut = new Date();

test("le DD valide les corrections d'un rapport renvoyé ; le rapport passe transmis", async () => {
  periodeId = await periodeTrimestrielle(base, P);
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true } });
  const da = await base.user.findFirstOrThrow({ where: { role: "DA", arrondissementId: dschang.id }, select: { id: true } });
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });

  // Pas encore renvoyé : la validation des corrections est refusée.
  await assert.rejects(validerCorrectionsParLeDD(base, transaction, periodeId, P, dschang.id, "", dd.id), RefusCircuit);

  await transmettre(base, transaction, periodeId, P, dschang.id, da.id);
  await renvoyer(base, transaction, periodeId, P, dschang.id, "Revoir le tableau 41", dd.id);
  const renvoye = (await etatCircuit(base, P)).arrondissements.find((a) => a.id === dschang.id)!;
  assert.equal(renvoye.statut, "RENVOYE");

  // Le DA corrige une case après le renvoi : le DD le voit.
  await new Promise((r) => setTimeout(r, 20));
  const l = await base.auditLog.create({
    data: { userId: da.id, action: "SAISIE_TRIMESTRIELLE", entite: "SaisieCanevas", entiteId: "essai", details: { numeroTableau: 41, ligne: "Dschang", colonne: "Viande", annee: P.annee, trimestre: P.rang } },
  });
  journal.push(l.id);
  const c = await correctionsDepuisRenvoi(base, P, dschang.id, new Date(renvoye.date!));
  assert.deepEqual(c, { cases: 1, tableaux: [41] });

  // Le DD juge les corrections bonnes.
  await validerCorrectionsParLeDD(base, transaction, periodeId, P, dschang.id, "Merci", dd.id);
  const apres = (await etatCircuit(base, P)).arrondissements.find((a) => a.id === dschang.id)!;
  assert.equal(apres.statut, "TRANSMIS");
  assert.equal(apres.parLeDD, true);
  assert.equal(apres.motif, `${MOTIF_CORRECTIONS_VALIDEES} Merci`);

  // Déjà transmis : on ne valide pas deux fois.
  await assert.rejects(validerCorrectionsParLeDD(base, transaction, periodeId, P, dschang.id, "", dd.id), /déjà transmis/);
});

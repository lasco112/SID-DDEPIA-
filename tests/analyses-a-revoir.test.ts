/**
 * Une analyse validée dont un chiffre change ensuite repasse « à revoir » —
 * même si le texte recalculé ne bouge pas — et doit être reprise et
 * revalidée avant de transmettre, de valider le domaine ou de produire la
 * version définitive (décision du Délégué, 20 octobre 2026).
 *
 *   node --env-file=.env --import tsx --test tests/analyses-a-revoir.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { ecrireSaisieCanevas } from "../src/server/trimestre/saisieCanevas";
import { validerAnalyse } from "../src/server/trimestre/analyse/analyses";
import { analysesARevoir, propositionsPour, messageAnalysesARevoir } from "../src/server/trimestre/analyse/ecranAnalyses";

const P = trimestrielle(2035, 1);
const DA = { role: "DA", arrondissement: "Dschang" };
let periodeId: string | null = null;

after(async () => {
  if (periodeId) {
    await base.analyseCanevas.deleteMany({ where: { periodeId } });
    await base.saisieCanevas.deleteMany({ where: { periodeId } });
    await base.periodeReporting.delete({ where: { id: periodeId } }).catch(() => {});
  }
  await base.$disconnect();
});

test("un chiffre corrigé après validation remet l'analyse à revoir, jusqu'à revalidation", async () => {
  periodeId = await periodeTrimestrielle(base, P);
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true } });
  const da = await base.user.findFirstOrThrow({ where: { role: "DA", arrondissementId: dschang.id }, select: { id: true } });
  const ecrire = (valeur: number) =>
    ecrireSaisieCanevas(base, transaction, periodeId!, { numeroTableau: 41, ligne: "Dschang", colonne: "Viande" }, { valeur }, da.id);

  await ecrire(12);
  const valider = async () => {
    const p = (await propositionsPour(base, P, DA)).find((x) => x.numero === 41)!;
    await validerAnalyse(transaction, periodeId!, dschang.id, 41, { texteCalcule: p.texte, texte: p.texte, explication: "Hausse des ventes." }, da.id);
    // La même analyse validée au rapport départemental.
    await validerAnalyse(transaction, periodeId!, "", 41, { texteCalcule: p.texte, texte: p.texte, explication: null }, da.id);
  };
  await valider();
  assert.deepEqual(await analysesARevoir(base, P, DA), []);

  // Réécrire le MÊME chiffre ne change rien.
  await ecrire(12);
  assert.deepEqual(await analysesARevoir(base, P, DA), []);

  // Un chiffre CHANGÉ : à revoir, au rapport de l'arrondissement comme au département ;
  // le texte et l'explication validés sont gardés, pour être repris.
  await ecrire(15);
  assert.deepEqual((await analysesARevoir(base, P, DA)).map((a) => a.numero), [41]);
  const lignes = await base.analyseCanevas.findMany({ where: { periodeId, numeroTableau: 41 }, select: { portee: true, texteCalcule: true, explication: true } });
  assert.equal(lignes.length, 2);
  assert.ok(lignes.every((l) => l.texteCalcule === ""));
  assert.equal(lignes.find((l) => l.portee === dschang.id)!.explication, "Hausse des ventes.");
  assert.match(messageAnalysesARevoir([{ numero: 41, titre: "x" }]), /n° 41[\s\S]*validez-le à nouveau/);

  // Revalidée : plus rien à revoir.
  await valider();
  assert.deepEqual(await analysesARevoir(base, P, DA), []);
});

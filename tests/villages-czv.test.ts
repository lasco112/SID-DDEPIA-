/**
 * Les CZV et villages de l'Ouest (découpage MINEPIA, 4 novembre 2026) et leur
 * contrôle à l'enregistrement d'un établissement.
 *
 *   node --env-file=.env --import tsx --test tests/villages-czv.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { baseBrute, base } from "../src/lib/baseDeTravail";
import { transactionCloisonnee } from "../src/lib/dbCloisonne";
import { preparerLocalisation } from "../src/server/etablissements/localisation";

const BAM = "dep_bamboutos";
const dansBam = <T>(f: (tx: Parameters<typeof preparerLocalisation>[0]) => Promise<T>) => transactionCloisonnee(baseBrute, BAM, (tx) => f(tx));

after(async () => {
  await baseBrute.$disconnect();
  await base.$disconnect();
});

test("la liste produite couvre les 40 arrondissements de l'Ouest : 71 CZV, 1 122 villages", async () => {
  const liste = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "referentiels", "villages_czv_ouest_2026.json"), "utf8")) as { arrondissement: string; villages: string[] }[];
  assert.equal(liste.length, 71);
  assert.equal(liste.reduce((n, c) => n + c.villages.length, 0), 1122);
  assert.equal(new Set(liste.map((c) => c.arrondissement)).size, 40);
  // Et chaque arrondissement de la base a ses CZV.
  for (const d of await baseBrute.departement.findMany({ select: { id: true, code: true } })) {
    const sansCzv = await transactionCloisonnee(baseBrute, d.id, (tx) => tx.arrondissement.findMany({ where: { centres: { none: {} } }, select: { nom: true } }));
    assert.deepEqual(sansCzv, [], `${d.code} : arrondissement(s) sans CZV`);
  }
});

test("un village de la liste : la localité prend son nom, le CZV se déduit", async () => {
  const galim = await dansBam((tx) => tx.centreZootechnique.findFirstOrThrow({ where: { nom: "CZV Galim" }, select: { id: true, arrondissementId: true } }));
  const village = await dansBam((tx) => tx.village.findFirstOrThrow({ where: { centreId: galim.id, nom: "Mengoh" }, select: { id: true } }));
  const r = await dansBam((tx) => preparerLocalisation(tx, { villageId: village.id }, galim.arrondissementId));
  assert.deepEqual(r, { data: { centreId: galim.id, villageId: village.id, villageAutre: null, localite: "Mengoh" } });
});

test("refus : village d'un autre CZV, CZV d'un autre arrondissement, village d'un autre département", async () => {
  const galim = await dansBam((tx) => tx.centreZootechnique.findFirstOrThrow({ where: { nom: "CZV Galim" }, select: { id: true, arrondissementId: true } }));
  const bamenyam = await dansBam((tx) => tx.village.findFirstOrThrow({ where: { centre: { nom: "CZV Bamenyam" } }, select: { id: true } }));
  const r1 = await dansBam((tx) => preparerLocalisation(tx, { centreId: galim.id, villageId: bamenyam.id }, galim.arrondissementId));
  assert.match((r1 as { erreur: string }).erreur, /pas couvert par le CZV/);

  const mbouda = await transactionCloisonnee(baseBrute, BAM, (tx) => tx.arrondissement.findFirstOrThrow({ where: { code: "MBD" }, select: { id: true } }));
  const r2 = await dansBam((tx) => preparerLocalisation(tx, { centreId: galim.id }, mbouda.id));
  assert.match((r2 as { erreur: string }).erreur, /pas dans l'arrondissement/);

  // Un village de la Menoua n'est même pas visible depuis les Bamboutos : le cloisonnement tient.
  const dschang = await transactionCloisonnee(baseBrute, "dep_menoua", (tx) => tx.village.findFirstOrThrow({ select: { id: true } }));
  const r3 = await dansBam((tx) => preparerLocalisation(tx, { villageId: dschang.id }, galim.arrondissementId));
  assert.match((r3 as { erreur: string }).erreur, /n'existe pas dans la liste de votre département/);
});

test("« Autre village » : écrit en clair, il devient la localité ; jamais sans CZV", async () => {
  const galim = await dansBam((tx) => tx.centreZootechnique.findFirstOrThrow({ where: { nom: "CZV Galim" }, select: { id: true, arrondissementId: true } }));
  const r = await dansBam((tx) => preparerLocalisation(tx, { centreId: galim.id, villageId: null, villageAutre: "  Nouveau   quartier " }, galim.arrondissementId));
  assert.deepEqual(r, { data: { centreId: galim.id, villageId: null, villageAutre: "Nouveau quartier", localite: "Nouveau quartier" } });
  const sansCzv = await dansBam((tx) => preparerLocalisation(tx, { villageAutre: "Quelque part" }, galim.arrondissementId));
  assert.match((sansCzv as { erreur: string }).erreur, /d'abord le CZV/);
});

test("un téléphone qui n'a pas la nouvelle version n'envoie rien de tout cela : rien ne change", async () => {
  const r = await dansBam((tx) => preparerLocalisation(tx, { nom: "Ferme", localite: "Bati" }, "nimporte"));
  assert.deepEqual(r, { data: {} });
});

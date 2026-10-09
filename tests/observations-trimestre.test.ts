/**
 * Les observations du TRIMESTRE (demande du Délégué, 9 octobre 2026) : une
 * case signalée à l'arrondissement, une analyse ou un texte signalés au chef
 * de section. Chacune n'est vue que par son destinataire ; à traiter tant
 * qu'il n'a ni corrigé ni répondu ; à relire par l'auteur ensuite ; réglée
 * une fois close.
 *
 * Sur la base locale, SANS toucher aux saisies : seules des lignes de journal
 * sont créées, puis supprimées.
 *
 *   node --import tsx --test tests/observations-trimestre.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { observationsTrimestre, aTraiterT, aRelireT, type DetailsObservationT } from "../src/server/observationsTrimestre";

const crees: string[] = [];
after(async () => {
  await base.auditLog.deleteMany({ where: { entite: "Observation", entiteId: { in: crees } } });
  await base.auditLog.deleteMany({ where: { id: { in: crees } } });
  await base.$disconnect();
});

async function creer(d: DetailsObservationT) {
  const o = await base.auditLog.create({ data: { action: "OBSERVATION_T", entite: "Trimestre", entiteId: `${d.annee}-${d.trimestre}`, details: d as object } });
  crees.push(o.id);
  return o.id;
}

test("une case signalée à l'arrondissement : à traiter par lui seul, puis à relire par l'auteur, puis close", async () => {
  const arr = await base.arrondissement.findFirst({ orderBy: { nom: "asc" }, select: { id: true, nom: true } });
  assert.ok(arr, "il faut un arrondissement dans la base locale");
  const autre = await base.arrondissement.findFirst({ where: { id: { not: arr!.id } }, select: { id: true } });
  const id = await creer({
    annee: 2026, trimestre: 3,
    // Tableau inexistant : la case n'a jamais été modifiée depuis.
    cible: { type: "case", numero: 9999, titreTableau: "Essai", ligne: arr!.nom, colonne: "Taurillon", libelle: `${arr!.nom} · Taurillon`, valeur: "10" },
    destinataire: { arrondissementId: arr!.id, arrondissement: arr!.nom },
    texte: "Le nombre de taurillons paraît faible.", auteurNom: "test", auteurRole: "DD",
  });

  const lire = async (filtre: Parameters<typeof observationsTrimestre>[1]) => (await observationsTrimestre(base, filtre)).find((o) => o.id === id);
  let o = await lire({ arrondissementId: arr!.id });
  assert.ok(o, "l'arrondissement visé la voit");
  assert.equal(o!.corrigee, false);
  assert.equal(aTraiterT(o!), true);
  assert.equal(aRelireT(o!), false);
  if (autre) assert.equal(await lire({ arrondissementId: autre.id }), undefined, "les autres arrondissements ne la voient pas");
  assert.equal(await lire({ chef: "CHEF_PSA" }), undefined, "aucun chef ne la voit");

  await base.auditLog.create({ data: { action: "OBSERVATION_REPONSE", entite: "Observation", entiteId: id, details: { texte: "12 vendus en août." } } });
  o = await lire({ arrondissementId: arr!.id });
  assert.equal(o!.reponse?.texte, "12 vendus en août.");
  assert.equal(aTraiterT(o!), false, "répondue : plus rien à faire pour l'arrondissement");
  assert.equal(aRelireT(o!), true, "l'auteur lit la réponse");

  await base.auditLog.create({ data: { action: "OBSERVATION_CLOSE", entite: "Observation", entiteId: id } });
  o = await lire({});
  assert.equal(o!.close, true);
  assert.equal(aRelireT(o!), false, "close");
});

test("un texte signalé au chef de section n'est vu que par ce chef", async () => {
  const id = await creer({
    annee: 2026, trimestre: 3,
    cible: { type: "texte", zone: "zone-inexistante-essai", libelle: "Rubrique « Essai »" },
    destinataire: { chef: "CHEF_PSA" },
    texte: "Ce texte ne parle pas de la vaccination.", auteurNom: "test", auteurRole: "DD",
  });
  const psa = (await observationsTrimestre(base, { chef: "CHEF_PSA" })).find((o) => o.id === id);
  assert.ok(psa, "le chef PSA la voit");
  assert.equal(aTraiterT(psa!), true);
  assert.equal((await observationsTrimestre(base, { chef: "CHEF_SSV" })).find((o) => o.id === id), undefined, "le chef SSV ne la voit pas");
});

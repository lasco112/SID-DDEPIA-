/**
 * Des tableaux dépendent d'autres : lors d'une correction, aucune erreur ne
 * doit s'enregistrer et tous les liens doivent être pris en compte (demande
 * du Délégué, 20 octobre 2026).
 *
 *   node --env-file=.env --import tsx --test tests/coherence-liens.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { ecrireSaisieCanevas } from "../src/server/trimestre/saisieCanevas";
import { validerAnalyse } from "../src/server/trimestre/analyse/analyses";
import { tableauxDependants } from "../src/server/trimestre/dependances";
import { grille, incoherenceCategories, erreursDeCoherence, messageErreursCoherence } from "../src/server/trimestre/saisieTrimestrielle";

const DD = { role: "DD" };
const aNettoyer: string[] = [];

after(async () => {
  for (const id of aNettoyer) {
    await base.analyseCanevas.deleteMany({ where: { periodeId: id } });
    await base.saisieCanevas.deleteMany({ where: { periodeId: id } });
    await base.periodeReporting.delete({ where: { id } }).catch(() => {});
  }
  await base.$disconnect();
});

test("les liens entre tableaux : viande ← abattages, tableau 15 ← BAC", () => {
  assert.deepEqual(tableauxDependants(16), [18]);
  assert.deepEqual(tableauxDependants(39), [40]);
  assert.deepEqual(tableauxDependants(45), [46]);
  assert.deepEqual(tableauxDependants(7), [15]);
  assert.deepEqual(tableauxDependants(14), []);
});

test("corriger les abattages remet à revoir la viande, et l'an passé de l'année suivante", async () => {
  const P = trimestrielle(2035, 2);
  const suivante = trimestrielle(2036, 2);
  const id = await periodeTrimestrielle(base, P);
  const idSuivante = await periodeTrimestrielle(base, suivante);
  aNettoyer.push(id, idSuivante);
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });

  const cellule = { numeroTableau: 16, ligne: "Dschang", colonne: "Vache" };
  await ecrireSaisieCanevas(base, transaction, id, cellule, { valeur: 10 }, dd.id);
  // Analyses validées : la viande (18) ce trimestre, les abattages (16) l'an prochain.
  for (const [p, n] of [[id, 18], [id, 16], [idSuivante, 16], [idSuivante, 18], [id, 14]] as const) {
    await validerAnalyse(transaction, p, "", n, { texteCalcule: "texte", texte: "texte", explication: null }, dd.id);
  }

  await ecrireSaisieCanevas(base, transaction, id, cellule, { valeur: 12 }, dd.id);
  const lignes = await base.analyseCanevas.findMany({
    where: { periodeId: { in: [id, idSuivante] } },
    select: { periodeId: true, numeroTableau: true, texteCalcule: true },
  });
  const etat = (p: string, n: number) => lignes.find((l) => l.periodeId === p && l.numeroTableau === n)?.texteCalcule;
  assert.equal(etat(id, 16), "", "le tableau corrigé");
  assert.equal(etat(id, 18), "", "la viande qui en découle");
  assert.equal(etat(idSuivante, 16), "", "l'an passé du même trimestre de l'année suivante");
  assert.equal(etat(idSuivante, 18), "", "et sa viande");
  assert.equal(etat(id, 14), "texte", "un tableau sans lien n'est pas touché");
});

test("catégories ≠ total mensuel : listé, bloquant, et une correction qui rapproche passe", async () => {
  const T3 = trimestrielle(2026, 3);
  const categories = ["Taurillon", "Génisse", "Castré", "Taureau", "Vache", "Veau"];
  const nombre = (s: string | null) => Number((s ?? "").replace(/[\s ]/g, "").replace(",", "."));
  const g = await grille(base, T3, DD, 14);
  const libre = g!.lignes.find(
    (l) =>
      !/^TOTAL|^ÉCART/.test(l.cle) &&
      l.cases.every((c) => !categories.includes(c.colonne) || c.saisi == null) &&
      Number.isFinite(nombre(l.cases.find((c) => c.colonne === "TOTAL T3 2026")!.affiche))
  );
  assert.ok(libre, "aucun arrondissement libre avec un total mensuel");
  const arr = libre!.cle;
  const total = nombre(libre!.cases.find((c) => c.colonne === "TOTAL T3 2026")!.affiche);
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const id = await periodeTrimestrielle(base, T3);
  const ecrire = (colonne: string, valeur: number) =>
    ecrireSaisieCanevas(base, transaction, id, { numeroTableau: 14, ligne: arr, colonne }, { valeur }, dd.id);
  const nos = (l: Awaited<ReturnType<typeof erreursDeCoherence>>) => l.filter((e) => e.numero === 14 && e.arrondissement === arr);

  try {
    // Comme après un mois corrigé : les catégories ne retombent plus sur le total (+3).
    for (const c of categories.slice(0, 5)) await ecrire(c, 1);
    await ecrire("Veau", total - 2);

    const liste = await erreursDeCoherence(base, T3);
    assert.equal(nos(liste).length, 1, "l'écart est repéré");
    assert.equal(nos(liste)[0].genre, "erreur");
    assert.ok(nos(liste)[0].chef, "le domaine du tableau est connu");
    assert.match(messageErreursCoherence(nos(liste), "Suite."), /^Des chiffres se contredisent encore : tableau n° 14 — .*Suite\.$/);

    // Une correction qui RAPPROCHE du total passe (écart 3 → 2), même incomplète…
    assert.equal(await incoherenceCategories(base, T3, DD, 14, arr, "Taurillon", 0), null);
    // … une qui ÉLOIGNE est refusée (écart 3 → 5).
    assert.ok(await incoherenceCategories(base, T3, DD, 14, arr, "Taurillon", 3));

    // Corrigé à zéro : plus rien.
    await ecrire("Veau", total - 5);
    assert.equal(nos(await erreursDeCoherence(base, T3)).length, 0);
  } finally {
    await base.saisieCanevas.deleteMany({ where: { periodeId: id, numeroTableau: 14, ligne: arr, colonne: { in: categories } } });
  }
});

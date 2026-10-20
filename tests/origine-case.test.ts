/**
 * « D'où vient ce chiffre ? » : une case grise du trimestre, détaillée mois
 * par mois, doit retomber sur le chiffre affiché — et chacun ne consulte que
 * son ressort (20 octobre 2026). Lecture seule.
 *
 *   node --env-file=.env --import tsx --test tests/origine-case.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { grille, origineCase, chefDuTableau } from "../src/server/trimestre/saisieTrimestrielle";

const P = trimestrielle(2026, 3);
const DA = { role: "DA", arrondissement: "Dschang" };

after(async () => {
  await base.$disconnect();
});

const nombre = (s: string | null | undefined) => (s == null ? null : Number(s.replace(/[\s  ]/g, "").replace(",", ".")));

test("le détail mois par mois retombe sur la case grise", async () => {
  const g = await grille(base, P, DA, 14);
  const ligne = g!.lignes.find((l) => l.libelle === "Dschang")!;
  // Le total du cheptel bovin de Dschang vient du tableau 1.1 du mensuel.
  const grise = ligne.cases.find((c) => c.etat === "calculee" && c.affiche != null && c.colonne === "TOTAL T3 2026");
  assert.ok(grise, "la base locale doit avoir le mensuel du T3 2026 pour Dschang");
  if (!grise) return;
  const r = await origineCase(base, P, DA, 14, ligne.cle, grise.colonne);
  assert.ok("origine" in r, "message" in r ? r.message : "");
  if (!("origine" in r)) return;
  assert.equal(r.origine.mois.length, 3);
  const retenus = r.origine.mois.filter((m) => m.retenu && m.valeur != null).map((m) => m.valeur!);
  const attendu = r.origine.regle === "DERNIERE_VALEUR" ? retenus[retenus.length - 1] : retenus.reduce((a, b) => a + b, 0);
  assert.equal(Math.round(attendu * 100) / 100, nombre(grise.affiche));
});

test("chacun son ressort : DA, chef de la section et DD oui ; un autre chef, non", async () => {
  const g = await grille(base, P, { role: "DD" }, 14);
  const ligne = g!.lignes.find((l) => l.libelle === "Dschang")!;
  const grise = ligne.cases.find((c) => c.etat === "calculee" && c.colonne === "TOTAL T3 2026");
  assert.ok(grise);
  if (!grise) return;
  const chef = chefDuTableau(14)!;
  const autre = ["CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"].find((r) => r !== chef)!;

  assert.ok("origine" in (await origineCase(base, P, { role: "DD" }, 14, ligne.cle, grise.colonne)));
  assert.ok("origine" in (await origineCase(base, P, { role: chef }, 14, ligne.cle, grise.colonne)));
  const refus = await origineCase(base, P, { role: autre }, 14, ligne.cle, grise.colonne);
  assert.ok("message" in refus && /ressort/.test(refus.message));

  // Un DA ne consulte pas l'arrondissement d'un autre.
  const fokoue = g!.lignes.find((l) => l.libelle === "Fokoué")!;
  assert.ok("message" in (await origineCase(base, P, DA, 14, fokoue.cle, grise.colonne)));
});
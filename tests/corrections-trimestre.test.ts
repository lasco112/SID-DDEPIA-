/**
 * Les corrections au trimestre des cases calculées (21 octobre 2026) : où elles
 * s'appliquent, ce qui suit (totaux, autres tableaux du même champ, semestre),
 * le conflit quand le mensuel change, et qui peut corriger.
 *
 *   node --env-file=.env --import tsx --test --test-concurrency=1 tests/corrections-trimestre.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { trimestrielle, type Periode } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { appliquerCorrections, TABLEAUX_CORRIGEABLES, type CorrectionLue, type Surcharges } from "../src/server/trimestre/correctionsTrimestre";
import { liaisonDe } from "../src/server/trimestre/liaison";
import type { CasesEvenement } from "../src/server/trimestre/evenements";
import { grille, chefDuTableau, erreursDeCoherence } from "../src/server/trimestre/saisieTrimestrielle";
import { infoCorrection, corrigerCase, RefusCorrection } from "../src/server/trimestre/corrigerCase";
import { versNombre } from "../src/server/trimestre/remplissage";

const crees: string[] = [];
after(async () => {
  await base.correctionTrimestre.deleteMany({ where: { id: { in: crees } } });
  await base.$disconnect();
});

const correction = (p: Partial<CorrectionLue>): CorrectionLue => ({
  id: "x", periodeId: "p", numeroTableau: 64, ligne: "Dschang", colonne: "PPCB", valeur: 10, valeurMensuelle: null,
  motif: "m", source: "s", auteurId: null, updatedAt: new Date(), annee: 2026, rang: 3, ...p,
});
const codes = new Map([["DSCHANG", "DSC"], ["FOKOUE", "FOK"]]);
const vides = () => ({ valeurs: new Map<string, Map<string | null, number | null>>(), evenements: new Map<number, CasesEvenement>(), surcharges: new Map() as Surcharges });

test("les tableaux corrigeables : listes du mensuel et pisciculture", () => {
  for (const n of [27, 32, 109, 64, 65, 66, 67, 70, 61, 62, 63]) assert.ok(TABLEAUX_CORRIGEABLES.has(n), `tableau ${n}`);
  assert.ok(!TABLEAUX_CORRIGEABLES.has(14), "un cheptel se corrige dans le mois");
});

test("liste du mensuel : la case, son total de ligne et le département suivent", () => {
  const c = vides();
  c.evenements.set(64, {
    nombres: new Map([["PPCB", new Map<string | null, number>([["FOK", 4], [null, 4]])]]),
    totaux: new Map<string | null, number>([["FOK", 9], [null, 9]]),
    textes: new Map(),
  });
  // Dschang n'a rien au mensuel : la correction lui donne 10.
  const bases = appliquerCorrections(c, [correction({ valeur: 10 })], trimestrielle(2026, 3), codes);
  const cases = c.evenements.get(64)!;
  assert.equal(cases.nombres.get("PPCB")!.get("DSC"), 10);
  assert.equal(cases.nombres.get("PPCB")!.get(null), 14, "le département : 4 + 10");
  assert.equal(cases.totaux.get("DSC"), 10);
  assert.equal(cases.totaux.get(null), 19);
  assert.equal(bases.get("64 | Dschang | PPCB"), null, "le mensuel ne donnait rien");
});

test("pisciculture : un champ partagé se corrige pour tous les tableaux ; m² et ha ; somme de champs", () => {
  const c = vides();
  c.valeurs.set("T17_NB_ETANGS", new Map<string | null, number | null>([["DSC", 3], [null, 8]]));
  c.valeurs.set("T17_SUPERFICIE", new Map<string | null, number | null>([["DSC", 20_000], [null, 50_000]]));
  const P = trimestrielle(2026, 3);
  appliquerCorrections(c, [correction({ numeroTableau: 61, colonne: "Nombre étangs actifs", valeur: 5 })], P, codes);
  assert.equal(c.valeurs.get("T17_NB_ETANGS")!.get("DSC"), 5, "le champ : donc aussi le tableau 63");
  assert.equal(c.valeurs.get("T17_NB_ETANGS")!.get(null), 10);
  appliquerCorrections(c, [correction({ numeroTableau: 63, colonne: "Superficie en Ha", valeur: 3 })], P, codes);
  assert.equal(c.valeurs.get("T17_SUPERFICIE")!.get("DSC"), 30_000, "3 ha = 30 000 m², au tableau 61 aussi");
  assert.equal(c.valeurs.get("T17_SUPERFICIE")!.get(null), 60_000);
  appliquerCorrections(c, [correction({ numeroTableau: 63, colonne: "Qté de poissons (en kg)", valeur: 1200 })], P, codes);
  const corr = liaisonDe(63)!.correspondances.find((x) => x.libelle === "Qté de poissons (en kg)")!;
  assert.equal(c.surcharges.get(corr)!.get("DSC"), 1200, "une somme de cinq champs : la case elle-même");
});

test("semestre : on ajoute ce que la correction a changé ; un stock ne compte que du dernier trimestre", () => {
  const S2: Periode = { ...trimestrielle(2026, 3), type: "SEMESTRIEL", rang: 2 } as Periode;
  const c = vides();
  c.evenements.set(64, { nombres: new Map([["PPCB", new Map<string | null, number>([["DSC", 30], [null, 30]])]]), totaux: new Map([["DSC", 30], [null, 30]]), textes: new Map() });
  c.valeurs.set("T17_NB_ETANGS", new Map<string | null, number | null>([["DSC", 4], [null, 4]]));
  appliquerCorrections(
    c,
    [
      correction({ valeur: 12, valeurMensuelle: 2, rang: 3 }), // T3 : +10 vaccinations
      correction({ numeroTableau: 61, colonne: "Nombre étangs actifs", valeur: 9, valeurMensuelle: 6, rang: 3 }), // stock du T3 : ignoré au S2
    ],
    S2,
    codes
  );
  assert.equal(c.evenements.get(64)!.nombres.get("PPCB")!.get("DSC"), 40, "30 + (12 − 2)");
  assert.equal(c.valeurs.get("T17_NB_ETANGS")!.get("DSC"), 4, "le nombre d'étangs du S2 est celui du T4");
});

test("sur les données locales : la case corrigée, le total du département, et le conflit si le mensuel change", async () => {
  const P = trimestrielle(2026, 3);
  const DD = { role: "DD" };
  const avant = await grille(base, P, DD, 64);
  assert.ok(avant, "le tableau des vaccinations existe");
  const ligne = avant!.lignes.find((l) => l.cle === "Dschang")!;
  const cible = ligne.cases.find((c) => c.etat === "calculee" && !/^TOTAL/.test(c.colonne))!;
  assert.ok(cible, "une case calculée pour Dschang");
  const baseDschang = versNombre(cible.affiche) ;
  const totalAvant = versNombre(avant!.lignes.find((l) => l.cle === `TOTAL T3 2026`)?.cases.find((c) => c.colonne === cible.colonne)?.affiche ?? null) ?? 0;

  const periodeId = await periodeTrimestrielle(base, P);
  const c = await base.correctionTrimestre.create({
    data: { periodeId, numeroTableau: 64, ligne: "Dschang", colonne: cible.colonne, valeur: (baseDschang ?? 0) + 5, valeurMensuelle: baseDschang, motif: "essai", source: "registre d'essai" },
  });
  crees.push(c.id);
  const apres = await grille(base, P, DD, 64);
  const corrigee = apres!.lignes.find((l) => l.cle === "Dschang")!.cases.find((x) => x.colonne === cible.colonne)!;
  assert.equal(versNombre(corrigee.affiche), (baseDschang ?? 0) + 5);
  assert.ok(corrigee.corrigee && !corrigee.corrigee.conflit);
  const totalApres = versNombre(apres!.lignes.find((l) => l.cle === `TOTAL T3 2026`)?.cases.find((x) => x.colonne === cible.colonne)?.affiche ?? null) ?? 0;
  assert.equal(totalApres, totalAvant + 5, "le total du département suit");
  assert.equal(
    (await erreursDeCoherence(base, P)).filter((e) => e.numero === 64 && /corrigé au trimestre/.test(e.texte)).length,
    0,
    "pas de conflit tant que le mensuel n'a pas bougé"
  );

  // Le mensuel « a changé » depuis la correction : le SID le signale, et c'est bloquant.
  await base.correctionTrimestre.update({ where: { id: c.id }, data: { valeurMensuelle: (baseDschang ?? 0) + 1 } });
  const conflits = (await erreursDeCoherence(base, P)).filter((e) => e.numero === 64 && /corrigé au trimestre/.test(e.texte));
  assert.equal(conflits.length, 1);
  assert.equal(conflits[0].genre, "erreur");
  assert.equal(conflits[0].arrondissement, "Dschang");
});

test("qui corrige : le chef de la section seulement, et seulement avec l'ordre du DD", async () => {
  const P = trimestrielle(2026, 3);
  const chef = chefDuTableau(64)!;
  const autre = ["CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"].find((r) => r !== chef)!;
  const g = await grille(base, P, { role: "DD" }, 64);
  const col = g!.lignes.find((l) => l.cle === "Fokoué")!.cases.find((c) => c.etat === "calculee" && !/^TOTAL/.test(c.colonne))!.colonne;

  const lui = await infoCorrection(base, P, { role: chef }, 64, "Fokoué", col);
  assert.ok(lui.corrigeable && lui.estChef);
  const unAutre = await infoCorrection(base, P, { role: autre }, 64, "Fokoué", col);
  assert.ok(!unAutre.estChef && !unAutre.peutCorriger);
  const dd = await infoCorrection(base, P, { role: "DD" }, 64, "Fokoué", col);
  assert.ok(!dd.estChef && !dd.peutCorriger, "le DD donne l'ordre, il ne corrige pas");
  const total = await infoCorrection(base, P, { role: chef }, 64, "TOTAL T3 2026", col);
  assert.ok(!total.corrigeable, "un total ne se corrige pas");

  if (!lui.aOrdre) {
    await assert.rejects(
      corrigerCase(base, P, { role: chef }, "x", { numero: 64, ligne: "Fokoué", colonne: col, valeur: 3, motif: "essai essai", source: "registre" }),
      (e: unknown) => e instanceof RefusCorrection && e.status === 403
    );
  }
  await assert.rejects(
    corrigerCase(base, P, { role: autre }, "x", { numero: 64, ligne: "Fokoué", colonne: col, valeur: 3, motif: "essai essai", source: "registre" }),
    (e: unknown) => e instanceof RefusCorrection && e.status === 403
  );
});

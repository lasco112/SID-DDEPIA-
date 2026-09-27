/**
 * Le semestre et l'année calculés à partir des trimestres saisis (décision du
 * Délégué, 28 septembre 2026) : sommes, dernière situation, moyennes, règles
 * par colonne, historique N-1, correction propre au semestre, tableau des
 * recettes à une ligne par mois.
 *
 * Écrit sur 2033 (T1, T2, S1) et 2032 (T1, T2 pour le N-1), supprimés à la fin.
 *
 *   node --env-file=.env --import tsx --test tests/consolidation-semestre.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { semestrielle, trimestrielle, annuelle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle, lireRubriques, ecrireRubrique } from "../src/server/trimestre/rubriques";
import { saisiesConsolidees, trimestresSansSaisie, REGLES } from "../src/server/trimestre/consolidation";
import { cleCellule } from "../src/server/trimestre/saisieCanevas";
import { lignesDe } from "../src/server/trimestre/canevas/rendu";
import { SECTIONS_CANEVAS } from "../src/server/trimestre/canevas/sections";
import { periodeDuRapport, periodeDuCircuit, rapportsDuTrimestre } from "../src/server/trimestre/periodeRapport";
import { transaction } from "../src/lib/baseDeTravail";

const creees: string[] = [];

after(async () => {
  await base.saisieCanevas.deleteMany({ where: { periodeId: { in: creees } } });
  await base.rubriqueNarrative.deleteMany({ where: { periodeId: { in: creees } } });
  await base.periodeReporting.deleteMany({ where: { id: { in: creees } } });
  await base.$disconnect();
});

const saisir = (periodeId: string, numeroTableau: number, ligne: string, colonne: string, v: number | string) =>
  base.saisieCanevas.create({
    data: { periodeId, numeroTableau, ligne, colonne, ...(typeof v === "number" ? { valeur: v } : { valeurTexte: v }) },
  });

test("le semestre additionne les mouvements, reprend les situations, fait la moyenne des prix", async () => {
  const t1 = await periodeTrimestrielle(base, trimestrielle(2033, 1));
  const t2 = await periodeTrimestrielle(base, trimestrielle(2033, 2));
  creees.push(t1, t2);

  // 16 — abattages : un mouvement → somme.
  await saisir(t1, 16, "DSCHANG", "Vache", 10);
  await saisir(t2, 16, "DSCHANG", "Vache", 15);
  // 14 — cheptel : une situation → le dernier trimestre.
  await saisir(t1, 14, "DSCHANG", "Vache", 500);
  await saisir(t2, 14, "DSCHANG", "Vache", 520);
  // 17 — poids moyen : un rapport → la moyenne.
  await saisir(t1, 17, "VACHE", "POIDS MOYEN", 300);
  await saisir(t2, 17, "VACHE", "POIDS MOYEN", 320);
  // 63 — règle par colonne : étangs = situation, quantité = somme, prix = moyenne.
  await saisir(t1, 63, "DSCHANG", "Nombre étangs", 40);
  await saisir(t2, 63, "DSCHANG", "Nombre étangs", 42);
  await saisir(t1, 63, "DSCHANG", "Qté de poissons (en kg)", 1000);
  await saisir(t2, 63, "DSCHANG", "Qté de poissons (en kg)", 1500);
  await saisir(t1, 63, "DSCHANG", "Prix moyen du Kg", 2000);
  await saisir(t2, 63, "DSCHANG", "Prix moyen du Kg", 2200);
  // 27 — circulation : les provenances distinctes sont réunies.
  await saisir(t1, 27, "DSCHANG", "Provenance", "Foumbot");
  await saisir(t2, 27, "DSCHANG", "Provenance", "Bafang");
  // 13 — recettes : chaque mois vient de son trimestre.
  await saisir(t1, 13, "JANVIER", "DDEPIA", 100);
  await saisir(t2, 13, "AVRIL", "DDEPIA", 200);
  // Historique N-1 saisi à chaque trimestre : il devient celui du semestre.
  await saisir(t1, 16, "DSCHANG", "TOTAL T1 2032", 7);
  await saisir(t2, 16, "DSCHANG", "TOTAL T2 2032", 8);

  const S1 = semestrielle(2033, 1);
  const { saisies, trimestresSansSaisie: manquants } = await saisiesConsolidees(base, S1, null, new Set());
  const v = (n: number, l: string, c: string) => saisies.get(cleCellule({ numeroTableau: n, ligne: l, colonne: c }));

  assert.equal(v(16, "DSCHANG", "Vache")?.valeur, 25, "abattages additionnés");
  assert.equal(v(14, "DSCHANG", "Vache")?.valeur, 520, "cheptel : situation du T2");
  assert.equal(v(17, "VACHE", "POIDS MOYEN")?.valeur, 310, "poids moyen : moyenne");
  assert.equal(v(63, "DSCHANG", "Nombre étangs")?.valeur, 42);
  assert.equal(v(63, "DSCHANG", "Qté de poissons (en kg)")?.valeur, 2500);
  assert.equal(v(63, "DSCHANG", "Prix moyen du Kg")?.valeur, 2100);
  assert.equal(v(27, "DSCHANG", "Provenance")?.texte, "Foumbot ; Bafang");
  assert.equal(v(13, "JANVIER", "DDEPIA")?.valeur, 100);
  assert.equal(v(13, "AVRIL", "DDEPIA")?.valeur, 200);
  assert.equal(v(16, "DSCHANG", "TOTAL S1 2032")?.valeur, 15, "l'historique des deux trimestres devient celui du semestre");
  assert.equal(v(16, "DSCHANG", "TOTAL T1 2032"), undefined, "plus aucune étiquette de trimestre");
  assert.deepEqual(manquants, []);
  assert.deepEqual(await trimestresSansSaisie(base, S1), []);
  assert.deepEqual(await trimestresSansSaisie(base, annuelle(2033)), ["T3 2033", "T4 2033"]);
});

test("une correction saisie pour le semestre lui-même l'emporte sur le calcul", async () => {
  const S1 = semestrielle(2033, 1);
  const s1 = await periodeTrimestrielle(base, S1);
  creees.push(s1);
  const ligne = await base.periodeReporting.findUniqueOrThrow({ where: { id: s1 }, select: { type: true, semestre: true } });
  assert.deepEqual(ligne, { type: "SEMESTRIEL", semestre: 1 }, "le semestre se matérialise sous SON type");
  await saisir(s1, 16, "DSCHANG", "Vache", 30);
  const { saisies } = await saisiesConsolidees(base, S1, null, new Set());
  assert.equal(saisies.get(cleCellule({ numeroTableau: 16, ligne: "DSCHANG", colonne: "Vache" }))?.valeur, 30);
});

test("les textes du semestre partent de ceux du trimestre qui le clôt", async () => {
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  await ecrireRubrique(base, transaction, trimestrielle(2033, 2), null, "I4.perspectives", "Perspectives du T2.", dd.id);
  await ecrireRubrique(base, transaction, trimestrielle(2033, 1), null, "I4.difficultes", "Difficultés du T1.", dd.id);
  let textes = await lireRubriques(base, semestrielle(2033, 1), null);
  assert.equal(textes.get("I4.perspectives"), "Perspectives du T2.", "repris du T2, qui clôt le semestre");
  assert.equal(textes.get("I4.difficultes"), undefined, "pas du T1");
  await ecrireRubrique(base, transaction, semestrielle(2033, 1), null, "I4.perspectives", "Perspectives du semestre.", dd.id);
  textes = await lireRubriques(base, semestrielle(2033, 1), null);
  assert.equal(textes.get("I4.perspectives"), "Perspectives du semestre.", "le texte propre au semestre l'emporte");
});

test("le tableau des recettes a une ligne par mois de la période", () => {
  const bloc = SECTIONS_CANEVAS.flatMap((s) => s.blocs).find((b) => b.type === "tableau" && b.numero === 13);
  assert.ok(bloc && bloc.type === "tableau");
  const ctx = (mois: string[]) => ({ periodeCourt: "S1 2033", periodeCourtN1: "S1 2032", annee: 2033, mois, arrondissements: ["DSCHANG"] });
  const six = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN"];
  assert.deepEqual(lignesDe(bloc, ctx(six)).slice(0, 6), six);
  assert.equal(lignesDe(bloc, ctx(["JUILLET", "AOÛT", "SEPTEMBRE"])).length, 6, "au trimestre : 3 mois, 2 totaux, l'écart");
});

test("périodes des rapports : demande, circuit, rapports de la clôture", () => {
  assert.deepEqual(periodeDuRapport({ annee: "2026", trimestre: "3" }), trimestrielle(2026, 3));
  assert.deepEqual(periodeDuRapport({ annee: 2026, type: "SEMESTRIEL", rang: 2 }), semestrielle(2026, 2));
  assert.deepEqual(periodeDuRapport({ annee: 2026, type: "ANNUEL" }), annuelle(2026));
  assert.equal(periodeDuRapport({ annee: 2026, type: "SEMESTRIEL", rang: 3 }), null);
  assert.equal(periodeDuRapport({ annee: null, trimestre: 3 }), null);
  assert.deepEqual(periodeDuCircuit(semestrielle(2026, 1)), trimestrielle(2026, 2));
  assert.deepEqual(periodeDuCircuit(annuelle(2026)), trimestrielle(2026, 4));
  assert.deepEqual(rapportsDuTrimestre(trimestrielle(2026, 4)), [trimestrielle(2026, 4), semestrielle(2026, 2), annuelle(2026)]);
  assert.deepEqual(rapportsDuTrimestre(trimestrielle(2026, 3)), [trimestrielle(2026, 3)]);
});

test("chaque tableau saisi a une règle de calcul", () => {
  // Les 74 tableaux saisis au trimestre (écran de saisie du DD, 28 septembre 2026).
  const saisis = [101, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 102, 13, 103, 104, 105, 106, 107, 14, 108, 15, 16, 17, 19, 21, 22, 23, 26, 27, 31, 32, 33, 34, 35, 37, 38, 39, 41, 109, 42, 43, 44, 45, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 110, 61, 63, 111, 64, 113, 114, 65, 66, 67, 69, 70, 71, 72, 115];
  assert.deepEqual(saisis.filter((n) => !REGLES[n]), []);
});

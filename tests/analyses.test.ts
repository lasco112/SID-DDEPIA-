/**
 * Les analyses des tableaux : des phrases CALCULÉES, que l'humain relit.
 *
 * Ce qui se vérifie ici :
 *  - chaque phrase dit ce que disent les chiffres, avec les seuils du Délégué ;
 *  - rien n'est dit qui ne se déduise pas du tableau (pas de « rubrique
 *    dominante » sur un détail incomplet, pas de décrochage de tout le monde) ;
 *  - un texte validé suit ses chiffres : s'ils changent, il est « à revoir »
 *    et le rapport reprend le texte recalculé ;
 *  - la version d'un arrondissement et celle du département sont distinctes.
 *
 *   node --env-file=.env --import tsx --test tests/analyses.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { analyserTableau } from "../src/server/trimestre/analyse/analyseTableau";
import {
  statutDe, texteAuRapport, validerAnalyse, lireAnalyses, retirerAnalyse, type Proposition,
} from "../src/server/trimestre/analyse/analyses";
import { SUJETS } from "../src/server/trimestre/analyse/sujets";
import { SECTION_II_BOVIN } from "../src/server/trimestre/canevas/sectionBovin";
import { SECTION_II_PORCIN, SECTION_II_AVICOLE } from "../src/server/trimestre/canevas/sectionPorcinAvicole";
import type { Bloc, ContexteCanevas } from "../src/server/trimestre/canevas/types";
import type { FournisseurValeur } from "../src/server/trimestre/canevas/rendu";

type BlocTableau = Extract<Bloc, { type: "tableau" }>;
const ARR = ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"];
const CTX = {
  periodeCourt: "T3 2026", periodeCourtN1: "T3 2025", annee: 2026,
  mois: ["JUILLET", "AOÛT", "SEPTEMBRE"], arrondissements: ARR,
} as unknown as ContexteCanevas;

const bloc = (sections: { blocs: Bloc[] }[], numero: number) =>
  sections.flatMap((s) => s.blocs).find((b) => b.type === "tableau" && b.numero === numero) as BlocTableau;

/** Un tableau à arrondissements en lignes : total de chacun, cette année et l'an passé. */
function fictif(courant: Record<string, number>, passe: Record<string, number> = {}): FournisseurValeur {
  const somme = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return ({ ligne, colonne }) => {
    if (colonne === "TOTAL T3 2026") return ligne === "TOTAL T3 2026" ? String(somme(courant)) : courant[ligne] == null ? null : String(courant[ligne]);
    if (colonne === "TOTAL T3 2025") {
      if (ligne === "TOTAL T3 2026") return Object.keys(passe).length ? String(somme(passe)) : null;
      return passe[ligne] == null ? null : String(passe[ligne]);
    }
    return null;
  };
}

const T16 = bloc([SECTION_II_BOVIN], 16);
const phrases = (v: FournisseurValeur, b = T16) => analyserTableau(b, CTX, v, SUJETS[b.numero!])!.phrases.map((p) => p.texte);

test("évolution : hausse, stabilité sous 5 %, forte hausse au-delà de 50 %", () => {
  const cur = { Dschang: 110, Fokoué: 110, "Fongo-Tongo": 110, "Nkong-Ni": 110, "Penka-Michel": 110, Santchou: 110 };
  const n1 = (x: number) => Object.fromEntries(ARR.map((a) => [a, x]));
  assert.match(phrases(fictif(cur, n1(100)))[0], /en hausse de 10 % par rapport au T3 2025 \(600 têtes\)/);
  assert.match(phrases(fictif(cur, n1(107)))[0], /stable par rapport au T3 2025/);
  assert.match(phrases(fictif(cur, n1(70)))[0], /en forte hausse de 57,1 %/);
  assert.match(phrases(fictif(cur, n1(130)))[0], /en baisse de 15,4 %/);
});

test("sans l'an passé, le texte le dit — il ne compare pas à rien", () => {
  const p = phrases(fictif({ Dschang: 10, Fokoué: 20 }));
  assert.match(p[0], /La comparaison avec le T3 2025 n’est pas possible/);
});

test("concentration au-delà de 50 %, sinon l'arrondissement de tête et sa part", () => {
  assert.match(phrases(fictif({ Dschang: 60, Fokoué: 20, Santchou: 20 })).join(" "), /Dschang en concentre à lui seul 60 %/);
  assert.match(phrases(fictif({ Dschang: 40, Fokoué: 35, Santchou: 25 })).join(" "), /Dschang arrive en tête avec 40 %/);
});

test("décrochage : sous la MÉDIANE des autres — un seul très fort ne fait pas décrocher tout le monde", () => {
  const p = phrases(fictif({ Dschang: 5000, Fokoué: 800, "Fongo-Tongo": 750, "Nkong-Ni": 760, "Penka-Michel": 240, Santchou: 700 })).join(" ");
  assert.match(p, /Penka-Michel \(240\) se situe nettement en dessous/);
  assert.doesNotMatch(p, /Fokoué \(800\)/);
});

test("rupture d'un arrondissement sur un an, au-delà de 50 %", () => {
  const p = phrases(fictif({ Dschang: 300, Fokoué: 100 }, { Dschang: 100, Fokoué: 95 })).join(" ");
  assert.match(p, /forte progression à Dschang \(\+200 %\)/);
  assert.doesNotMatch(p, /Fokoué \(\+/);
});

test("un tableau vide n'a pas d'analyse, seulement le constat", () => {
  const p = phrases(() => null);
  assert.deepEqual(p, ["Aucune donnée n’a été renseignée pour ce tableau au T3 2026."]);
});

test("les tableaux aux unités mêlées ne sont pas analysés", () => {
  // Commercialisation des porcins (animaux ET viande), œufs et fientes, saisies (kg ET boîtes).
  for (const n of [41, 48, 71, 72, 21, 31]) assert.equal(SUJETS[n], undefined, `tableau ${n}`);
  assert.ok(SUJETS[37] && SUJETS[45] && SUJETS[64]);
  assert.ok(bloc([SECTION_II_PORCIN], 37) && bloc([SECTION_II_AVICOLE], 45));
});

// ---------------------------------------------------------------- validation

const proposition = (texte: string, vide = false): Proposition => ({
  numero: 16, titre: "Les abattages contrôlés", section: "II", chef: "CHEF_PSA",
  phrases: [{ texte, calcul: "" }], texte, vide, sansComparaison: false, evolution: null,
});
const enregistree = (texteCalcule: string, texte: string, explication: string | null = null) => ({
  texteCalcule, texte, explication, valideLe: new Date(), validePar: null,
});

test("validé tant que les chiffres ne bougent pas ; à revoir s'ils changent", () => {
  const e = enregistree("Hausse de 10 %.", "Hausse de 10 %, corrigée.", "Fête de fin d’année.");
  assert.equal(statutDe(proposition("Hausse de 10 %."), e), "valide");
  assert.equal(texteAuRapport(proposition("Hausse de 10 %."), e), "Hausse de 10 %, corrigée. Fête de fin d’année.");
  // Les chiffres ont changé : le texte validé ne décrit plus le tableau.
  assert.equal(statutDe(proposition("Hausse de 12 %."), e), "a_revoir");
  assert.equal(texteAuRapport(proposition("Hausse de 12 %."), e), "Hausse de 12 %. Fête de fin d’année.");
  // Rien de validé : le texte calculé part au rapport.
  assert.equal(texteAuRapport(proposition("Hausse de 12 %."), undefined), "Hausse de 12 %.");
  assert.equal(texteAuRapport(proposition("x", true), undefined), null);
});

const P = trimestrielle(2031, 2);
let periodeId: string | null = null;
after(async () => {
  if (periodeId) {
    await base.analyseCanevas.deleteMany({ where: { periodeId } });
    await base.periodeReporting.delete({ where: { id: periodeId } }).catch(() => {});
  }
  await base.$disconnect();
});

test("la validation d'un arrondissement et celle du département sont distinctes", async () => {
  periodeId = await periodeTrimestrielle(base, P);
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true } });

  await validerAnalyse(transaction, periodeId, "", 16, { texteCalcule: "A", texte: "A département", explication: null }, dd.id);
  await validerAnalyse(transaction, periodeId, dschang.id, 16, { texteCalcule: "B", texte: "", explication: "Cause" }, dd.id);

  const dept = await lireAnalyses(base, periodeId, "");
  const sien = await lireAnalyses(base, periodeId, dschang.id);
  assert.equal(dept.get(16)?.texte, "A département");
  // Un texte vide valide le texte calculé tel quel.
  assert.equal(sien.get(16)?.texte, "B");
  assert.equal(sien.get(16)?.explication, "Cause");

  // Valider à nouveau remplace, sans doublon.
  await validerAnalyse(transaction, periodeId, "", 16, { texteCalcule: "A2", texte: "A2", explication: null }, dd.id);
  assert.equal((await lireAnalyses(base, periodeId, "")).get(16)?.texteCalcule, "A2");
  assert.equal(await base.analyseCanevas.count({ where: { periodeId } }), 2);

  await retirerAnalyse(transaction, periodeId, "", 16);
  assert.equal((await lireAnalyses(base, periodeId, "")).size, 0);
  assert.equal((await lireAnalyses(base, periodeId, dschang.id)).size, 1);
});

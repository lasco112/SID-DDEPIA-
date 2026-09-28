/**
 * Les analyses des tableaux que le moteur général ne lit pas (décision du
 * Délégué, 28 septembre 2026 : une analyse sous chaque tableau) : listes,
 * budget, rendements, unités mêlées, rubriques. Sur des tableaux FABRIQUÉS —
 * aucune base.
 *
 *   node --import tsx --test tests/analyses-particulieres.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTIONS_CANEVAS } from "../src/server/trimestre/canevas/sections";
import { analyserParticulier, ANALYSES_PARTICULIERES } from "../src/server/trimestre/analyse/analysesParticulieres";
import { SUJETS } from "../src/server/trimestre/analyse/sujets";
import { clesLignes } from "../src/server/trimestre/canevas/structure";
import type { ContexteCanevas } from "../src/server/trimestre/canevas/types";

const ctx = (arrondissements = ["Dschang", "Fokoué"], arrondissement?: string): ContexteCanevas => ({
  periodeCourt: "T3 2026",
  periodeCourtN1: "T3 2025",
  annee: 2026,
  mois: ["JUILLET", "AOÛT", "SEPTEMBRE"],
  arrondissements,
  arrondissement,
});

const bloc = (n: number) => {
  const b = SECTIONS_CANEVAS.flatMap((s) => s.blocs).find((x) => x.type === "tableau" && x.numero === n);
  assert.ok(b && b.type === "tableau", `tableau ${n} introuvable`);
  return b;
};

/** Un tableau fabriqué : « ligne | colonne » → valeur affichée. */
const texte = (n: number, cases: Record<string, string>, c = ctx()) =>
  analyserParticulier(bloc(n), c, ({ ligne, colonne }) => cases[`${ligne} | ${colonne}`] ?? null)!.phrases.map((p) => p.texte).join(" ");

test("chaque tableau du canevas a une analyse, générale ou particulière", () => {
  const sans = SECTIONS_CANEVAS.flatMap((s) => s.blocs)
    .filter((b) => b.type === "tableau" && b.numero != null)
    .map((b) => (b as { numero: number }).numero)
    .filter((n) => !SUJETS[n] && !ANALYSES_PARTICULIERES[n]);
  assert.deepEqual(sans, []);
});

test("bilan de surveillance : les suspicions comptées, les maladies citées", () => {
  const t = texte(114, {
    "1 | Maladie suspectée": "Rage", "1 | Confirmé": "1",
    "2 | Maladie suspectée": "PPR", "2 | Négatif": "1",
    "3 | Maladie suspectée": "Rage", "3 | Négatif": "X",
  });
  assert.equal(t, "3 suspicions de maladies ont été signalées (Rage, PPR) : 1 confirmée, 2 négatives.");
});

test("activités d'un programme : combien ont un niveau de réalisation", () => {
  const b = bloc(104);
  // Une ligne d'activité est repérée par son activité, pas par son code.
  const [premiere] = clesLignes(b, ctx());
  assert.ok(premiere);
  const t = analyserParticulier(b, ctx(), ({ ligne, colonne }) =>
    /réalisation/i.test(colonne) && ligne === premiere ? "Réalisée à 80 %" : null
  );
  assert.ok(t, "analyse attendue");
  assert.match(t!.phrases[0].texte, /^Au titre du programme 053, 1 activité a un niveau de réalisation renseigné pour le T3 2026\.$/);
});

test("budget : le total et la première rubrique", () => {
  const t = texte(11, { "DEPENSES C2D | MONTANT": "30 000 000", "DEPENSES EN MARCHES PUBLICS DES SERVICES CENTRAUX | MONTANT": "70 000 000" });
  assert.equal(t, "Le budget s’élève à 100 000 000 FCFA ; « DEPENSES EN MARCHES PUBLICS DES SERVICES CENTRAUX » en représente 70 %.");
});

test("unités mêlées : une phrase par indicateur, l'unité après le chiffre, jamais additionnés", () => {
  const t = texte(21, {
    "Dschang | Quantité (En unité)": "100", "Fokoué | Quantité (En unité)": "50", "TOTAL T3 2026 | Quantité (En unité)": "150",
    "TOTAL T3 2025 | Quantité (En unité)": "100",
    "Dschang | Prix moyen FCFA/Unité": "2 000", "Fokoué | Prix moyen FCFA/Unité": "3 000",
    "Dschang | Principales destinations": "Douala", "Fokoué | Principales destinations": "Yaoundé",
  });
  assert.match(t, /quantité : 150 unités \(\+50 % sur un an\)/);
  assert.match(t, /prix moyen FCFA\/Unité : 2 500 \(moyenne des arrondissements\)/);
  assert.match(t, /principales destinations : Douala, Yaoundé/);
  assert.doesNotMatch(t, /5 150|2 650/, "jamais une somme de têtes et de francs");
});

test("rubriques : les trois premières, leur unité, le reste compté", () => {
  const t = texte(71, {
    "Abats bovins (Kg) | TOTAL T3 2026": "500", "Bovin entier | TOTAL T3 2026": "2",
    "Abats porc (kg) | TOTAL T3 2026": "300", "Biscuit au lait (boite) | TOTAL T3 2026": "40",
  });
  assert.equal(t, "Les saisies les plus importantes pour le département au T3 2026 : abats bovins : 500 kg, abats porc : 300 kg, biscuit au lait : 40 boite ; le tableau en compte 1 autre.");
});

test("rapport d'un arrondissement : la phrase parle de lui", () => {
  const t = texte(20, { "Dschang | Production de lait frais": "120" }, ctx(["Dschang"], "Dschang"));
  assert.equal(t, "Au T3 2026, pour l’arrondissement de Dschang : production de lait frais : 120.");
});

test("tableau vide : « aucune donnée », comme partout", () => {
  assert.match(texte(115, {}), /^Aucune donnée n’a été renseignée pour ce tableau au T3 2026\.$/);
});

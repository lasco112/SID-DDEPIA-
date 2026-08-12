/**
 * Tests du moteur d'agrégation trimestrielle (E4).
 *
 * Ces tests s'appuient sur les données fictives déterministes :
 *   npx tsx scripts/donnees-fictives-trimestre.ts
 *
 * Ils ne comparent PAS à des nombres écrits en dur — ils recalculent
 * indépendamment depuis la base et vérifient que le moteur tombe sur le même
 * résultat. Un test qui répéterait la sortie du moteur ne prouverait rien.
 *
 *   npm run test:agregation
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { trimestrielle, moisDeLaPeriode } from "../src/server/periodes/calendrier";
import {
  agreger, inspecterPeriode, PeriodeNonCalculableError, type ValeurAgregee,
} from "../src/server/trimestre/agregation";

const db = new PrismaClient();
const T3_2026 = trimestrielle(2026, 3);

let valeurs: ValeurAgregee[] = [];
let donneesPresentes = false;

before(async () => {
  const etat = await inspecterPeriode(db, T3_2026);
  donneesPresentes = etat.calculable;
  if (donneesPresentes) valeurs = (await agreger(db, T3_2026)).valeurs;
});
after(async () => { await db.$disconnect(); });

const dept = (code: string) => valeurs.find((v) => v.fieldCode === code && v.arrondissementCode === null)!;
const parArr = (code: string) => valeurs.filter((v) => v.fieldCode === code && v.arrondissementCode !== null);

/**
 * Somme, lue directement en base, d'un champ sur un mois donné, tous
 * arrondissements. Interroge les DEUX tables de saisie : un champ de tableau
 * nominatif (œufs, poussins, provende) n'est pas dans `SaisieMatrice`.
 */
async function sommeDuMois(fieldCode: string, annee: number, mois: number): Promise<number | null> {
  const p = await db.periodeReporting.findFirst({ where: { type: "MENSUEL", annee, mois } });
  if (!p) return null;
  const rapport = { periodeId: p.id, statut: { in: ["SOUMIS" as const, "CLOTURE" as const] } };
  const [a, b] = await Promise.all([
    db.saisieMatrice.findMany({ where: { fieldCode, nonRenseigne: false, rapport }, select: { valeur: true } }),
    db.saisieNominative.findMany({ where: { fieldCode, nonRenseigne: false, rapport }, select: { valeur: true } }),
  ]);
  const v = [...a, ...b].map((x) => (x.valeur == null ? null : Number(x.valeur))).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
}

/** Somme des trois mois du trimestre, ou null si aucun mois n'est renseigné. */
async function sommeDuTrimestre(fieldCode: string): Promise<number | null> {
  const mensuelles = await Promise.all(moisDeLaPeriode(T3_2026).map((m) => sommeDuMois(fieldCode, m.annee, m.mois)));
  const renseignees = mensuelles.filter((x): x is number => x != null);
  return renseignees.length ? renseignees.reduce((a, b) => a + b, 0) : null;
}

// --------------------------------------------------------------- préalables

test("les données fictives du trimestre sont en place", async () => {
  const etat = await inspecterPeriode(db, T3_2026);
  assert.ok(
    etat.calculable,
    `T3 2026 non calculable : absents=${etat.moisAbsents.join(",")} incomplets=${etat.moisIncomplets.join(",")}\n` +
      `Lancez : npx tsx scripts/donnees-fictives-trimestre.ts`
  );
  assert.equal(etat.mois.length, 3);
  assert.equal(etat.champsSansRegle.length, 0);
});

// ------------------------------------------------- refus de calculer un faux

test("un trimestre dont les mois n'existent pas est REFUSÉ", async () => {
  const T1 = trimestrielle(2026, 1); // janvier/février/mars 2026 : absents
  await assert.rejects(() => agreger(db, T1), PeriodeNonCalculableError);
  await assert.rejects(
    () => agreger(db, T1),
    (e: Error) => /est un faux/.test(e.message),
    "le refus doit dire pourquoi"
  );
});

test("un aperçu explicitement provisoire peut passer outre", async () => {
  const T1 = trimestrielle(2026, 1);
  const { etat, valeurs: v } = await agreger(db, T1, { autoriserIncomplet: true });
  assert.equal(etat.calculable, false, "l'état reste marqué non calculable");
  assert.equal(etat.moisAbsents.length, 3);
  assert.equal(v.length, 0, "aucun mois source : aucune valeur");
});

// ------------------------------------------------------------ règle SOMME

test("un flux est la somme de ses trois mois, recalculée indépendamment", async () => {
  if (!donneesPresentes) return;
  for (const code of ["T21_ABAT_BOVIN", "T22_VIANDE_BOVIN", "T25_LAIT_FRAIS", "T34_INSP_VIANDE_FUMEE"]) {
    assert.equal(dept(code).valeur, await sommeDuTrimestre(code), code);
    assert.equal(dept(code).regle, "SOMME");
  }
});

test("le moteur lit AUSSI les tableaux nominatifs, pas seulement les matriciels", async () => {
  if (!donneesPresentes) return;
  // 1.3, 1.4, 1.5 et 2.3 sont des tableaux NOMINATIF : leurs valeurs vivent
  // dans SaisieNominative. Le moteur doit tomber sur le même total que la base,
  // que celui-ci soit un nombre ou une absence.
  for (const code of ["T14_OEUFS_PRODUITS", "T15_POULETS_SORTIS", "T23_PROV_PORC"]) {
    assert.equal(dept(code).valeur, await sommeDuTrimestre(code), code);
  }

  const nominatives = await db.saisieNominative.count();
  if (nominatives === 0) {
    console.log(
      "      NOTE : aucune saisie nominative en base locale — les tableaux 1.3, 1.4,\n" +
        "      1.5 et 2.3 sont donc vides. Le chemin nominatif du moteur n'est pas\n" +
        "      exercé sur des valeurs ici ; il le sera sur la base de production."
    );
  }
});

// -------------------------------------------------- règle DERNIERE_VALEUR

test("un stock n'est PAS la somme des trois mois", async () => {
  if (!donneesPresentes) return;
  const v = dept("T11_CHEPTEL_BOVIN");
  const sommeBrute = v.detail.reduce((s, d) => s + (d.valeur ?? 0), 0);
  assert.equal(v.regle, "DERNIERE_VALEUR");
  assert.ok(
    v.valeur! < sommeBrute * 0.5,
    `le cheptel trimestriel (${v.valeur}) devrait être proche d'un seul mois, pas de la somme (${sommeBrute})`
  );
});

test("un stock vaut la dernière valeur renseignée, vérifiée en base", async () => {
  if (!donneesPresentes) return;
  const attendu = await sommeDuMois("T11_CHEPTEL_BOVIN", 2026, 9);
  assert.equal(dept("T11_CHEPTEL_BOVIN").valeur, attendu, "tous les arrondissements ayant renseigné septembre, le trimestre vaut septembre");
});

test("le mois retenu pour un stock est indiqué", async () => {
  if (!donneesPresentes) return;
  const v = parArr("T11_CHEPTEL_BOVIN")[0];
  assert.ok(v.moisRetenu, "un stock doit dire de quel mois vient sa valeur");
  assert.equal(v.moisRetenu!.mois, 9);
  assert.equal(v.moisRetenu!.annee, 2026);
});

// ---------------------------------------- cohérence département / arrondissements

test("la valeur départementale est la somme des six arrondissements", async () => {
  if (!donneesPresentes) return;
  for (const code of ["T21_ABAT_BOVIN", "T11_CHEPTEL_BOVIN", "T25_LAIT_FRAIS"]) {
    const arrs = parArr(code);
    assert.equal(arrs.length, 6, `${code} : six arrondissements attendus`);
    const somme = arrs.reduce((s, v) => s + (v.valeur ?? 0), 0);
    assert.equal(dept(code).valeur, somme, code);
  }
});

// ------------------------------------------------------ moyenne pondérée

test("un prix trimestriel reste dans l'intervalle de ses prix mensuels", async () => {
  if (!donneesPresentes) return;
  const v = dept("T51_BOVIN_VACHE_PRIX_MOYEN");
  assert.equal(v.regle, "MOYENNE_PONDEREE");
  const mensuels = v.detail.map((d) => d.valeur).filter((x): x is number => x != null);
  if (mensuels.length === 0) return;
  const min = Math.min(...mensuels);
  const max = Math.max(...mensuels);
  assert.ok(
    v.valeur! >= min - 0.01 && v.valeur! <= max + 0.01,
    `un prix pondéré (${v.valeur}) ne peut pas sortir de [${min} ; ${max}] — ce serait une somme déguisée`
  );
});

test("un prix n'est jamais la somme des prix mensuels", async () => {
  if (!donneesPresentes) return;
  const v = dept("T51_BOVIN_VACHE_PRIX_MOYEN");
  const somme = v.detail.reduce((s, d) => s + (d.valeur ?? 0), 0);
  if (somme === 0) return;
  assert.notEqual(v.valeur, somme);
});

// ---------------------------------------------------------- traçabilité

test("chaque valeur porte le détail de ses trois mois — c'est « voir le calcul »", () => {
  if (!donneesPresentes) return;
  const echantillon = valeurs.slice(0, 200);
  for (const v of echantillon) {
    assert.equal(v.detail.length, 3, `${v.fieldCode} : trois mois attendus dans le détail`);
    assert.deepEqual(v.detail.map((d) => d.mois), [7, 8, 9], v.fieldCode);
  }
});

test("aucune valeur agrégée sans règle", () => {
  if (!donneesPresentes) return;
  for (const v of valeurs) {
    assert.ok(["SOMME", "DERNIERE_VALEUR", "MOYENNE_PONDEREE"].includes(v.regle), `${v.fieldCode} : ${v.regle}`);
  }
});

test("deux consolidations successives donnent le même résultat", async () => {
  if (!donneesPresentes) return;
  const a = (await agreger(db, T3_2026, { champs: ["T21_ABAT_BOVIN", "T11_CHEPTEL_BOVIN"] })).valeurs;
  const b = (await agreger(db, T3_2026, { champs: ["T21_ABAT_BOVIN", "T11_CHEPTEL_BOVIN"] })).valeurs;
  assert.deepEqual(a, b, "le moteur doit être déterministe");
});

// ------------------------------------------------------------ comparaison N-1

test("le même trimestre de l'année précédente est consolidable", async () => {
  const T3_2025 = trimestrielle(2025, 3);
  const etat = await inspecterPeriode(db, T3_2025);
  assert.ok(etat.calculable, `T3 2025 non calculable : ${etat.moisAbsents.join(",")} ${etat.moisIncomplets.join(",")}`);
  const { valeurs: v } = await agreger(db, T3_2025, { champs: ["T21_ABAT_BOVIN"] });
  const d = v.find((x) => x.arrondissementCode === null)!;
  assert.ok(d.valeur != null && d.valeur > 0, "T3 2025 doit porter une valeur");
  assert.deepEqual(d.detail.map((x) => x.annee), [2025, 2025, 2025]);
});

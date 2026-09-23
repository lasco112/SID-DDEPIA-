/**
 * Vérifie que les liaisons pointent des cases qui existent vraiment.
 *
 * LE DANGER QU'IL COUVRE : une liaison dont le libellé serait mal orthographié
 * ne remplirait aucune case — et ne dirait rien. Le tableau sortirait vide, on
 * croirait la donnée non collectée, et personne ne chercherait l'erreur. Ce
 * test rend cette panne impossible : chaque libellé de liaison doit se
 * retrouver, au caractère près, dans le tableau du canevas qu'il prétend
 * alimenter, et chaque champ cité doit exister en base.
 *
 *   npm run test:liaison
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { LIAISONS, champsMobilises, bilanLiaisons, estLiee, evaluer, liaisonDe, CARCASSE_KG } from "../src/server/trimestre/liaison";
import { SECTION_I } from "../src/server/trimestre/canevas/sectionI";
import { SECTION_BUDGET } from "../src/server/trimestre/canevas/sectionBudget";
import { SECTION_II_BOVIN } from "../src/server/trimestre/canevas/sectionBovin";
import { SECTION_II_OVIN, SECTION_II_CAPRIN, SECTION_II_EQUIDES } from "../src/server/trimestre/canevas/sectionElevages";
import { SECTION_II_PORCIN, SECTION_II_AVICOLE } from "../src/server/trimestre/canevas/sectionPorcinAvicole";
import { SECTION_II_AUTRES, SECTION_III_PECHE } from "../src/server/trimestre/canevas/sectionPecheEtDivers";
import { SECTION_IV_SANTE } from "../src/server/trimestre/canevas/sectionSanteAnimale";
import { colonnesDe, lignesDe } from "../src/server/trimestre/canevas/rendu";
import { regleDuChamp } from "../src/server/trimestre/reglesChamps";
import { type Bloc, type ContexteCanevas } from "../src/server/trimestre/canevas/types";

const db = base;
after(async () => { await db.$disconnect(); });

const CTX: ContexteCanevas = {
  periodeCourt: "T3 2026",
  periodeCourtN1: "T3 2025",
  annee: 2026,
  mois: ["JUILLET", "AOÛT", "SEPTEMBRE"],
  arrondissements: ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"],
};

const SECTIONS = [
  SECTION_I, SECTION_BUDGET, SECTION_II_BOVIN, SECTION_II_OVIN, SECTION_II_CAPRIN,
  SECTION_II_EQUIDES, SECTION_II_PORCIN, SECTION_II_AVICOLE, SECTION_II_AUTRES,
  SECTION_III_PECHE, SECTION_IV_SANTE,
];

/** Tous les tableaux du canevas, par numéro. */
const parNumero = new Map<number, Extract<Bloc, { type: "tableau" }>>();
for (const s of SECTIONS) {
  for (const b of s.blocs) {
    if (b.type === "tableau" && b.numero != null) parNumero.set(b.numero, b);
  }
}

let champsEnBase = new Set<string>();
before(async () => {
  const f = await db.formField.findMany({ where: { actif: true }, select: { code: true } });
  champsEnBase = new Set(f.map((x) => x.code));
});

test("chaque liaison vise un tableau qui existe dans le canevas", () => {
  const manquants = LIAISONS.filter((l) => !parNumero.has(l.numero)).map((l) => l.numero);
  assert.deepEqual(manquants, [], "ces tableaux n'existent pas dans le canevas décrit");
});

test("chaque libellé de liaison existe DANS le tableau qu'il alimente", () => {
  const ecarts: string[] = [];
  for (const l of LIAISONS) {
    const bloc = parNumero.get(l.numero);
    if (!bloc) continue;
    // Selon l'orientation, les catégories sont en colonnes ou en lignes.
    const disponibles = new Set(
      l.orientation === "lignes" ? colonnesDe(bloc, CTX) : lignesDe(bloc, CTX)
    );
    for (const c of l.correspondances) {
      if (!disponibles.has(c.libelle)) {
        ecarts.push(
          `n° ${l.numero} : « ${c.libelle} » ne figure pas parmi ` +
            `${l.orientation === "lignes" ? "les colonnes" : "les lignes"} du tableau\n` +
            `        disponibles : ${Array.from(disponibles).join(" | ")}`
        );
      }
    }
  }
  assert.deepEqual(
    ecarts, [],
    `\n${ecarts.length} liaison(s) pointent une case inexistante — elles ne rempliraient rien, en silence :\n` +
      ecarts.map((e) => `  - ${e}`).join("\n") + "\n"
  );
});

test("chaque champ cité par une liaison existe en base", () => {
  const inconnus = champsMobilises().filter((c) => !champsEnBase.has(c));
  assert.deepEqual(inconnus, [], "ces champs ne sont pas dans FormField");
});

test("chaque champ lié a une règle d'agrégation", () => {
  for (const c of champsMobilises()) {
    assert.doesNotThrow(() => regleDuChamp(c), `${c} : aucune règle d'agrégation`);
  }
});

test("une correspondance sans champ porte toujours son motif", () => {
  const sansMotif: string[] = [];
  for (const l of LIAISONS) {
    for (const c of l.correspondances) {
      if (!estLiee(c) && !c.motif) sansMotif.push(`n° ${l.numero} : « ${c.libelle} »`);
    }
  }
  assert.deepEqual(
    sansMotif, [],
    "une case laissée vide doit dire POURQUOI : sans motif, on ne saura plus si c'est un choix ou un oubli"
  );
});

test("aucun tableau n'est lié deux fois", () => {
  const numeros = LIAISONS.map((l) => l.numero);
  assert.equal(new Set(numeros).size, numeros.length, "deux liaisons visent le même tableau");
});

test("le bilan des liaisons est cohérent", () => {
  const b = bilanLiaisons();
  assert.equal(b.tableaux, LIAISONS.length);
  assert.equal(
    b.casesLiees + b.casesNonCollectees,
    // Les colonnes TOTAL alimentées directement (`total`) comptent pour une rubrique.
    LIAISONS.reduce((s, l) => s + l.correspondances.length + (l.total ? 1 : 0), 0)
  );
  console.log(
    `      ${b.tableaux} tableaux liés · ${b.casesLiees} rubriques alimentées · ` +
      `${b.casesNonCollectees} non collectées`
  );
  assert.ok(b.casesLiees >= 100, `régression : ${b.casesLiees} rubriques alimentées au lieu de 100 au minimum`);
});

// ------------------------------------------------------------ calculs (étape c1)

/** Un lecteur de champs à partir d'un dictionnaire : ce qui manque vaut « non renseigné ». */
const lecteur = (v: Record<string, number>) => (champ: string) => (champ in v ? v[champ] : null);

const formule = (numero: number, libelle: string) => {
  const c = liaisonDe(numero)!.correspondances.find((x) => x.libelle === libelle)!;
  assert.ok(c.formule, `n° ${numero} « ${libelle} » : formule attendue`);
  return c.formule!;
};

test("viande : abattages × norme de carcasse du Délégué, en tonnes", () => {
  assert.equal(CARCASSE_KG.bovin, 150, "un bovin : 60 % de 250 kg");
  const bovins = liaisonDe(18)!.total!;
  assert.equal(evaluer(bovins, lecteur({ T21_ABAT_BOVIN: 1000 })), 150);
  assert.equal(evaluer(liaisonDe(40)!.total!, lecteur({ T21_ABAT_PORCIN: 100 })), 7);
  assert.equal(evaluer(formule(25, "Quantité en tonnes"), lecteur({ T21_ABAT_OVIN: 50 })), 1);
  assert.equal(evaluer(formule(30, "Quantité de viande (en tonnes)"), lecteur({ T21_ABAT_CAPRIN: 50 })), 1);
  assert.equal(evaluer(liaisonDe(46)!.total!, lecteur({ T21_ABAT_VOLAILLE: 500 })), 1);
  // Aucun abattage déclaré : la case reste vide, jamais « 0 » inventé.
  assert.equal(evaluer(bovins, lecteur({})), null);
});

test("conversions d'unités : m² en ha, tonnes en kg, alvéoles en œufs", () => {
  assert.equal(evaluer(formule(63, "Superficie en Ha"), lecteur({ T17_SUPERFICIE: 25_000 })), 2.5);
  assert.equal(evaluer(formule(63, "Qté de poissons (en kg)"), lecteur({ T17_POISSON_TILAPIA: 1.5, T17_POISSON_CLARIAS: 0.5 })), 2000);
  const oeufs = liaisonDe(72)!.correspondances.find((c) => c.libelle === "Œufs de table (unité)")!;
  assert.equal(evaluer(oeufs.formule!, lecteur({ T34_INSP_OEUFS: 10 })), 300);
});

test("commercialisation : vendus, ressources = vendus × prix, prix moyen pondéré", () => {
  const v = lecteur({
    T53_CAPRIN_BOUC_VENDU_D1: 10, T53_CAPRIN_BOUC_VENDU_D2: 5, T53_CAPRIN_BOUC_PRIX_MOYEN: 30_000,
    T53_CAPRIN_CHEVRE_VENDU_D1: 5, T53_CAPRIN_CHEVRE_PRIX_MOYEN: 20_000,
  });
  assert.equal(evaluer(formule(31, "Effectifs (en têtes)"), v), 20);
  assert.equal(evaluer(formule(31, "Ressources générées(en M FCFA)"), v), 0.55);
  assert.equal(evaluer(formule(31, "Prix moyen(en FCFA)"), v), 27_500);
  // Une catégorie vendue SANS prix : la somme serait fausse, la case reste vide.
  const sansPrix = lecteur({ T53_CAPRIN_BOUC_VENDU_D1: 10 });
  assert.equal(evaluer(formule(31, "Ressources générées(en M FCFA)"), sansPrix), null);
});

test("les bandes additionnent élevages moderne et traditionnel", () => {
  const f = liaisonDe(42)!.correspondances.find((c) => c.libelle === "Poulets de chair")!.formule!;
  assert.equal(evaluer(f, lecteur({ T12_VOL_MOD_POULET_CHAIR: 1000, T12_VOL_TRAD_POULET_CHAIR: 200 })), 1200);
});

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
import { PrismaClient } from "@prisma/client";
import { LIAISONS, champsMobilises, bilanLiaisons } from "../src/server/trimestre/liaison";
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

const db = new PrismaClient();
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
      if (!c.champ && !c.motif) sansMotif.push(`n° ${l.numero} : « ${c.libelle} »`);
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
    LIAISONS.reduce((s, l) => s + l.correspondances.length, 0)
  );
  console.log(
    `      ${b.tableaux} tableaux liés · ${b.casesLiees} rubriques alimentées · ` +
      `${b.casesNonCollectees} non collectées`
  );
  assert.ok(b.casesLiees >= 26, `régression : ${b.casesLiees} rubriques alimentées au lieu de 26 au minimum`);
});

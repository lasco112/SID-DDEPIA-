/**
 * Les huit départements de l'Ouest, tels que le Délégué les a confirmés le
 * 14 octobre 2026 : chacun avec SES arrondissements, dans l'ordre, le compte de
 * son DD et un compte de DA par arrondissement — tous éteints tant que
 * l'administrateur du système ne les a pas lancés.
 *
 *   node --env-file=.env --import tsx --test tests/departements-ouest.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { baseBrute } from "../src/lib/baseDeTravail";
import { clientCloisonne } from "../src/lib/dbCloisonne";
import { composerIdentite } from "../src/lib/departement";

after(() => baseBrute.$disconnect());

/** La réalité de chaque département, confirmée par le Délégué. */
const CONFIRMES: Record<string, { article: string; dd: string; arrondissements: string[] }> = {
  BAM: { article: "des Bamboutos", dd: "dd.bamboutos", arrondissements: ["Babadjou", "Batcham", "Galim", "Mbouda"] },
  HNK: { article: "du Haut-Nkam", dd: "dd.hautnkam", arrondissements: ["Bafang", "Bakou", "Bana", "Bandja", "Banka", "Banwa", "Kékem"] },
  HPL: { article: "des Hauts-Plateaux", dd: "dd.hautsplateaux", arrondissements: ["Baham", "Bamendjou", "Bangou", "Batié"] },
  KKH: { article: "du Koung-Khi", dd: "dd.koungkhi", arrondissements: ["Bandjoun", "Bayangam", "Djebem"] },
  MIF: { article: "de la Mifi", dd: "dd.mifi", arrondissements: ["Bafoussam I", "Bafoussam II", "Bafoussam III"] },
  NDE: { article: "du Ndé", dd: "dd.nde", arrondissements: ["Bangangté", "Bassamba", "Bazou", "Tonga"] },
  NOU: { article: "du Noun", dd: "dd.noun", arrondissements: ["Bangourain", "Foumban", "Foumbot", "Kouoptamo", "Koutaba", "Magba", "Malantouen", "Massangam", "Njimom"] },
};

test("chaque département a ses arrondissements, dans l'ordre confirmé", async () => {
  for (const [code, attendu] of Object.entries(CONFIRMES)) {
    const d = await baseBrute.departement.findUniqueOrThrow({ where: { code } });
    assert.equal(composerIdentite(d).nomAvecArticle, attendu.article, code);
    const arr = await clientCloisonne(baseBrute, d.id).arrondissement.findMany({ orderBy: { ordre: "asc" }, select: { nom: true } });
    assert.deepEqual(arr.map((a) => a.nom), attendu.arrondissements, code);
  }
});

test("un DD et un DA par arrondissement, éteints, sans mot de passe utilisable", async () => {
  for (const [code, attendu] of Object.entries(CONFIRMES)) {
    const d = await baseBrute.departement.findUniqueOrThrow({ where: { code } });
    const comptes = await clientCloisonne(baseBrute, d.id).user.findMany({
      where: { role: { in: ["DD", "DA"] }, lastLoginAt: null },
      select: { username: true, role: true, actif: true, passwordHash: true, arrondissement: { select: { nom: true } } },
    });
    const dd = comptes.filter((c) => c.role === "DD");
    assert.ok(dd.some((c) => c.username === attendu.dd), `${code} : compte ${attendu.dd}`);
    const das = comptes.filter((c) => c.role === "DA").map((c) => c.arrondissement?.nom).sort();
    assert.deepEqual(das, [...attendu.arrondissements].sort(), `${code} : un DA par arrondissement`);
    // Tant que le département n'est pas lancé, aucun compte jamais connecté
    // n'est utilisable : ni actif, ni ouvrable par un mot de passe.
    if (!d.actif) {
      for (const c of comptes) {
        assert.equal(c.actif, false, `${c.username} doit rester inactif`);
        assert.equal(await bcrypt.compare("password123", c.passwordHash).catch(() => false), false);
      }
    }
  }
});

test("chaque département a ses trois modèles Word du mensuel", () => {
  for (const code of ["MEN", ...Object.keys(CONFIRMES)]) {
    for (const modele of ["rapport_mensuel_DD", "rapport_mensuel_DA", "rapport_mensuel_exact"]) {
      assert.ok(fs.existsSync(path.join(process.cwd(), "templates", `${modele}_${code}.docx`)), `${modele}_${code}.docx`);
    }
  }
});

test("les codes d'arrondissement sont uniques dans toute la région", async () => {
  const tous: string[] = [];
  for (const d of await baseBrute.departement.findMany()) {
    tous.push(...(await clientCloisonne(baseBrute, d.id).arrondissement.findMany({ select: { code: true } })).map((a) => a.code));
  }
  assert.equal(new Set(tous).size, tous.length);
});

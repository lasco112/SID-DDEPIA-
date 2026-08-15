/**
 * Ce qui distingue le rapport d'un DA de celui du DD.
 *
 * Ces règles ont été payées : à la première tentative, le rapport de Dschang
 * portait l'introduction du Délégué départemental, ses missions, sa vision, et
 * s'intitulait « PRÉSENTATION GÉOGRAPHIQUE DU DÉPARTEMENT DE LA MENOUA ». Un DA
 * l'aurait signé sans le voir. Le test relit le .docx PRODUIT — pas la
 * description, pas l'intention — parce que c'est le document qui est signé.
 *
 *   node --import tsx --test tests/rapport-arrondissement.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { base } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { genererRapportCanevas, SECTIONS_CANEVAS } from "../src/server/trimestre/rapportCanevas";
import { adapterTitre } from "../src/server/trimestre/canevas/types";
import { TEXTES_FIXES } from "../src/server/trimestre/canevas/textesFixes";
import { TEXTES_ARRONDISSEMENTS } from "../src/server/trimestre/canevas/textesArrondissements";

const db = base;
const P = trimestrielle(2026, 3);

/** Le texte visible du document, apostrophes et espaces normalisés. */
function texteDu(buffer: Buffer): string {
  const xml = new PizZip(buffer).file("word/document.xml")!.asText();
  return xml.replace(/<[^>]+>/g, " ").replace(/&apos;/g, "’").replace(/'/g, "’").replace(/\s+/g, " ");
}

const nu = (t: string) => t.replace(/'/g, "’").replace(/\s+/g, " ").trim();

async function produire(arrondissement?: string) {
  const r = await genererRapportCanevas(db, P, { autoriserIncomplet: true, arrondissement });
  return { ...r, texte: texteDu(r.buffer) };
}

test("un rapport d'arrondissement ne porte AUCUN texte du Délégué départemental", async () => {
  const { texte } = await produire("Dschang");
  for (const [cle, fixe] of Array.from(TEXTES_FIXES)) {
    const debut = nu(fixe).slice(0, 80);
    assert.ok(
      !texte.includes(debut),
      `Le texte départemental « ${cle} » figure dans le rapport de Dschang : ` +
        `le DA signerait le texte de son chef.`
    );
  }
});

test("il porte ses propres textes fixes", async () => {
  const { texte } = await produire("Dschang");
  const siens = TEXTES_ARRONDISSEMENTS.get("Dschang");
  assert.ok(siens?.presentation, "La présentation de Dschang doit être extraite de son rapport réel.");
  assert.ok(
    texte.includes(nu(siens!.presentation!).slice(0, 80)),
    "Sa présentation, extraite de son propre rapport, doit ressortir dans le document."
  );
});

test("les titres sont transposés au niveau de l'arrondissement", async () => {
  const { texte } = await produire("Dschang");
  assert.ok(texte.includes("DE L’ARRONDISSEMENT DE DSCHANG"), "Les titres doivent nommer l'arrondissement.");
  assert.ok(
    !texte.includes("DU DÉPARTEMENT DE LA MENOUA"),
    "Aucun titre ne doit encore parler du département."
  );

  const ctx = {
    periodeCourt: "T3 2026", periodeCourtN1: "T3 2025", annee: 2026,
    mois: ["JUILLET", "AOÛT", "SEPTEMBRE"], arrondissements: ["Dschang"], arrondissement: "Dschang",
  };
  const titres = SECTIONS_CANEVAS.flatMap((s) =>
    s.blocs.filter((b) => b.type === "titre").map((b) => adapterTitre((b as { texte: string }).texte, ctx))
  );
  const restés = titres.filter((t) => /\bDDEPIA\b|DÉPARTEMENT DE LA MENOUA/.test(t));
  assert.deepEqual(restés, [], "Ces titres parlent encore du département dans un rapport d'arrondissement.");
});

test("le rapport d'un DA porte les lignes DA, jamais les lignes DD", async () => {
  const { texte } = await produire("Dschang");

  /*
   * Un arrondissement ne possède pas de DDEPIA. La ligne « DDEPIA » des
   * tableaux du personnel et des infrastructures, et la colonne « DDEPIA » du
   * tableau 13 des recettes, sont la structure du chef : les laisser
   * reviendrait à faire rendre compte au DA de ce qui ne lui appartient pas.
   */
  assert.ok(
    !/\bDDEPIA\b/.test(texte),
    "Une ligne ou une colonne DDEPIA subsiste dans le rapport d'un arrondissement."
  );

  // Et l'inverse, qui est le vrai risque : ne pas emporter sa ligne à lui —
  // « DAEPIA » ne diffère de « DDEPIA » que d'une lettre.
  assert.ok(texte.includes("DAEPIA"), "La ligne DAEPIA, qui est la sienne, doit rester.");
});

test("le rapport départemental garde ses lignes DDEPIA", async () => {
  const { texte } = await produire();
  assert.ok(
    /\bDDEPIA\b/.test(texte),
    "La DDEPIA est une structure du département : elle a sa ligne dans le rapport du DD."
  );
});

test("il ne porte qu'une seule colonne territoriale — la sienne", async () => {
  const { texte } = await produire("Fokoué");
  for (const autre of ["Dschang", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"]) {
    assert.ok(
      !texte.includes(` ${autre} `),
      `« ${autre} » figure dans le rapport de Fokoué : le canevas doit être ramené à un seul territoire.`
    );
  }
});

test("il est signé par le DA, le rapport départemental par le DD", async () => {
  const [arr, dept] = [await produire("Dschang"), await produire()];
  assert.ok(arr.texte.includes("Le Délégué d’Arrondissement"));
  assert.ok(!arr.texte.includes("Le Délégué Départemental"));
  assert.ok(dept.texte.includes("Le Délégué Départemental"));
});

test("les chiffres d'un arrondissement sont les siens, pas ceux du département", async () => {
  const chiffres = (t: string) => (t.match(/\b\d+[,.]?\d*\b/g) ?? []).join("|");
  const [ds, fk, dd] = [await produire("Dschang"), await produire("Fokoué"), await produire()];
  assert.notEqual(chiffres(ds.texte), chiffres(fk.texte), "Deux arrondissements ne peuvent pas porter les mêmes chiffres.");
  assert.notEqual(chiffres(ds.texte), chiffres(dd.texte), "Un arrondissement ne peut pas porter les chiffres du département.");
});

test("le rapport départemental garde ses six colonnes et ses textes", async () => {
  const { texte } = await produire();
  for (const a of ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"]) {
    assert.ok(texte.includes(a), `« ${a} » doit figurer en colonne du rapport départemental.`);
  }
  const intro = TEXTES_FIXES.get("I.introduction");
  assert.ok(intro && texte.includes(nu(intro).slice(0, 80)), "L'introduction du DD doit rester dans SON rapport.");
});

test("un arrondissement inconnu est refusé, pas silencieusement ignoré", async () => {
  await assert.rejects(
    () => genererRapportCanevas(db, P, { autoriserIncomplet: true, arrondissement: "Bafoussam" }),
    /Arrondissement inconnu/,
    "Un nom hors du département doit faire échouer la génération."
  );
});

test.after(async () => { await db.$disconnect(); });

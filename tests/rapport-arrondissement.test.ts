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
import { adapterTitre, resoudre } from "../src/server/trimestre/canevas/types";
import { TEXTES_FIXES } from "../src/server/trimestre/canevas/textesFixes";
import { TEXTES_ARRONDISSEMENTS } from "../src/server/trimestre/canevas/textesArrondissements";

const db = base;
const P = trimestrielle(2026, 3);

/** Le texte des seuls TABLEAUX du document : leurs en-têtes portent les territoires. */
function texteDesTableaux(buffer: Buffer): string {
  const xml = new PizZip(buffer).file("word/document.xml")!.asText();
  return (xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

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
    // La bibliographie cite des publications que les deux niveaux partagent :
    // une référence commune n'est pas le texte du Délégué recopié.
    if (cle === "bibliographie") continue;
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
  assert.ok(siens?.["I1.organisation"], "L'organisation de la DAEPIA de Dschang doit avoir un texte.");
  for (const cle of ["I1.organisation", "I.geo.relief", "I.geo.pedologie", "I.geo.demographie", "I1.missions"] as const) {
    assert.ok(
      texte.includes(nu(siens![cle]).slice(0, 60)),
      `Son texte « ${cle} » doit ressortir dans son document.`
    );
  }
  // Démographie : le recensement de 2005, comme au rapport départemental.
  assert.ok(texte.includes("101 385"), "La population de Dschang est celle du recensement de 2005.");
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
  const complet = (await produire("Dschang")).texte;
  // La liste des acronymes DÉFINIT « DDEPIA » : c'est un glossaire, pas une
  // ligne de tableau. On la met de côté pour ce contrôle.
  // lastIndexOf : le titre figure d'abord dans la table des matières.
  const debutGlossaire = complet.lastIndexOf("LISTE DES ACRONYMES, SIGLES ET ABRÉVIATIONS");
  const finGlossaire = complet.indexOf("INTRODUCTION", debutGlossaire);
  assert.ok(debutGlossaire > 0 && finGlossaire > debutGlossaire, "Liste des acronymes introuvable.");
  const texte = complet.slice(0, debutGlossaire) + complet.slice(finGlossaire);

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
  // Les TABLEAUX seulement : un texte peut nommer un arrondissement voisin
  // (« limitée au sud par l'arrondissement de Santchou »), un tableau non.
  const texte = texteDesTableaux((await produire("Fokoué")).buffer);
  for (const autre of ["Dschang", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"]) {
    assert.ok(
      !texte.includes(` ${autre} `),
      `« ${autre} » figure dans le rapport de Fokoué : le canevas doit être ramené à un seul territoire.`
    );
  }
});

test("il est signé par le DA, le rapport départemental par le DD", async () => {
  const [arr, dept] = [await produire("Dschang"), await produire()];
  // Signature de la page de garde, sans nom (décision D5) : le cachet la complète.
  assert.ok(arr.texte.includes("LE DÉLÉGUÉ D’ARRONDISSEMENT,"));
  assert.ok(!arr.texte.includes("LE DÉLÉGUÉ DÉPARTEMENTAL"));
  assert.ok(dept.texte.includes("LE DÉLÉGUÉ DÉPARTEMENTAL,"));
});

test("la page de garde est celle du rapport départemental, calculée pour la période", async () => {
  const [arr, dept] = [await produire("Dschang"), await produire()];
  for (const attendu of [
    "RÉPUBLIQUE DU CAMEROUN",
    "REPUBLIC OF CAMEROON",
    "DÉLÉGATION DÉPARTEMENTALE DE LA MENOUA",
    "BP : 55 DSCHANG",
    "RAPPORT TRIMESTRIEL DES ACTIVITÉS DE LA DÉLÉGATION DÉPARTEMENTALE",
    "(JUILLET – SEPTEMBRE 2026)",
    "RAPPORT DU TROISIÈME TRIMESTRE 2026",
    "TABLE DES MATIÈRES",
    "LISTE DES ACRONYMES, SIGLES ET ABRÉVIATIONS",
  ]) {
    assert.ok(dept.texte.includes(attendu), `« ${attendu} » manque au rapport départemental.`);
  }
  assert.ok(arr.texte.includes("SUBDIVISIONAL DELEGATION OF DSCHANG"));
  // L'adresse est celle de la délégation départementale, pas celle du DA.
  assert.ok(!arr.texte.includes("BP : 55 DSCHANG"));
  // La note technique « N rubriques sont renseignées automatiquement » n'a pas
  // sa place dans un document officiel.
  assert.ok(!dept.texte.includes("rubriques sont renseignées"));
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
  const ctx = {
    periodeCourt: "T3 2026", periodeCourtN1: "T3 2025", annee: 2026,
    mois: ["JUILLET", "AOÛT", "SEPTEMBRE"], arrondissements: [],
  };
  assert.ok(intro && texte.includes(nu(resoudre(intro, ctx)).slice(0, 80)), "L'introduction du DD doit rester dans SON rapport.");
});

test("l'introduction annonce les mois de SA période, jamais ceux d'une autre", async () => {
  const { texte } = await produire();
  assert.ok(
    texte.includes("Le présent rapport trimestriel d’activités de la DDEPIA/MENOUA couvre la période allant de Juillet à Septembre 2026."),
    "La première phrase de l'introduction doit être calculée pour le troisième trimestre."
  );
  assert.ok(!texte.includes("Janvier à Mars"), "L'introduction annonce encore les mois du premier trimestre.");
  assert.ok(!/\{[A-Z_0-9-]+\}/.test(texte), "Un jeton de période est resté tel quel dans le document.");
});

test("table des matières et liste des tableaux sont écrites d'avance, jamais blanches", async () => {
  for (const arrondissement of [undefined, "Santchou"]) {
    const xml = new PizZip((await produire(arrondissement)).buffer).file("word/document.xml")!.asText();
    const [matieres, tableaux, graphiques] = xml.match(/<w:sdt>[\s\S]*?<\/w:sdt>/g) ?? [];
    const liens = (x = "") => (x.match(/w:anchor="/g) ?? []).length;
    // Autant de lignes que de titres et de légendes réellement présents.
    assert.equal(liens(matieres), (xml.match(/<w:pStyle w:val="Heading[1-4]"\/>/g) ?? []).length);
    assert.equal(liens(tableaux), (xml.match(/<w:fldSimple w:instr="SEQ Tableau/g) ?? []).length);
    assert.ok(liens(tableaux) > 80);
    assert.match(tableaux, /Tableau n° 1 : Structures administratives/);
    assert.match(graphiques ?? "", /Aucun graphique dans ce rapport/);
    // Chaque lien mène à un signet qui existe.
    for (const [, cible] of Array.from(xml.matchAll(/w:anchor="([^"]+)"/g))) assert.ok(xml.includes(`w:name="${cible}"`), cible);
  }
});

test("un arrondissement inconnu est refusé, pas silencieusement ignoré", async () => {
  await assert.rejects(
    () => genererRapportCanevas(db, P, { autoriserIncomplet: true, arrondissement: "Bafoussam" }),
    /Arrondissement inconnu/,
    "Un nom hors du département doit faire échouer la génération."
  );
});

test.after(async () => { await db.$disconnect(); });

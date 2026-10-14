/**
 * La note de situation du DD (demande du 14 octobre 2026) : la période se
 * nomme comme on la dit, la note se calcule sur les mois choisis avec les
 * règles du rapport trimestriel, et sort en PowerPoint, Word et PDF.
 * Base locale (le 3e trimestre 2026 et celui de 2025 y ont des rapports),
 * lecture seule.
 *
 *   node --env-file=.env --import tsx --test tests/note-situation.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { base } from "../src/lib/baseDeTravail";
import { libellePlage, moisEntre, aLaPeriode, preparerNote, ErreurNote, enPhrase } from "../src/server/note/noteSituation";
import { rendreNotePptx } from "../src/server/note/notePptx";
import { rendreNoteDocx } from "../src/server/note/noteDocx";
import { rendreNotePdf } from "../src/server/note/notePdf";

after(() => base.$disconnect());

const m = (annee: number, mois: number) => ({ annee, mois });

test("la période se nomme comme on la dit", () => {
  assert.equal(libellePlage(moisEntre(m(2026, 9), m(2026, 9))), "septembre 2026");
  assert.equal(libellePlage(moisEntre(m(2026, 7), m(2026, 9))), "3e trimestre 2026");
  assert.equal(libellePlage(moisEntre(m(2026, 1), m(2026, 3))), "1er trimestre 2026");
  assert.equal(libellePlage(moisEntre(m(2026, 4), m(2026, 9))), "2e et 3e trimestres 2026");
  assert.equal(libellePlage(moisEntre(m(2025, 10), m(2026, 3))), "du 4e trimestre 2025 au 1er trimestre 2026");
  assert.equal(libellePlage(moisEntre(m(2026, 1), m(2026, 12))), "année 2026");
  assert.equal(libellePlage(moisEntre(m(2026, 7), m(2026, 8))), "de juillet à août 2026");
  assert.equal(libellePlage(moisEntre(m(2025, 11), m(2026, 2))), "de novembre 2025 à février 2026");
  assert.equal(aLaPeriode("3e trimestre 2025"), "au 3e trimestre 2025");
  assert.equal(aLaPeriode("septembre 2025"), "à septembre 2025");
  assert.equal(aLaPeriode("année 2025"), "à l'année 2025");
  assert.equal(enPhrase("Charbon bactéridien"), "charbon bactéridien");
  assert.equal(enPhrase("PPR"), "PPR");
});

test("une période à l'envers, ou trop longue pour une lecture rapide, est refusée", () => {
  assert.throws(() => moisEntre(m(2026, 9), m(2026, 7)), ErreurNote);
  assert.throws(() => moisEntre(m(2024, 1), m(2026, 12)), ErreurNote);
});

test("sans aucun rapport transmis, il n'y a pas de note", async () => {
  await assert.rejects(() => preparerNote(base, m(2031, 1), m(2031, 3)), ErreurNote);
});

test("le 3e trimestre 2026 : chiffres, comparaison à l'an passé, faits saillants, fiabilité", async () => {
  const n = await preparerNote(base, m(2026, 7), m(2026, 9));
  assert.equal(n.periode.libelle, "3e trimestre 2026");
  assert.equal(n.comparaison?.nature, "an_passe");
  assert.equal(n.comparaison?.libelle, "3e trimestre 2025");
  assert.equal(n.couverture.attendus, n.couverture.arrondissements.length * 3);
  assert.equal(n.couverture.transmis.length, n.couverture.arrondissements.length);

  const bovins = n.indicateurs.find((i) => i.cle === "bovins")!;
  assert.ok(bovins.valeur != null && bovins.valeur > 0);
  // Un stock ne s'additionne pas sur trois mois : la note dit ce que dit septembre.
  const septembre = await preparerNote(base, m(2026, 9), m(2026, 9));
  assert.equal(bovins.valeur, septembre.indicateurs.find((i) => i.cle === "bovins")!.valeur, "le cheptel du trimestre est celui du dernier mois");
  // Un flux, lui, s'additionne : le trimestre dépasse le seul mois de septembre.
  const abattages = (x: typeof n) => x.indicateurs.find((i) => i.cle === "abattages")!.valeur!;
  assert.ok(abattages(n) > abattages(septembre));
  // La somme des arrondissements fait le département.
  const somme = bovins.parArrondissement.reduce((s, p) => s + (p.valeur ?? 0), 0);
  assert.equal(somme, bovins.valeur);

  assert.ok(n.faits.length >= 3, "des faits saillants");
  assert.ok(n.faits.every((f) => f.texte.endsWith(".")));
  assert.ok(n.graphiques.cheptel && n.graphiques.cheptel.categories.length === n.couverture.arrondissements.length);
});

test("la note sort en PowerPoint (8 diapositives au plus), en Word et en PDF", async () => {
  const n = await preparerNote(base, m(2026, 7), m(2026, 9));
  const retouches = { faits: [{ texte: "Fait écrit par le Délégué.", genre: "info" as const }], remarques: "Campagne PPR en novembre." };

  const pptx = new PizZip(await rendreNotePptx(n, retouches));
  const diapos = Object.keys(pptx.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
  assert.ok(diapos.length >= 4 && diapos.length <= 8, `${diapos.length} diapositives`);
  const texte = diapos.map((d) => pptx.file(d)!.asText()).join("");
  assert.ok(texte.includes("Fait écrit par le Délégué."), "les faits retouchés remplacent ceux du SID");
  assert.ok(texte.includes("Campagne PPR en novembre."), "les remarques terminent la présentation");
  assert.ok(Object.keys(pptx.files).some((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f)), "de vrais graphiques PowerPoint");

  const docx = new PizZip(await rendreNoteDocx(n, retouches));
  const doc = docx.file("word/document.xml")!.asText();
  assert.ok(!/@@SID-GRAPHIQUE/.test(doc));
  assert.ok(Object.keys(docx.files).some((f) => /chartSid\d+\.xml$/.test(f)), "de vrais graphiques Word");

  const pdf = await rendreNotePdf(n, retouches);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});

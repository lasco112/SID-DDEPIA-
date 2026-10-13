/**
 * Les graphiques du rapport trimestriel (décision D3 du Délégué ; précisée le
 * 13 octobre 2026) : sous leur tableau, dessinés à partir de ses chiffres,
 * numérotés et inscrits à la « LISTE DES GRAPHIQUES ». Le rapport d'un
 * arrondissement porte les mêmes, sur ses seuls chiffres.
 *
 * Écrit sur un trimestre lointain (T2 2031), supprimé à la fin.
 *
 *   node --env-file=.env --import tsx --test tests/graphiques-rapport.test.ts
 */
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { ecrireSaisieCanevas } from "../src/server/trimestre/saisieCanevas";
import { genererRapportCanevas } from "../src/server/trimestre/rapportCanevas";

const P = trimestrielle(2031, 2);
const ARR = ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"];
const BOVINS = ["Taurillon", "Génisse", "Castré", "Taureau", "Vache", "Veau"];
let periodeId: string | null = null;

before(async () => {
  periodeId = await periodeTrimestrielle(base, P);
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const ecrire = (numeroTableau: number, ligne: string, colonne: string, valeur: number) =>
    ecrireSaisieCanevas(base, transaction, periodeId!, { numeroTableau, ligne, colonne }, { valeur }, dd.id);
  // Cheptel bovin : toutes les catégories des six arrondissements — Dschang : 10, 20… 60.
  for (let i = 0; i < ARR.length; i++) for (let k = 0; k < BOVINS.length; k++) await ecrire(14, ARR[i], BOVINS[k], (i + 1) * 10 * (k + 1));
  // Bandes : deux catégories seulement, sur dix-huit.
  for (let i = 0; i < ARR.length; i++) {
    await ecrire(42, "Poussins chair", ARR[i], 100 + i);
    await ecrire(42, "Coquelets", ARR[i], 200 + i);
  }
  // Recettes : un mois, et le total de l'an passé, pour deux régies.
  await ecrire(13, "AVRIL", "Dschang", 50000);
  await ecrire(13, "AVRIL", "DDEPIA", 80000);
  await ecrire(13, "TOTAL T2 2030", "Dschang", 40000);
  await ecrire(13, "TOTAL T2 2030", "DDEPIA", 70000);
  // Ovins : UN seul chiffre — une barre seule ne fait pas un graphique.
  await ecrire(23, "Dschang", "Brebis", 12);
});

after(async () => {
  if (periodeId) {
    await base.saisieCanevas.deleteMany({ where: { periodeId } });
    await base.exportDocument.deleteMany({ where: { periodeId } });
    await base.periodeReporting.delete({ where: { id: periodeId } }).catch(() => {});
  }
  await base.$disconnect();
});

const texte = (x: string) => x.replace(/<[^>]+>/g, "").replace(/&apos;/g, "'").replace(/&amp;/g, "&");

async function rapport(arrondissement?: string) {
  const zip = new PizZip((await genererRapportCanevas(base, P, { autoriserIncomplet: true, arrondissement })).buffer);
  const doc = zip.file("word/document.xml")!.asText();
  const legendes = Array.from(doc.matchAll(/<w:p(?: [^>]*)?>(?:(?!<\/w:p>)[\s\S])*?SEQ Graphique[\s\S]*?<\/w:p>/g), (m) => texte(m[0]));
  /** Le graphique dont la légende porte ce titre : son rang, ses séries, son axe. */
  const graphique = (titre: string) => {
    const rang = legendes.findIndex((l) => l.endsWith(` : ${titre}`)) + 1;
    assert.ok(rang > 0, `le graphique « ${titre} » figure au rapport`);
    const x = zip.file(`word/charts/chartSid${rang}.xml`)!.asText();
    const series = Array.from(x.matchAll(/<c:ser>[\s\S]*?<\/c:ser>/g), (s) => ({
      nom: texte(/<c:tx>[\s\S]*?<c:v>([^<]*)<\/c:v>/.exec(s[0])![1]),
      valeurs: Array.from(/<c:val>[\s\S]*?<\/c:val>/.exec(s[0])![0].matchAll(/<c:v>([^<]*)<\/c:v>/g), (m) => Number(m[1])),
    }));
    const categories = Array.from(/<c:cat>[\s\S]*?<\/c:cat>/.exec(x)![0].matchAll(/<c:v>([^<]*)<\/c:v>/g), (m) => texte(m[1]));
    return { rang, series, categories };
  };
  return { zip, doc, legendes, graphique };
}

// D'autres tests écrivent, en même temps, des rapports MENSUELS de 2031 : un
// tableau qu'ils alimentent peut gagner un graphique ici. On ne vérifie donc
// que les graphiques dont ce test maîtrise les chiffres — et la numérotation.
const rangs = (legendes: string[]) => legendes.map((l) => Number(/^Graphique n° (\d+) : /.exec(l)?.[1]));
const suite = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test("rapport départemental : un graphique sous chaque tableau qui a des chiffres, numérotés dans l'ordre", async () => {
  const r = await rapport();
  assert.deepEqual(rangs(r.legendes), suite(r.legendes.length), "numérotés 1, 2, 3… dans l'ordre du document");
  const recettes = r.graphique("Étude comparative des recettes par régie, T2 2030 et T2 2031");
  const bovins = r.graphique("Cheptel bovin");
  const volaille = r.graphique("La distribution du cheptel avicole, têtes par Arrondissements");
  assert.ok(recettes.rang < bovins.rang && bovins.rang < volaille.rang, "dans l'ordre des tableaux");
  assert.ok(!/@@SID-GRAPHIQUE/.test(r.doc), "aucun repère n'est resté imprimé");
  assert.ok(!/Aucun graphique dans ce rapport/.test(r.doc), "la liste des graphiques n'est plus vide");
  // La liste des graphiques : une entrée par légende.
  const toutLeTexte = texte(r.doc);
  for (const l of r.legendes) assert.ok(toutLeTexte.split(l).length - 1 >= 2, `« ${l} » figure à la liste et sous le graphique`);

  // Chaque graphique est une pièce complète : le dessin, sa feuille de données, ses déclarations.
  const types = r.zip.file("[Content_Types].xml")!.asText();
  const liens = r.zip.file("word/_rels/document.xml.rels")!.asText();
  for (const rang of suite(r.legendes.length)) {
    assert.ok(r.zip.file(`word/charts/chartSid${rang}.xml`), `graphique ${rang}`);
    assert.ok(r.zip.file(`word/embeddings/Graphique_SID_${rang}.xlsx`), `feuille de données ${rang}`);
    assert.ok(types.includes(`/word/charts/chartSid${rang}.xml`), "déclaré aux types");
    assert.ok(liens.includes(`rIdSidGraphique${rang}"`) && r.doc.includes(`r:id="rIdSidGraphique${rang}"`), "relié au document");
  }

  // Le cheptel bovin : les arrondissements en abscisse, une série par catégorie — les chiffres du tableau.
  assert.deepEqual(bovins.categories, ARR);
  assert.deepEqual(bovins.series.map((s) => s.nom), BOVINS);
  assert.deepEqual(bovins.series[0].valeurs, [10, 20, 30, 40, 50, 60], "les taurillons, de Dschang à Santchou");
  assert.deepEqual(bovins.series[5].valeurs, [60, 120, 180, 240, 300, 360], "les veaux");

  // Les recettes : la période face à l'an passé, régie par régie.
  assert.deepEqual(recettes.series.map((s) => s.nom), ["T2 2031", "T2 2030"]);
  assert.deepEqual(recettes.series[0].valeurs, [80000, 50000], "DDEPIA puis Dschang : aucun point pour les régies sans chiffre");

  // La volaille : les six arrondissements, et les deux catégories saisies sur l'axe.
  assert.deepEqual(volaille.series.map((s) => s.nom), ARR);
  assert.ok(volaille.categories.includes("Poussins chair") && volaille.categories.includes("Coquelets"));
  assert.ok(!volaille.categories.includes("Chapons"), "une catégorie sans aucun chiffre n'encombre pas l'axe");
});

test("rapport d'un arrondissement : les mêmes graphiques, sur ses seuls chiffres — une barre par catégorie", async () => {
  const r = await rapport("Dschang");
  assert.deepEqual(rangs(r.legendes), suite(r.legendes.length));
  const bovins = r.graphique("Cheptel bovin");
  assert.deepEqual(bovins.categories, BOVINS, "ses catégories en abscisse");
  assert.deepEqual(bovins.series, [{ nom: "Dschang", valeurs: [10, 20, 30, 40, 50, 60] }]);
  const recettes = r.graphique("Étude comparative des recettes, T2 2030 et T2 2031");
  assert.deepEqual(recettes.categories, ["Dschang"], "sa régie seule : pas la DDEPIA, pas les autres arrondissements");
  assert.deepEqual(recettes.series.map((s) => s.valeurs), [[50000], [40000]]);
  const volaille = r.graphique("La distribution du cheptel avicole, en têtes");
  assert.deepEqual(volaille.series.map((s) => s.nom), ["Dschang"]);
  assert.ok(!/@@SID-GRAPHIQUE/.test(r.doc));
});

test("un tableau qui ne porte qu'un seul chiffre n'a pas de graphique", async () => {
  const r = await rapport();
  // Ovins : une seule brebis saisie — une barre seule ne compare rien.
  assert.ok(!r.legendes.some((l) => /cheptel ovin/.test(l)));
});
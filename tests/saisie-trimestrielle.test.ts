/**
 * Saisie trimestrielle (étape c3, décision D9) : qui saisit quoi, et ce que
 * le rapport en fait.
 *
 * Les droits se jouent case par case : un DA ne doit pouvoir écrire que dans
 * la maille de SON arrondissement, personne ne doit pouvoir écrire une case
 * que le mensuel alimente, ni un total. Et un total doit être la somme de ses
 * cases, pas un chiffre tapé à part.
 *
 * Écrit sur un trimestre lointain (T1 2031), supprimé à la fin.
 *
 *   node --env-file=.env --import tsx --test tests/saisie-trimestrielle.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import PizZip from "pizzip";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { ecrireSaisieCanevas } from "../src/server/trimestre/saisieCanevas";
import { refusDeSaisie, grille, resumer } from "../src/server/trimestre/saisieTrimestrielle";
import { genererRapportCanevas } from "../src/server/trimestre/rapportCanevas";

const P = trimestrielle(2031, 1);
const DD = { role: "DD" };
const BAC = { role: "CHEF_BAC" };
const DA_DSCHANG = { role: "DA", arrondissement: "Dschang" };
const AGENT_DSCHANG = { role: "AGENT_SAISIE", arrondissement: "Dschang" };

let periodeId: string | null = null;

after(async () => {
  if (periodeId) {
    await base.saisieCanevas.deleteMany({ where: { periodeId } });
    await base.exportDocument.deleteMany({ where: { periodeId } });
    await base.rubriqueNarrative.deleteMany({ where: { periodeId } });
    await base.periodeReporting.delete({ where: { id: periodeId } }).catch(() => {});
  }
  await base.$disconnect();
});

test("un DA ne saisit que la ligne de son arrondissement", async () => {
  // Cheptel bovin (n° 14) : arrondissements en lignes, catégories en colonnes.
  assert.equal(await refusDeSaisie(base, P, DA_DSCHANG, 14, "Dschang", "Taurillon"), null);
  assert.equal(await refusDeSaisie(base, P, AGENT_DSCHANG, 14, "Dschang", "Taurillon"), null);
  assert.match((await refusDeSaisie(base, P, DA_DSCHANG, 14, "Fokoué", "Taurillon")) ?? "", /n'existe pas|ressort/);
});

test("un DA saisit sa colonne dans les tableaux du BAC, pas celle de la DDEPIA", async () => {
  // Recettes (n° 13) : les régies en colonnes.
  assert.equal(await refusDeSaisie(base, P, DA_DSCHANG, 13, "JANVIER", "Dschang"), null);
  assert.ok(await refusDeSaisie(base, P, DA_DSCHANG, 13, "JANVIER", "DDEPIA"));
  // Un tableau sans maille territoriale relève du département.
  assert.ok(await refusDeSaisie(base, P, DA_DSCHANG, 11, "DEPENSES C2D", "MONTANT"));
});

test("le chef BAC saisit les tableaux du BAC, et eux seuls", async () => {
  assert.equal(await refusDeSaisie(base, P, BAC, 13, "JANVIER", "DDEPIA"), null);
  assert.equal(await refusDeSaisie(base, P, BAC, 13, "JANVIER", "Fokoué"), null);
  assert.ok(await refusDeSaisie(base, P, BAC, 14, "Dschang", "Taurillon"));
});

test("personne ne saisit une case du mensuel, ni un total", async () => {
  // Le total du cheptel bovin vient du tableau 1.1 du mensuel.
  assert.match((await refusDeSaisie(base, P, DD, 14, "Dschang", "TOTAL T1 2031")) ?? "", /rapports mensuels/);
  // Les vaccinations viennent des listes du mensuel.
  assert.match((await refusDeSaisie(base, P, DD, 64, "Dschang", "PPR")) ?? "", /rapports mensuels/);
  // Un total de cases saisies se calcule.
  assert.match((await refusDeSaisie(base, P, DD, 14, "TOTAL T1 2031", "Taurillon")) ?? "", /calculés/);
  assert.match((await refusDeSaisie(base, P, DD, 13, "JANVIER", "TOTAL")) ?? "", /calculés/);
});

test("budget-programme : seule la réalisation se saisit, l'activité est imposée", async () => {
  const g = await grille(base, P, DD, 104);
  assert.ok(g);
  const premiere = g!.lignes[0];
  const etat = (col: string) => premiere.cases.find((c) => c.colonne === col)?.etat;
  assert.equal(etat("Actions"), "lecture");
  assert.equal(etat("Activités à mener"), "lecture");
  assert.equal(etat("Description du niveau de réalisation"), "saisie");
  assert.equal(premiere.cases.find((c) => c.colonne === "Activités à mener")?.affiche, "Abattages contrôlés");
});

test("la grille d'un DA ne montre que son arrondissement", async () => {
  const g = await grille(base, P, DA_DSCHANG, 14);
  const territoires = g!.lignes.map((l) => l.libelle).filter((l) => !/^TOTAL|^ÉCART/.test(l));
  assert.deepEqual(territoires, ["Dschang"]);
  const saisissables = (await resumer(base, P, DA_DSCHANG)).find((t) => t.numero === 14)?.saisissables;
  assert.equal(saisissables, 6, "les six catégories bovines de Dschang");
});

test("un total est la somme de ses cases saisies, dans l'écran comme dans le rapport", async () => {
  periodeId = await periodeTrimestrielle(base, P);
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const ecrire = (ligne: string, colonne: string, valeur: number) =>
    ecrireSaisieCanevas(base, transaction, periodeId!, { numeroTableau: 14, ligne, colonne }, { valeur }, dd.id);
  await ecrire("Dschang", "Taurillon", 10);
  await ecrire("Fokoué", "Taurillon", 5);

  const g = await grille(base, P, DD, 14);
  const ligneTotal = g!.lignes.find((l) => l.libelle === "TOTAL T1 2031")!;
  const cellule = ligneTotal.cases.find((c) => c.colonne === "Taurillon")!;
  assert.equal(cellule.etat, "total");
  assert.equal(cellule.affiche, "15");

  // Et dans le rapport d'arrondissement : le total de Dschang est le sien.
  const gDA = await grille(base, P, DA_DSCHANG, 14);
  const totalDA = gDA!.lignes.find((l) => l.libelle === "TOTAL T1 2031")!.cases.find((c) => c.colonne === "Taurillon")!;
  assert.equal(totalDA.affiche, "10");

  const rapport = await genererRapportCanevas(base, P, { autoriserIncomplet: true });
  const texte = new PizZip(rapport.buffer).file("word/document.xml")!.asText().replace(/<[^>]+>/g, "|");
  assert.ok(/\|15\|/.test(texte), "le total 15 doit figurer dans le rapport départemental");
});

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
import {
  refusDeSaisie, grille, resumer, attendUnNombre, incoherenceCategories, porteeDeSaisie,
} from "../src/server/trimestre/saisieTrimestrielle";
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
  // Les six catégories bovines de Dschang, et son total du T1 2030 que le SID
  // ne connaît pas (reprise d'historique).
  assert.equal(saisissables, 7, "les six catégories bovines de Dschang et son an passé");
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

test("budget-programme : chaque DA remplit SA version, le DD la sienne", async () => {
  periodeId = periodeId ?? (await periodeTrimestrielle(base, P));
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const COL = "Description du niveau de réalisation";
  const cle = (await grille(base, P, DD, 104))!.lignes[0].cle;

  // Un DA peut écrire dans un tableau sans maille : c'est sa version.
  assert.equal(await refusDeSaisie(base, P, DA_DSCHANG, 104, cle, COL), null);
  assert.equal(await porteeDeSaisie(base, DD, 104), "");
  const porteeDschang = await porteeDeSaisie(base, DA_DSCHANG, 104);
  assert.notEqual(porteeDschang, "");
  // Sa ligne d'un tableau à maille reste la case partagée avec le département.
  assert.equal(await porteeDeSaisie(base, DA_DSCHANG, 14), "");

  const ecrire = (texte: string, portee: string) =>
    ecrireSaisieCanevas(base, transaction, periodeId!, { numeroTableau: 104, ligne: cle, colonne: COL }, { texte }, dd.id, portee);
  await ecrire("REALISATION-DEPARTEMENT", "");
  await ecrire("REALISATION-DSCHANG", porteeDschang);

  const affiche = async (profil: { role: string; arrondissement?: string }) =>
    (await grille(base, P, profil, 104))!.lignes[0].cases.find((c) => c.colonne === COL)!.affiche;
  assert.equal(await affiche(DD), "REALISATION-DEPARTEMENT");
  assert.equal(await affiche(DA_DSCHANG), "REALISATION-DSCHANG");
  assert.equal(await affiche({ role: "DA", arrondissement: "Fokoué" }), null, "Fokoué n'a rien écrit");

  const texte = async (arrondissement?: string) =>
    new PizZip((await genererRapportCanevas(base, P, { autoriserIncomplet: true, arrondissement })).buffer)
      .file("word/document.xml")!.asText();
  const dept = await texte();
  assert.ok(dept.includes("REALISATION-DEPARTEMENT") && !dept.includes("REALISATION-DSCHANG"));
  const dschang = await texte("Dschang");
  assert.ok(dschang.includes("REALISATION-DSCHANG") && !dschang.includes("REALISATION-DEPARTEMENT"));
});

test("reprise d'historique : l'agent saisit l'an passé de SON arrondissement quand le SID l'ignore", async () => {
  // T1 2031 : le SID n'a rien du T1 2030.
  const N1 = "TOTAL T1 2030";
  assert.equal(await refusDeSaisie(base, P, AGENT_DSCHANG, 64, "Dschang", N1), null);
  assert.ok(await refusDeSaisie(base, P, AGENT_DSCHANG, 64, "Fokoué", N1), "pas l'an passé d'un autre");
  // Les totaux et écarts du département se calculent, ils ne se saisissent pas.
  assert.ok(await refusDeSaisie(base, P, DD, 64, "TOTAL T1 2031", N1));

  periodeId = periodeId ?? (await periodeTrimestrielle(base, P));
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const tous = ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"];
  for (let i = 0; i < tous.length; i++) {
    await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 64, ligne: tous[i], colonne: N1 }, { valeur: 100 * (i + 1) }, dd.id);
  }
  const case_ = async (profil: { role: string; arrondissement?: string }, ligne: string, colonne: string) =>
    (await grille(base, P, profil, 64))!.lignes.find((l) => l.cle === ligne)!.cases.find((c) => c.colonne === colonne)!;

  const dschang = await case_(AGENT_DSCHANG, "Dschang", N1);
  assert.equal(dschang.etat, "saisie");
  assert.equal(dschang.affiche, "100");
  // Le département : la somme des six.
  const chiffre = (s: string | null) => (s ?? "").replace(/\s/g, "");
  assert.equal(chiffre((await case_(DD, "TOTAL T1 2031", N1)).affiche), "2100");
  assert.equal(chiffre((await case_(DD, "TOTAL T1 2030", "TOTAL T1 2031")).affiche), "2100");
  // L'écran dit à l'agent ce qu'on attend de lui.
  assert.match((await grille(base, P, AGENT_DSCHANG, 64))!.aide, /année dernière/);
});

test("reprise d'historique : quand le SID connaît l'an passé, c'est lui qui fait foi", async () => {
  // T3 2026 : le cheptel bovin du T3 2025 est dans la base (données de test).
  const P3 = trimestrielle(2026, 3);
  assert.match(
    (await refusDeSaisie(base, P3, AGENT_DSCHANG, 14, "Dschang", "TOTAL T3 2025")) ?? "",
    /rapports mensuels/
  );
});

test("des chiffres partout, sauf dans les colonnes de texte", () => {
  assert.ok(attendUnNombre("DAEPIA"), "structures administratives : un nombre");
  assert.ok(attendUnNombre("Taurillon"));
  assert.ok(!attendUnNombre("Provenance"));
  assert.ok(!attendUnNombre("NOMS ET PRENOMS"));
  assert.ok(!attendUnNombre("Description du niveau de réalisation"));
});

test("la viande ne se saisit jamais : elle se calcule à partir des abattages", async () => {
  assert.match((await refusDeSaisie(base, P, DD, 18, "Dschang", "Taurillon")) ?? "", /rapports mensuels/);
  assert.match((await refusDeSaisie(base, P, DD, 46, "Dschang", "Canards")) ?? "", /rapports mensuels/);
  // Aucun abattage de taurillon n'est saisi (le tableau 14 est le CHEPTEL) :
  // la case de viande reste vide, sans zéro inventé.
  const g = await grille(base, P, DD, 18);
  const dschang = g!.lignes.find((l) => l.cle === "Dschang")!;
  assert.equal(dschang.cases.find((c) => c.colonne === "Taurillon")!.affiche, null, "aucun abattage de taurillon saisi au tableau 16");
});

test("la viande d'une catégorie = ses abattages saisis × poids de carcasse", async () => {
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  periodeId = periodeId ?? (await periodeTrimestrielle(base, P));
  await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 16, ligne: "Dschang", colonne: "Vache" }, { valeur: 20 }, dd.id);
  await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 39, ligne: "Dschang", colonne: "Truies" }, { valeur: 10 }, dd.id);
  const viandeBovine = (await grille(base, P, DD, 18))!.lignes.find((l) => l.cle === "Dschang")!;
  assert.equal(viandeBovine.cases.find((c) => c.colonne === "Vache")!.affiche, "3", "20 vaches × 150 kg = 3 tonnes");
  const viandePorcine = (await grille(base, P, DD, 40))!.lignes.find((l) => l.cle === "Dschang")!;
  assert.equal(viandePorcine.cases.find((c) => c.colonne === "Truies")!.affiche, "0,7", "10 truies × 70 kg = 0,7 tonne");
});

test("infrastructures : le BAC se recopie, et une divergence est signalée", async () => {
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  periodeId = periodeId ?? (await periodeTrimestrielle(base, P));
  const ecrire = (t: number, ligne: string, valeur: number) =>
    ecrireSaisieCanevas(base, transaction, periodeId!, { numeroTableau: t, ligne, colonne: "Fokoué" }, { valeur }, dd.id);
  await ecrire(7, "Abattoir", 1);
  await ecrire(7, "Aire d'abattage", 2);
  let g = await grille(base, P, DD, 15);
  const ligne = () => g!.lignes.find((l) => l.cle === "Infrastructures d'abattages")!.cases.find((c) => c.colonne === "Fokoué")!;
  assert.equal(ligne().affiche, "3", "abattoir + aire d'abattage, repris du BAC");
  assert.equal(ligne().propose, "3");
  assert.equal(ligne().etat, "saisie", "la valeur reprise reste modifiable");
  await ecrire(15, "Infrastructures d'abattages", 4);
  g = await grille(base, P, DD, 15);
  assert.equal(ligne().affiche, "4", "la valeur saisie l'emporte");
  assert.ok(g!.avertissements.some((a) => /Fokoué.*4.*3/.test(a)), "la divergence avec le BAC est signalée");
});

test("sans total mensuel, la somme des catégories ne peut pas être contrôlée : la saisie passe", async () => {
  // T1 2031 : aucun rapport mensuel, donc aucun total à comparer.
  assert.equal(await incoherenceCategories(base, P, DD, 14, "Dschang", "Veau", 3), null);
});

test("catégories ≠ total mensuel : la saisie est refusée, avec l'écart", async () => {
  // Le troisième trimestre 2026 porte des rapports mensuels (données de test).
  // On travaille sur un arrondissement dont les catégories sont encore vides,
  // pour ne jamais toucher à ce que quelqu'un a saisi.
  const T3 = trimestrielle(2026, 3);
  const g = await grille(base, T3, DD, 14);
  const categories = ["Taurillon", "Génisse", "Castré", "Taureau", "Vache"];
  const nombre = (s: string | null) => Number((s ?? "").replace(/[\s\u202f]/g, "").replace(",", "."));
  const libre = g!.lignes.find(
    (l) =>
      !/^TOTAL|^ÉCART/.test(l.cle) &&
      l.cases.every((c) => !["Veau", ...categories].includes(c.colonne) || c.saisi == null) &&
      Number.isFinite(nombre(l.cases.find((c) => c.colonne === "TOTAL T3 2026")!.affiche))
  );
  assert.ok(libre, "aucun arrondissement libre avec un total mensuel : le contrôle n'a pas pu être éprouvé");
  const arr = libre!.cle;
  const total = nombre(libre!.cases.find((c) => c.colonne === "TOTAL T3 2026")!.affiche);

  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const id = await periodeTrimestrielle(base, T3);
  try {
    for (const c of categories) {
      await ecrireSaisieCanevas(base, transaction, id, { numeroTableau: 14, ligne: arr, colonne: c }, { valeur: 1 }, dd.id);
    }
    // Cinq catégories à 1 : le veau doit valoir total − 5.
    assert.equal(await incoherenceCategories(base, T3, DD, 14, arr, "Veau", total - 5), null, "la somme égale au total passe");
    const faux = await incoherenceCategories(base, T3, DD, 14, arr, "Veau", total - 4);
    assert.match(faux ?? "", new RegExp(`^${arr} : la somme des catégories .* doit être égale au cheptel bovin des rapports mensuels .* écart de 1\\.`));
  } finally {
    await base.saisieCanevas.deleteMany({ where: { periodeId: id, numeroTableau: 14, ligne: arr, colonne: { in: categories } } });
  }
});

/**
 * LE TOTAL ÉGALE LA SOMME DES LIGNES (décision du Délégué, 22 octobre 2026) :
 * au tableau 68 des affections récurrentes, une rage ou un charbon soignés en
 * clinique n'ont pas de ligne. Ils ne grossissent plus le TOTAL (80 sous des
 * lignes vides ne se comprenait pas) : ils sont dits sous le tableau et cités
 * dans son analyse. La parvovirose, présente des deux côtés, a sa ligne.
 *
 *   node --env-file=.env --import tsx --test tests/hors-canevas.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { grille, contextePour } from "../src/server/trimestre/saisieTrimestrielle";
import { preparer, fournisseur } from "../src/server/trimestre/remplissage";
import { champsMobilises } from "../src/server/trimestre/liaison";
import { propositions } from "../src/server/trimestre/analyse/analyses";

const T = trimestrielle(2036, 3);
const periodes: string[] = [];

after(async () => {
  const rapports = await base.rapportArrondissement.findMany({ where: { periodeId: { in: periodes } }, select: { id: true } });
  await base.saisieEvenement.deleteMany({ where: { rapportId: { in: rapports.map((r) => r.id) } } });
  await base.rapportArrondissement.deleteMany({ where: { periodeId: { in: periodes } } });
  await base.periodeReporting.deleteMany({ where: { id: { in: periodes } } });
  await base.$disconnect();
});

test("tableau 68 : le TOTAL égale la somme des lignes ; le reste est dit sous le tableau et dans l'analyse", async () => {
  const d = new Date("2036-08-01");
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true } });
  const t33 = await base.formTemplate.findUniqueOrThrow({ where: { code: "T33" }, select: { id: true } });
  let rapportId = "";
  for (const m of [7, 8, 9]) {
    const p = await base.periodeReporting.create({ data: { type: "MENSUEL", annee: 2036, mois: m, dateOuverture: d, dateLimiteDA: d, dateLimiteChef: d, dateLimiteDD: d } });
    periodes.push(p.id);
    const r = await base.rapportArrondissement.create({ data: { periodeId: p.id, arrondissementId: dschang.id, statut: "SOUMIS" } });
    if (m === 8) rapportId = r.id;
  }
  const ligne = (maladie: string, espece: string, effectif: number) =>
    base.saisieEvenement.create({
      data: { rapportId, templateId: t33.id, clientId: `essai-hc-${maladie}-${espece}`, payload: { activite: "ACTE_CONSULTATION", maladie, espece, effectif } },
    });
  await ligne("MAL_RAGE", "ESP_FELIN", 50); // pas de ligne au canevas
  await ligne("MAL_CHARBON_BACTERIDIEN", "ESP_BOVIN", 30); // pas de ligne au canevas
  await ligne("MAL_PARVOVIROSE", "ESP_CANIN", 7); // « Parvovirose » : reliée le 22 octobre 2026
  await ligne("MAL_PASTEURELLOSE", "ESP_BOVIN", 5); // « Pasteurelloses »

  const g = (await grille(base, T, { role: "DD" }, 68))!;
  const lire = (l: string) => g.lignes.find((x) => x.cle === l)!.cases.find((c) => c.colonne === "Dschang")!.affiche;
  assert.equal(lire("Parvovirose"), "7");
  assert.equal(lire("Pasteurelloses"), "5");
  assert.equal(lire("TOTAL"), "12", "le TOTAL égale la somme des lignes, sans la rage ni le charbon");

  // Sous le tableau : ce qui n'a pas de ligne, arrondissement par arrondissement.
  const hors = g.horsCanevas!.find((h) => h.arrondissement === "Dschang")!;
  assert.equal(hors.quantite, 80);
  assert.deepEqual(hors.details.map((x) => x.quantite), [50, 30]);
  assert.match(hors.details[0].nature, /Rage/);

  // Dans l'analyse : citée.
  const ctx = await contextePour(base, T, { role: "DD" });
  const valeur = fournisseur(await preparer(base, T, champsMobilises(), { autoriserIncomplet: true }), ctx);
  const p = propositions(ctx, valeur).find((x) => x.numero === 68)!;
  assert.match(p.texte, /80 cas déclarés dans les rapports mensuels ne correspondent à aucune ligne de ce tableau/);
  assert.match(p.texte, /Dschang 80 \(Rage/);
});

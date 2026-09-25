/**
 * Reprise dans le mois suivant à la TRANSMISSION d'un mois (Fokoué, juillet →
 * août 2026 : juillet fini après l'ouverture d'août, rien n'y était repris).
 *
 * Écrit sur mai et juin 2031, supprimés à la fin.
 *
 *   node --env-file=.env --import tsx --test tests/reprise-mois-suivant.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { reprendreDansMoisSuivant, tableauxNonConfirmes } from "../src/server/periodes/report";

const creees: string[] = [];

after(async () => {
  const rapports = await base.rapportArrondissement.findMany({ where: { periodeId: { in: creees } }, select: { id: true } });
  const ids = rapports.map((r) => r.id);
  await base.saisieMatrice.deleteMany({ where: { rapportId: { in: ids } } });
  await base.saisieNominative.deleteMany({ where: { rapportId: { in: ids } } });
  await base.rapportArrondissement.deleteMany({ where: { id: { in: ids } } });
  await base.periodeReporting.deleteMany({ where: { id: { in: creees } } });
  await base.$disconnect();
});

async function mois(m: number) {
  const d = new Date(Date.UTC(2031, m - 1, 1));
  const p = await base.periodeReporting.create({
    data: { type: "MENSUEL", annee: 2031, mois: m, dateOuverture: d, dateLimiteDA: d, dateLimiteChef: d, dateLimiteDD: d },
  });
  creees.push(p.id);
  return p.id;
}

const rapport = (periodeId: string, arrondissementId: string, statut: "EN_SAISIE" | "SOUMIS" = "EN_SAISIE") =>
  base.rapportArrondissement.create({ data: { periodeId, arrondissementId, statut } });

const cellule = (rapportId: string, fieldCode: string, valeur: number) =>
  base.saisieMatrice.create({
    data: { rapportId, fieldCode, valeur, clientId: `essai-reprise:${rapportId}:${fieldCode}`, modifieLe: new Date() },
  });

test("à la transmission, le mois suivant déjà ouvert reçoit les chiffres — sans rien écraser", async () => {
  const [a, b] = await base.arrondissement.findMany({ select: { id: true }, take: 2, orderBy: { code: "asc" } });
  const champs = await base.formField.findMany({
    where: { template: { type: "MATRICE" } },
    select: { code: true },
    take: 2,
    orderBy: { code: "asc" },
  });
  assert.equal(champs.length, 2, "il faut deux champs de tableau MATRICE");
  const [vide, deja] = champs.map((c) => c.code);

  const mai = await mois(5);
  const juin = await mois(6);

  // Mai : A et B ont saisi. Juin, déjà ouvert : A a commencé (une case), B rien.
  const maiA = await rapport(mai, a.id, "SOUMIS");
  await cellule(maiA.id, vide, 12);
  await cellule(maiA.id, deja, 34);
  const maiB = await rapport(mai, b.id);
  await cellule(maiB.id, vide, 56);
  const juinA = await rapport(juin, a.id);
  await cellule(juinA.id, deja, 99);

  const reprise = await reprendreDansMoisSuivant(base, mai, a.id);
  assert.equal(reprise?.periodeCibleId, juin);
  assert.equal(reprise?.resultat.matrice, 1, "seule la case vide est reprise");

  const repris = await base.saisieMatrice.findFirstOrThrow({ where: { rapportId: juinA.id, fieldCode: vide } });
  assert.equal(Number(repris.valeur), 12);
  assert.equal(repris.reporte, true, "grisée, à confirmer");
  assert.equal(repris.modifieLe, null, "remplaçable par toute vraie saisie sur le serveur");
  assert.ok(repris.syncedAt.getTime() < Date.UTC(1971, 0, 1), "plus ancienne que toute saisie en attente sur le téléphone");

  const saisie = await base.saisieMatrice.findFirstOrThrow({ where: { rapportId: juinA.id, fieldCode: deja } });
  assert.equal(Number(saisie.valeur), 99, "la saisie de juin n'est jamais écrasée");
  assert.equal(saisie.reporte, false);

  // Seul l'arrondissement qui transmet est concerné.
  assert.equal(await base.rapportArrondissement.count({ where: { periodeId: juin, arrondissementId: b.id } }), 0);

  // La transmission de juin reste bloquée tant que la reprise n'est pas confirmée.
  assert.equal((await tableauxNonConfirmes(base, juinA.id)).length, 1);

  // Rejouée : rien de plus.
  assert.equal((await reprendreDansMoisSuivant(base, mai, a.id))?.resultat.matrice, 0);
});

test("un mois suivant déjà transmis, clôturé ou absent ne reçoit rien", async () => {
  const [, , c] = await base.arrondissement.findMany({ select: { id: true }, take: 3, orderBy: { code: "asc" } });
  const [champ] = await base.formField.findMany({ where: { template: { type: "MATRICE" } }, select: { code: true }, take: 1, orderBy: { code: "asc" } });
  const mai = creees[0];
  const juin = creees[1];

  const maiC = await rapport(mai, c.id, "SOUMIS");
  await cellule(maiC.id, champ.code, 7);

  // Juin déjà transmis par C : intouchable.
  const juinC = await rapport(juin, c.id, "SOUMIS");
  assert.equal((await reprendreDansMoisSuivant(base, mai, c.id))?.resultat.matrice, 0);
  assert.equal(await base.saisieMatrice.count({ where: { rapportId: juinC.id } }), 0);

  // Juin clôturé : rien.
  await base.rapportArrondissement.update({ where: { id: juinC.id }, data: { statut: "EN_SAISIE" } });
  await base.periodeReporting.update({ where: { id: juin }, data: { statut: "ARCHIVEE" } });
  assert.equal(await reprendreDansMoisSuivant(base, mai, c.id), null);
  assert.equal(await base.saisieMatrice.count({ where: { rapportId: juinC.id } }), 0);
  await base.periodeReporting.update({ where: { id: juin }, data: { statut: "OUVERTE" } });

  // Pas de mois après juin 2031 : la reprise se fera à son ouverture.
  assert.equal(await reprendreDansMoisSuivant(base, juin, c.id), null);
});

/**
 * LA LIGNE OUBLIÉE PAR LE DA, AJOUTÉE PAR LE CHEF (décision du Délégué, 22
 * octobre 2026) : à Penka-Michel, le DA n'a inscrit que la rage ; le chef SSV
 * ajoute la PPCB au tableau 3.2 du mois — seulement pendant la correction
 * directe que le DD a ouverte à sa section, motif obligatoire, et le trimestre
 * la compte de lui-même.
 *
 *   node --env-file=.env --import tsx --test tests/ajout-ligne-chef.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { ajouterLigneOubliee, refusAjoutLigne } from "../src/server/mensuel/ajoutLigneChef";
import { donnerOrdreCorrection, revoquerOrdreCorrection, ACTION_ORDRE, ACTION_REVOCATION } from "../src/server/trimestre/ordresCorrection";
import { transmettreParLeDD, etatCircuit } from "../src/server/trimestre/circuit";
import { grille } from "../src/server/trimestre/saisieTrimestrielle";

const T = trimestrielle(2035, 1);
const debut = new Date();
const periodes: string[] = [];
let trimestreId: string | null = null;

after(async () => {
  await new Promise((r) => setTimeout(r, 2000));
  const rapports = await base.rapportArrondissement.findMany({ where: { periodeId: { in: periodes } }, select: { id: true } });
  const ids = rapports.map((r) => r.id);
  await base.correction.deleteMany({ where: { saisieEvenement: { rapportId: { in: ids } } } });
  await base.saisieEvenement.deleteMany({ where: { rapportId: { in: ids } } });
  await base.rapportArrondissement.deleteMany({ where: { id: { in: ids } } });
  await base.periodeReporting.deleteMany({ where: { id: { in: periodes } } });
  if (trimestreId) {
    await base.circuitTrimestre.deleteMany({ where: { periodeId: trimestreId } });
    await base.periodeReporting.delete({ where: { id: trimestreId } }).catch(() => {});
  }
  await base.auditLog.deleteMany({ where: { createdAt: { gte: debut }, action: { in: ["AJOUT_LIGNE_CHEF", ACTION_ORDRE, ACTION_REVOCATION] } } });
  await base.notification.deleteMany({ where: { createdAt: { gte: debut } } });
  await base.$disconnect();
});

test("le chef SSV ajoute la PPCB oubliée à Penka — seulement en correction directe, motif obligatoire", async () => {
  const d = new Date("2035-02-01");
  const arrondissements = await base.arrondissement.findMany({ select: { id: true, nom: true } });
  const penka = arrondissements.find((a) => a.nom === "Penka-Michel")!;
  // Les trois mois du trimestre, chaque arrondissement ayant transmis son rapport.
  const mois: string[] = [];
  for (const m of [1, 2, 3]) {
    const p = await base.periodeReporting.create({ data: { type: "MENSUEL", annee: 2035, mois: m, dateOuverture: d, dateLimiteDA: d, dateLimiteChef: d, dateLimiteDD: d } });
    periodes.push(p.id);
    mois.push(p.id);
    for (const a of arrondissements) await base.rapportArrondissement.create({ data: { periodeId: p.id, arrondissementId: a.id, statut: "SOUMIS" } });
  }
  const fevrier = mois[1];
  const t32 = await base.formTemplate.findUniqueOrThrow({ where: { code: "T32" } });
  const chefSSV = await base.user.findFirstOrThrow({ where: { role: "CHEF_SSV", actif: true }, select: { id: true, role: true, username: true, sectionId: true } });
  const chefPSA = await base.user.findFirstOrThrow({ where: { role: "CHEF_PSA", actif: true }, select: { id: true, role: true, username: true, sectionId: true } });
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const demande = {
    templateCode: "T32",
    periodeId: fevrier,
    arrondissementId: penka.id,
    payload: { maladie: "MAL_PPCB", espece: "ESP_BOVIN", effectifVaccine: "120", localites: "Baham" },
    motif: "PPCB vaccinée en février, omise par le DA",
  };

  // Révision fermée : refus, en clair.
  assert.match((await refusAjoutLigne(base, chefSSV, t32, { type: "MENSUEL", annee: 2035, mois: 2 })) ?? "", /correction directe/);
  await assert.rejects(ajouterLigneOubliee(base, chefSSV, demande), /correction directe/);

  // Le DD ouvre la révision à SSV — en relecture d'abord : toujours refusé.
  trimestreId = await periodeTrimestrielle(base, T);
  for (const a of (await etatCircuit(base, T)).arrondissements) {
    if (a.statut !== "TRANSMIS") await transmettreParLeDD(base, transaction, trimestreId, T, a.id, "essai", dd.id);
  }
  await donnerOrdreCorrection(base, transaction, trimestreId, T, "SSV", "", dd.id, "relecture");
  await assert.rejects(ajouterLigneOubliee(base, chefSSV, demande), /correction directe/);

  // Correction directe : sans motif, refusé ; un autre chef, refusé.
  await donnerOrdreCorrection(base, transaction, trimestreId, T, "SSV", "", dd.id, "correction");
  await assert.rejects(ajouterLigneOubliee(base, chefSSV, { ...demande, motif: "" }), /motif est obligatoire/);
  await assert.rejects(ajouterLigneOubliee(base, chefPSA, demande), /Seul le chef de la section/);
  await assert.rejects(ajouterLigneOubliee(base, chefSSV, { ...demande, payload: { maladie: "MAL_PPCB" } }), /chiffre/);
  await assert.rejects(ajouterLigneOubliee(base, chefSSV, { ...demande, payload: { ...demande.payload, maladie: "MAL_INVENTEE" } }), /choix inconnu/);

  // Le trimestre avant : la case Penka-Michel × PPCB du tableau 64.
  const lire = async () => (await grille(base, T, { role: "DD" }, 64))!.lignes.find((l) => l.cle === "Penka-Michel")!.cases.find((c) => c.colonne === "PPCB")!.affiche;
  const avant = await lire();

  // La ligne ajoutée : dans le rapport de février de Penka, tracée, le DA prévenu.
  const ligne = await ajouterLigneOubliee(base, chefSSV, demande);
  assert.equal(ligne.saisiParId, chefSSV.id);
  assert.equal((ligne.payload as Record<string, unknown>).effectifVaccine, 120);
  const trace = await base.correction.findFirst({ where: { saisieEvenementId: ligne.id }, select: { motif: true, valeurAvant: true } });
  assert.equal(trace?.motif, demande.motif);
  const prevenu = await base.notification.count({ where: { declencheur: "AJOUT_LIGNE_CHEF", createdAt: { gte: debut }, destinataire: { arrondissementId: penka.id } } });
  assert.ok(prevenu > 0, "le DA de Penka est prévenu");

  // Le trimestre la compte de lui-même.
  assert.equal(await lire(), String(120 + (Number(avant) || 0)), "Penka × PPCB au tableau 64");

  // Révision fermée : de nouveau refusé.
  await revoquerOrdreCorrection(base, T, "SSV", dd.id);
  await assert.rejects(ajouterLigneOubliee(base, chefSSV, demande), /correction directe/);
});

test("un mois clôturé ne reçoit pas de ligne : le DD le rouvre d'abord", async () => {
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true, role: true, username: true, sectionId: true } });
  const penka = await base.arrondissement.findFirstOrThrow({ where: { nom: "Penka-Michel" }, select: { id: true } });
  const mars = periodes[2];
  await base.periodeReporting.update({ where: { id: mars }, data: { statut: "ARCHIVEE" } });
  await assert.rejects(
    ajouterLigneOubliee(base, dd, {
      templateCode: "T32", periodeId: mars, arrondissementId: penka.id,
      payload: { maladie: "MAL_PPCB", espece: "ESP_BOVIN", effectifVaccine: "5" }, motif: "essai mois clôturé",
    }),
    /clôturée/
  );
});

/**
 * LA RÉVISION DES TABLEAUX par les chefs de section (21 octobre 2026) :
 * discipline — le chef ne touche aux cases des arrondissements (remplies ou
 * vides, listes comprises) que pendant la révision ouverte par le DD ; elle ne
 * s'ouvre qu'après le dépôt de tous les rapports des DA ; le chef la demande,
 * le DD accepte ou refuse, ouvre à une section ou à toutes ; elle se ferme à la
 * validation de la section ou par le DD, et chaque DA reçoit le bilan. Le BAC
 * garde sa liberté.
 *
 *   node --env-file=.env --import tsx --test tests/ordres-correction.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { ecrireSaisieCanevas } from "../src/server/trimestre/saisieCanevas";
import { refusDeSaisie, refusCorrectionAnPasse, chefDuTableau, grille, pointsARevoir, resumer } from "../src/server/trimestre/saisieTrimestrielle";
import { TABLEAUX_CORRIGEABLES } from "../src/server/trimestre/correctionsTrimestre";
import { infoCorrection } from "../src/server/trimestre/corrigerCase";
import { numerosSansMaille } from "../src/server/trimestre/canevas/sections";
import { etatCircuit, validerSection, transmettreParLeDD } from "../src/server/trimestre/circuit";
import {
  donnerOrdreCorrection, revoquerOrdreCorrection, ordresEnCours, demandesEnCours, demanderOrdreCorrection, refuserDemande,
  ouvrirRevisionPourTous, fermerRevisionPourTous, ACTION_ORDRE, ACTION_REVOCATION, ACTION_DEMANDE, ACTION_REFUS,
} from "../src/server/trimestre/ordresCorrection";

const P = trimestrielle(2034, 1);
const N1 = "TOTAL T1 2033";
let periodeId: string | null = null;
const debut = new Date();

after(async () => {
  await new Promise((r) => setTimeout(r, 2000)); // notifications vers les téléphones, en arrière-plan
  if (periodeId) {
    await base.saisieCanevas.deleteMany({ where: { periodeId } });
    await base.circuitTrimestre.deleteMany({ where: { periodeId } });
    await base.periodeReporting.delete({ where: { id: periodeId } }).catch(() => {});
  }
  await base.auditLog.deleteMany({ where: { action: { in: [ACTION_ORDRE, ACTION_REVOCATION, ACTION_DEMANDE, ACTION_REFUS] }, entiteId: "2034-1" } });
  await base.auditLog.deleteMany({ where: { action: "SAISIE_TRIMESTRIELLE", createdAt: { gt: debut }, entiteId: { startsWith: "41 " } } });
  await base.notification.deleteMany({
    where: {
      declencheur: { in: [ACTION_ORDRE, ACTION_REVOCATION, ACTION_DEMANDE, ACTION_REFUS, "BILAN_REVISION_CHEF", "TRANSMISSION_TRIMESTRE_PAR_DD"] },
      createdAt: { gt: debut },
    },
  });
  await base.$disconnect();
});

const PAS_DE_REVISION = /correction directe ouverte par le Délégué/;

test("discipline : rien avant le dépôt de tous les DA ; demande, refus, ouverture, bilan, fermeture", async () => {
  periodeId = await periodeTrimestrielle(base, P);
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true } });
  const fokoue = await base.arrondissement.findFirstOrThrow({ where: { nom: "Fokoué" }, select: { id: true } });
  const da = await base.user.findFirstOrThrow({ where: { role: "DA", arrondissementId: dschang.id }, select: { id: true } });
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const chef = chefDuTableau(41)!;
  const section = chef.replace("CHEF_", "");
  const chefUser = await base.user.findFirst({ where: { role: chef as never, actif: true }, select: { id: true } });

  // Le DA a rempli sa viande (2034) et son an passé.
  await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 41, ligne: "Dschang", colonne: "Viande" }, { valeur: 12 }, da.id);
  await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 41, ligne: "Dschang", colonne: N1 }, { valeur: 30 }, da.id);

  // Révision fermée : ni la case remplie, ni la case VIDE d'un arrondissement, ni l'an passé.
  assert.match((await refusDeSaisie(base, P, { role: chef }, 41, "Dschang", "Viande")) ?? "", PAS_DE_REVISION);
  assert.match((await refusDeSaisie(base, P, { role: chef }, 41, "Fokoué", "Viande")) ?? "", PAS_DE_REVISION);
  assert.match((await refusCorrectionAnPasse(base, P, { role: chef }, 41, "Dschang", N1)) ?? "", /correction directe ouverte/);
  const fermee = await grille(base, P, { role: chef }, 41);
  assert.equal(fermee!.ordreCorrection, false);
  assert.equal(fermee!.axe, "lignes");
  const caseDe = (g: typeof fermee, ligne: string, colonne: string) => g!.lignes.find((l) => l.cle === ligne)!.cases.find((c) => c.colonne === colonne)!;
  assert.equal(caseDe(fermee, "Dschang", "Viande").reservee, true);
  assert.equal(caseDe(fermee, "Fokoué", "Viande").reservee, true);

  // Avant le dépôt de tous les DA : ni ouverture, ni demande.
  await assert.rejects(donnerOrdreCorrection(base, transaction, periodeId, P, section, "", dd.id), /dépôt des rapports/);
  await assert.rejects(demanderOrdreCorrection(base, P, chef, "", chefUser?.id ?? dd.id), /dépôt des rapports/);
  assert.ok(fermee!.ordreSection === undefined || fermee!.ordreSection.depotsManquants!.length > 0);

  // Tous les rapports déposés (par le DD, pour l'essai).
  for (const a of (await etatCircuit(base, P)).arrondissements) {
    if (a.statut !== "TRANSMIS") await transmettreParLeDD(base, transaction, periodeId, P, a.id, "essai", dd.id);
  }

  // Le chef demande ; une seconde demande attend la première ; le DD refuse.
  await demanderOrdreCorrection(base, P, chef, "", chefUser?.id ?? dd.id);
  assert.ok((await demandesEnCours(base, P)).has(chef));
  await assert.rejects(demanderOrdreCorrection(base, P, chef, "encore", chefUser?.id ?? dd.id), /déjà chez le DD/);
  await refuserDemande(base, P, section, "Pas maintenant", dd.id);
  assert.equal((await demandesEnCours(base, P)).has(chef), false);

  // Nouvelle demande, acceptée : la révision s'ouvre avec le motif du chef.
  await demanderOrdreCorrection(base, P, chef, "Viande de Dschang fausse", chefUser?.id ?? dd.id);
  await donnerOrdreCorrection(base, transaction, periodeId, P, section, "", dd.id);
  const o = (await ordresEnCours(base, P)).get(chef);
  assert.equal(o?.motif, "Viande de Dschang fausse");
  assert.equal((await demandesEnCours(base, P)).has(chef), false);
  await assert.rejects(donnerOrdreCorrection(base, transaction, periodeId, P, section, "", dd.id), /déjà ouverte/);

  // Révision ouverte : tout se corrige, plus aucune case réservée.
  assert.equal(await refusDeSaisie(base, P, { role: chef }, 41, "Dschang", "Viande"), null);
  assert.equal(await refusDeSaisie(base, P, { role: chef }, 41, "Fokoué", "Viande"), null);
  assert.equal(await refusCorrectionAnPasse(base, P, { role: chef }, 41, "Dschang", N1), null);
  const ouverte = await grille(base, P, { role: chef }, 41);
  assert.equal(ouverte!.ordreCorrection, true);
  assert.notEqual(caseDe(ouverte, "Dschang", "Viande").reservee, true);
  // Un autre chef n'en profite pas.
  const autre = ["CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"].find((r) => r !== chef)!;
  assert.equal((await ordresEnCours(base, P)).has(autre), false);

  // Le chef corrige Fokoué (comme le fait la route de saisie : la case, et son journal).
  if (chefUser) {
    await ecrireSaisieCanevas(base, transaction, periodeId, { numeroTableau: 41, ligne: "Fokoué", colonne: "Viande" }, { valeur: 7 }, chefUser.id);
    await base.auditLog.create({
      data: {
        userId: chefUser.id,
        action: "SAISIE_TRIMESTRIELLE",
        entite: "SaisieCanevas",
        entiteId: "41 | Fokoué | Viande",
        details: { numeroTableau: 41, ligne: "Fokoué", colonne: "Viande", annee: 2034, trimestre: 1, arrondissement: "Fokoué", ancien: null, nouveau: "7" },
      },
    });
  }

  // Fermée par le DD : le bilan dit ce qui a changé, et Fokoué le reçoit.
  const bilan = await revoquerOrdreCorrection(base, P, section, dd.id);
  if (chefUser) {
    assert.equal(bilan!.cases, 1);
    assert.deepEqual(bilan!.parArrondissement.Fokoué, { cases: 1, tableaux: [41] });
    const recus = await base.notification.count({ where: { declencheur: "BILAN_REVISION_CHEF", createdAt: { gt: debut }, destinataire: { arrondissementId: fokoue.id } } });
    assert.ok(recus > 0, "le DA de Fokoué reçoit le bilan");
  }
  assert.match((await refusDeSaisie(base, P, { role: chef }, 41, "Dschang", "Viande")) ?? "", PAS_DE_REVISION);
  await assert.rejects(revoquerOrdreCorrection(base, P, section, dd.id), /pas ouverte/);
});

test("ouvrir lève la validation ; valider la section ferme la révision", async () => {
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const chef = chefDuTableau(41)!;
  const section = chef.replace("CHEF_", "");
  const chefUser = await base.user.findFirst({ where: { role: chef as never }, select: { id: true } });
  await validerSection(base, transaction, periodeId!, P, chef, chefUser?.id ?? dd.id);
  assert.equal((await etatCircuit(base, P)).sections.find((s) => s.code === section)!.statut, "VALIDE");

  const r = await donnerOrdreCorrection(base, transaction, periodeId!, P, section, "Deuxième relecture", dd.id);
  assert.equal(r.validationAnnulee, true);
  assert.notEqual((await etatCircuit(base, P)).sections.find((s) => s.code === section)!.statut, "VALIDE");

  // Le chef a fini : il valide, la révision se ferme d'elle-même (comme le fait la route du circuit).
  await validerSection(base, transaction, periodeId!, P, chef, chefUser?.id ?? dd.id);
  assert.ok(await revoquerOrdreCorrection(base, P, section, chefUser?.id ?? dd.id, "validation"));
  assert.equal((await ordresEnCours(base, P)).has(chef), false);
  // Rien d'ouvert : la fermeture par validation ne fait rien, sans erreur.
  assert.equal(await revoquerOrdreCorrection(base, P, section, dd.id, "validation"), null);
});

test("ouvrir à toutes les sections, la liste d'un DA, puis tout fermer", async () => {
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true } });
  // Un tableau en liste (sans maille) d'un chef technique : chaque DA y tient sa liste.
  const numero = Array.from(numerosSansMaille()).find((n) => ["CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"].includes(chefDuTableau(n) ?? ""))!;
  const chef = chefDuTableau(numero)!;
  const g = await grille(base, P, { role: chef }, numero);
  assert.ok(g!.versions?.includes("Dschang"), "le chef choisit la liste d'un arrondissement");
  const ligne = g!.lignes[0].cle;
  const colonne = g!.lignes[0].cases.find((c) => c.etat === "saisie")!.colonne;
  // La liste du département est la sienne ; celle de Dschang attend la révision.
  assert.equal(await refusDeSaisie(base, P, { role: chef }, numero, ligne, colonne, ""), null);
  assert.match((await refusDeSaisie(base, P, { role: chef }, numero, ligne, colonne, dschang.id)) ?? "", PAS_DE_REVISION);
  const listeFermee = await grille(base, P, { role: chef }, numero, "Dschang");
  assert.equal(listeFermee!.version, "Dschang");
  assert.equal(listeFermee!.lignes[0].cases.find((c) => c.colonne === colonne)!.reservee, true);

  const ouvertes = await ouvrirRevisionPourTous(base, transaction, periodeId!, P, "", dd.id);
  assert.deepEqual(ouvertes.sort(), ["PSA", "SPAIH", "SSV"]);
  assert.equal((await ordresEnCours(base, P)).size, 3);
  await assert.rejects(ouvrirRevisionPourTous(base, transaction, periodeId!, P, "", dd.id), /déjà ouverte en correction directe pour toutes/);
  assert.equal(await refusDeSaisie(base, P, { role: chef }, numero, ligne, colonne, dschang.id), null);

  assert.deepEqual((await fermerRevisionPourTous(base, P, dd.id)).sort(), ["PSA", "SPAIH", "SSV"]);
  assert.equal((await ordresEnCours(base, P)).size, 0);
  await assert.rejects(fermerRevisionPourTous(base, P, dd.id), /Aucune révision/);
});

test("relecture : le chef relit sans corriger ; il demande la correction directe ; le DD l'y fait passer", async () => {
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const chef = chefDuTableau(41)!;
  const section = chef.replace("CHEF_", "");
  const chefUser = await base.user.findFirst({ where: { role: chef as never, actif: true }, select: { id: true } });

  await donnerOrdreCorrection(base, transaction, periodeId!, P, section, "Relire la viande", dd.id, "relecture");
  const o = (await ordresEnCours(base, P)).get(chef)!;
  assert.equal(o.mode, "relecture");
  // En relecture, le chef ne corrige pas : il rejette au DA.
  assert.match((await refusDeSaisie(base, P, { role: chef }, 41, "Dschang", "Viande")) ?? "", PAS_DE_REVISION);
  assert.equal((await grille(base, P, { role: chef }, 41))!.ordreCorrection, false);
  assert.equal((await grille(base, P, { role: chef }, 41))!.ordreSection!.enCours!.mode, "relecture");
  await assert.rejects(donnerOrdreCorrection(base, transaction, periodeId!, P, section, "", dd.id, "relecture"), /déjà ouverte en relecture/);

  // Le chef demande la correction directe ; le DD l'y fait passer, sans refermer.
  await demanderOrdreCorrection(base, P, chef, "", chefUser?.id ?? dd.id);
  assert.ok((await demandesEnCours(base, P)).has(chef));
  await donnerOrdreCorrection(base, transaction, periodeId!, P, section, "", dd.id, "correction");
  const apres = (await ordresEnCours(base, P)).get(chef)!;
  assert.equal(apres.mode, "correction");
  assert.equal(apres.ouverteLe, o.ouverteLe, "le bilan part toujours de la première ouverture");
  assert.equal((await demandesEnCours(base, P)).has(chef), false);
  assert.equal(await refusDeSaisie(base, P, { role: chef }, 41, "Dschang", "Viande"), null);
  await assert.rejects(demanderOrdreCorrection(base, P, chef, "", chefUser?.id ?? dd.id), /déjà ouverte/);

  // Toutes en relecture : les trois sections passent ou s'ouvrent dans ce mode.
  const touchees = await ouvrirRevisionPourTous(base, transaction, periodeId!, P, "", dd.id, "relecture");
  assert.deepEqual(touchees.sort(), ["PSA", "SPAIH", "SSV"]);
  assert.ok(Array.from((await ordresEnCours(base, P)).values()).every((x) => x.mode === "relecture"));
  await fermerRevisionPourTous(base, P, dd.id);
});

test("« À revoir » : les points des seuls tableaux de la section, les erreurs d'abord", async () => {
  const chef = chefDuTableau(41)!;
  const points = await pointsARevoir(base, P, { role: chef });
  assert.ok(points.length > 0, "Fokoué et les autres n'ont rien saisi : des oublis au moins");
  assert.ok(points.every((p) => chefDuTableau(p.numero) === chef));
  const rangs = points.map((p) => ({ erreur: 0, manque: 1, ecart: 2, variation: 3 })[p.genre as "erreur"]);
  assert.deepEqual(rangs, [...rangs].sort((a, b) => a - b), "les erreurs d'abord, puis les oublis…");
  const oubli = points.find((p) => p.genre === "manque" && p.numero === 41 && p.arrondissement);
  assert.ok(oubli?.arrondissementId, "le point dit quel arrondissement, pour y mener le chef");
});

test("les trois chefs (PSA, SSV, SPAIH) : fermée, relecture, correction directe — chacun dans SA section", async () => {
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const chefs = ["CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"];
  for (const chef of chefs) {
    const section = chef.replace("CHEF_", "");
    const numeros = (await resumer(base, P, { role: chef })).map((t) => t.numero);
    assert.ok(numeros.length > 0, `${chef} : des tableaux`);
    assert.ok(numeros.every((n) => chefDuTableau(n) === chef), `${chef} : seulement sa section`);

    // Une case d'arrondissement d'un de ses tableaux : réservée, révision fermée.
    let cible: { numero: number; ligne: string; colonne: string } | null = null;
    for (const n of numeros) {
      const g = await grille(base, P, { role: chef }, n);
      for (const l of g?.lignes ?? []) {
        const c = l.cases.find((x) => x.reservee);
        if (c) { cible = { numero: n, ligne: l.cle, colonne: c.colonne }; break; }
      }
      if (cible) break;
    }
    assert.ok(cible, `${chef} : une case d'arrondissement`);
    const { numero, ligne, colonne } = cible!;
    assert.match((await refusDeSaisie(base, P, { role: chef }, numero, ligne, colonne)) ?? "", PAS_DE_REVISION, `${chef} : fermée`);
    // Un autre chef n'a jamais la main sur ce tableau.
    const autre = chefs.find((r) => r !== chef)!;
    assert.match((await refusDeSaisie(base, P, { role: autre }, numero, ligne, colonne)) ?? "", /ressort/, `${autre} sur le tableau ${numero}`);

    // Relecture : toujours rien à écrire, mais « À revoir » mène à ses tableaux.
    await donnerOrdreCorrection(base, transaction, periodeId!, P, section, "", dd.id, "relecture");
    assert.match((await refusDeSaisie(base, P, { role: chef }, numero, ligne, colonne)) ?? "", PAS_DE_REVISION, `${chef} : relecture`);
    const points = await pointsARevoir(base, P, { role: chef });
    assert.ok(points.every((p) => chefDuTableau(p.numero) === chef), `${chef} : « À revoir » de sa section seulement`);

    // Correction directe : la case s'écrit, la case grise d'un tableau corrigeable aussi (sur le principe).
    await donnerOrdreCorrection(base, transaction, periodeId!, P, section, "", dd.id, "correction");
    assert.equal(await refusDeSaisie(base, P, { role: chef }, numero, ligne, colonne), null, `${chef} : correction directe`);
    assert.notEqual((await grille(base, P, { role: chef }, numero))!.lignes.find((l) => l.cle === ligne)!.cases.find((c) => c.colonne === colonne)!.reservee, true);
    const corrigeable = numeros.find((n) => TABLEAUX_CORRIGEABLES.has(n));
    if (corrigeable) {
      const g = await grille(base, P, { role: chef }, corrigeable);
      const grise = g!.lignes.flatMap((l) => l.cases.filter((c) => c.etat === "calculee").map((c) => ({ ligne: l.cle, colonne: c.colonne })))
        .find((x) => !/^(TOTAL|ÉCART)/.test(x.ligne) && !/^(TOTAL|ÉCART)/.test(x.colonne));
      if (grise) {
        const info = await infoCorrection(base, P, { role: chef }, corrigeable, grise.ligne, grise.colonne);
        assert.equal(info.estChef && info.aOrdre, true, `${chef} : case grise du tableau ${corrigeable}, correction ouverte`);
      }
    }
    await revoquerOrdreCorrection(base, P, section, dd.id);
    assert.match((await refusDeSaisie(base, P, { role: chef }, numero, ligne, colonne)) ?? "", PAS_DE_REVISION, `${chef} : refermée`);
  }
});

test("le chef BAC garde sa liberté : il corrige la colonne d'un arrondissement sans révision", async () => {
  const dschang = await base.arrondissement.findFirstOrThrow({ where: { nom: "Dschang" }, select: { id: true } });
  const da = await base.user.findFirstOrThrow({ where: { role: "DA", arrondissementId: dschang.id }, select: { id: true } });
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  // Recettes (n° 13) : Dschang a rempli sa colonne de janvier.
  await ecrireSaisieCanevas(base, transaction, periodeId!, { numeroTableau: 13, ligne: "JANVIER", colonne: "Dschang" }, { valeur: 5000 }, da.id);
  assert.equal(await refusDeSaisie(base, P, { role: "CHEF_BAC" }, 13, "JANVIER", "Dschang"), null);
  assert.equal(await refusDeSaisie(base, P, { role: "CHEF_BAC" }, 13, "JANVIER", "DDEPIA"), null);
  // Aucune révision ne s'ouvre au BAC : il n'en a pas besoin.
  await assert.rejects(donnerOrdreCorrection(base, transaction, periodeId!, P, "BAC", "inutile", dd.id), /librement/);
});

/**
 * CE QUE LE DA A OUBLIÉ, COMPLÉTÉ PAR LE CHEF DE SECTION dans le rapport du mois.
 *
 *  - Décision du 22 octobre 2026 : à Penka-Michel, le DA n'a inscrit que la
 *    rage ; le chef SSV ajoute la PPCB au tableau 3.2 du mois, et le trimestre
 *    la compte de lui-même.
 *  - Décision du 6 novembre 2026 (choix « A ») : libre, comme « Corriger
 *    moi-même » — plus besoin de la correction directe du trimestre —, mais
 *    seulement une fois le mois TRANSMIS par le DA ; et le chef peut aussi
 *    remplir une case laissée vide dans un tableau de chiffres.
 *
 *   node --env-file=.env --import tsx --test tests/ajout-ligne-chef.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { ajouterLigneOubliee, refusAjoutLigne } from "../src/server/mensuel/ajoutLigneChef";
import { saisirCaseManquante } from "../src/server/mensuel/saisieManquanteChef";
import { grille } from "../src/server/trimestre/saisieTrimestrielle";
import { CHAMPS_DERIVES, regleDuChamp } from "../src/lib/champsDerives";

const T = trimestrielle(2035, 1);
const debut = new Date();
const periodes: string[] = [];

after(async () => {
  await new Promise((r) => setTimeout(r, 2000));
  const rapports = await base.rapportArrondissement.findMany({ where: { periodeId: { in: periodes } }, select: { id: true } });
  const ids = rapports.map((r) => r.id);
  await base.correction.deleteMany({ where: { OR: [{ saisieEvenement: { rapportId: { in: ids } } }, { saisieMatrice: { rapportId: { in: ids } } }] } });
  await base.saisieEvenement.deleteMany({ where: { rapportId: { in: ids } } });
  await base.saisieMatrice.deleteMany({ where: { rapportId: { in: ids } } });
  await base.rapportArrondissement.deleteMany({ where: { id: { in: ids } } });
  await base.periodeReporting.deleteMany({ where: { id: { in: periodes } } });
  await base.auditLog.deleteMany({ where: { createdAt: { gte: debut }, action: { in: ["AJOUT_LIGNE_CHEF", "SAISIE_MANQUANTE_CHEF"] } } });
  await base.notification.deleteMany({ where: { createdAt: { gte: debut } } });
  await base.$disconnect();
});

/** Les trois mois du trimestre ; Penka-Michel a transmis, Dschang saisit encore. */
async function preparer() {
  const d = new Date("2035-02-01");
  const arrondissements = await base.arrondissement.findMany({ select: { id: true, nom: true } });
  const mois: string[] = [];
  for (const m of [1, 2, 3]) {
    const p = await base.periodeReporting.create({ data: { type: "MENSUEL", annee: 2035, mois: m, dateOuverture: d, dateLimiteDA: d, dateLimiteChef: d, dateLimiteDD: d } });
    periodes.push(p.id);
    mois.push(p.id);
    for (const a of arrondissements) {
      await base.rapportArrondissement.create({ data: { periodeId: p.id, arrondissementId: a.id, statut: a.nom === "Dschang" ? "EN_SAISIE" : "SOUMIS" } });
    }
  }
  return { mois, penka: arrondissements.find((a) => a.nom === "Penka-Michel")!, dschang: arrondissements.find((a) => a.nom === "Dschang")! };
}

let prep: Awaited<ReturnType<typeof preparer>>;

test("ligne oubliée : le chef SSV ajoute la PPCB à Penka, sans correction directe, une fois le mois transmis", async () => {
  prep = await preparer();
  const fevrier = prep.mois[1];
  const t32 = await base.formTemplate.findUniqueOrThrow({ where: { code: "T32" } });
  const chefSSV = await base.user.findFirstOrThrow({ where: { role: "CHEF_SSV", actif: true }, select: { id: true, role: true, username: true, sectionId: true } });
  const chefPSA = await base.user.findFirstOrThrow({ where: { role: "CHEF_PSA", actif: true }, select: { id: true, role: true, username: true, sectionId: true } });
  const demande = {
    templateCode: "T32",
    periodeId: fevrier,
    arrondissementId: prep.penka.id,
    payload: { maladie: "MAL_PPCB", espece: "ESP_BOVIN", effectifVaccine: "120", localites: "Baham" },
    motif: "PPCB vaccinée en février, omise par le DA",
  };

  // Plus besoin d'ordre du DD : le chef de la section le peut.
  assert.equal(await refusAjoutLigne(base, chefSSV, t32, { type: "MENSUEL", annee: 2035, mois: 2 }), null);

  // Dschang n'a pas transmis : son DA saisit encore, refus en clair.
  await assert.rejects(ajouterLigneOubliee(base, chefSSV, { ...demande, arrondissementId: prep.dschang.id }), /pas encore transmis/);
  // Sans motif, un autre chef, une ligne sans chiffre, un choix inventé : refusés.
  await assert.rejects(ajouterLigneOubliee(base, chefSSV, { ...demande, motif: "" }), /motif est obligatoire/);
  await assert.rejects(ajouterLigneOubliee(base, chefPSA, demande), /Seul le chef de la section/);
  await assert.rejects(ajouterLigneOubliee(base, chefSSV, { ...demande, payload: { maladie: "MAL_PPCB" } }), /chiffre/);
  await assert.rejects(ajouterLigneOubliee(base, chefSSV, { ...demande, payload: { ...demande.payload, maladie: "MAL_INVENTEE" } }), /choix inconnu/);

  // Le trimestre avant : la case Penka-Michel × PPCB du tableau 64.
  const lire = async () => (await grille(base, T, { role: "DD" }, 64))!.lignes.find((l) => l.cle === "Penka-Michel")!.cases.find((c) => c.colonne === "PPCB")!.affiche;
  const avant = await lire();

  const ligne = await ajouterLigneOubliee(base, chefSSV, demande);
  assert.equal(ligne.saisiParId, chefSSV.id);
  assert.equal((ligne.payload as Record<string, unknown>).effectifVaccine, 120);
  const trace = await base.correction.findFirst({ where: { saisieEvenementId: ligne.id }, select: { motif: true } });
  assert.equal(trace?.motif, demande.motif);
  const prevenu = await base.notification.count({ where: { declencheur: "AJOUT_LIGNE_CHEF", createdAt: { gte: debut }, destinataire: { arrondissementId: prep.penka.id } } });
  assert.ok(prevenu > 0, "le DA de Penka est prévenu");
  assert.equal(await lire(), String(120 + (Number(avant) || 0)), "le trimestre la compte : Penka × PPCB au tableau 64");
});

test("case oubliée : le chef remplit une case vide d'un tableau de chiffres de sa section", async () => {
  const fevrier = prep.mois[1];
  // Un tableau de chiffres d'une section technique, et un chef de cette section.
  const chefs = await base.user.findMany({ where: { role: { in: ["CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"] }, actif: true }, select: { id: true, role: true, username: true, sectionId: true } });
  const matrices = await base.formTemplate.findMany({ where: { type: "MATRICE", sectionId: { in: chefs.map((c) => c.sectionId!).filter(Boolean) } }, include: { fields: { where: { actif: true }, orderBy: { ordre: "asc" } } }, orderBy: { ordre: "asc" } });
  const tpl = matrices.find((t) => t.fields.some((f) => !regleDuChamp(f.code) && f.typeValeur !== "TEXTE"))!;
  const champ = tpl.fields.find((f) => !regleDuChamp(f.code) && f.typeValeur !== "TEXTE")!;
  const chef = chefs.find((c) => c.sectionId === tpl.sectionId)!;
  const autre = chefs.find((c) => c.sectionId !== tpl.sectionId)!;
  const demande = { templateCode: tpl.code, periodeId: fevrier, arrondissementId: prep.penka.id, fieldCode: champ.code, valeur: "37", motif: "Rapport papier du CZV, confirmé par le DA" };

  await assert.rejects(saisirCaseManquante(base, chef, { ...demande, arrondissementId: prep.dschang.id }), /pas encore transmis/);
  // Étanchéité : un arrondissement d'un autre département n'a aucun rapport visible ici.
  await assert.rejects(saisirCaseManquante(base, chef, { ...demande, arrondissementId: "arr_mbd" }), /pas de rapport/);
  await assert.rejects(ajouterLigneOubliee(base, chef, { templateCode: "T32", periodeId: fevrier, arrondissementId: "arr_mbd", payload: {}, motif: "essai étanchéité" }), /Seul le chef|pas de rapport/);
  await assert.rejects(saisirCaseManquante(base, chef, { ...demande, motif: "x" }), /motif est obligatoire/);
  await assert.rejects(saisirCaseManquante(base, chef, { ...demande, valeur: "beaucoup" }), /nombre/);
  if (autre) await assert.rejects(saisirCaseManquante(base, autre, demande), /Seul le chef de la section/);

  const saisie = await saisirCaseManquante(base, chef, demande);
  assert.equal(Number(saisie.valeur), 37);
  assert.equal(saisie.saisiParId, chef.id);
  const trace = await base.correction.findFirst({ where: { saisieMatriceId: saisie.id }, select: { valeurAvant: true, valeurApres: true, motif: true } });
  assert.deepEqual(trace, { valeurAvant: "(case vide dans le rapport du DA)", valeurApres: "37", motif: demande.motif });
  const prevenu = await base.notification.count({ where: { declencheur: "SAISIE_MANQUANTE_CHEF", createdAt: { gte: debut }, destinataire: { arrondissementId: prep.penka.id } } });
  assert.ok(prevenu > 0, "le DA de Penka est prévenu");

  // Une case déjà remplie se corrige par « Corriger moi-même », jamais d'ici.
  await assert.rejects(saisirCaseManquante(base, chef, demande), /déjà une valeur/);

  // Une ligne calculée (« Somme du tableau … ») : jamais remplie à la main.
  const derive = CHAMPS_DERIVES[0];
  if (derive) {
    const tplDerive = await base.formTemplate.findFirst({ where: { fields: { some: { code: derive.champCible } } }, select: { code: true } });
    if (tplDerive) {
      const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true, role: true, username: true, sectionId: true } });
      await assert.rejects(saisirCaseManquante(base, dd, { ...demande, templateCode: tplDerive.code, fieldCode: derive.champCible }), /somme du tableau/);
    }
  }
});

test("un mois clôturé ne se complète pas : le DD le rouvre d'abord", async () => {
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true, role: true, username: true, sectionId: true } });
  const mars = prep.mois[2];
  await base.periodeReporting.update({ where: { id: mars }, data: { statut: "ARCHIVEE" } });
  await assert.rejects(
    ajouterLigneOubliee(base, dd, {
      templateCode: "T32", periodeId: mars, arrondissementId: prep.penka.id,
      payload: { maladie: "MAL_PPCB", espece: "ESP_BOVIN", effectifVaccine: "5" }, motif: "essai mois clôturé",
    }),
    /clôturée/
  );
});

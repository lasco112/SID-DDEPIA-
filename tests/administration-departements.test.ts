/**
 * L'administration des départements (lot B, décisions du Délégué du
 * 14 octobre 2026) : lancer un département, remettre ses identifiants, purger
 * ses données d'essai — sans jamais toucher à la Menoua, en service.
 *
 * Un département fictif est créé avec un arrondissement, un DD et un DA jamais
 * connectés, et un DA déjà connecté ; tout est supprimé à la fin.
 *
 *   node --env-file=.env --import tsx --test tests/administration-departements.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { baseBrute, base, exigerDepartementDeTravail } from "../src/lib/baseDeTravail";
import { transactionCloisonnee } from "../src/lib/dbCloisonne";
import {
  basculerDepartement, comptesDuDepartement, compterDonnees, etatDesDepartements, fonctionDe, genererIdentifiants, purgerDonnees, reactiverCompte, reinitialiserMotsDePasse, ErreurAdministration,
} from "../src/server/administration/systeme";
import { cleMarqueurPurge, dernierePurge } from "../src/lib/marqueurPurge";
import { rendreFichesIdentifiants } from "../src/server/administration/fichesIdentifiants";
import { motDePasseProvisoire } from "../src/lib/departement";

const DEP = "dep_admin_dep_controle";
const CODE = "ZZD";

function dans<T>(travail: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return transactionCloisonnee(baseBrute, DEP, travail);
}

before(async () => {
  await exigerDepartementDeTravail();
  const region = await baseBrute.region.findFirstOrThrow();
  await baseBrute.departement.upsert({
    where: { id: DEP },
    update: { actif: false },
    create: { id: DEP, code: CODE, nom: "Controle", nomAvecArticle: "du Controle", regionId: region.id, actif: false },
  });
  await dans(async (tx) => {
    await tx.arrondissement.create({ data: { id: "arr_zzd", code: "ZD1", nom: "Ebolowa-Controle", ordre: 1, departementId: DEP } });
    await tx.user.createMany({
      data: [
        { id: "u_zzd_dd", nom: "DD", username: "dd.zzd.controle", passwordHash: "!", role: "DD", actif: false, departementId: DEP },
        { id: "u_zzd_da", nom: "DA", username: "da.zzd.controle", passwordHash: "!", role: "DA", actif: false, arrondissementId: "arr_zzd", departementId: DEP },
        // Un compte déjà utilisé : son titulaire a choisi son mot de passe.
        { id: "u_zzd_connu", nom: "Agent", username: "agent.zzd.controle", passwordHash: "garde-le", role: "AGENT_SAISIE", actif: true, arrondissementId: "arr_zzd", lastLoginAt: new Date(), departementId: DEP },
      ],
    });
    await tx.notification.create({ data: { destinataireId: "u_zzd_da", canal: "IN_APP", message: "essai", declencheur: "ESSAI" } });
  });
});

after(async () => {
  // Le marqueur d'abord : il désigne son auteur, un compte du département fictif.
  await baseBrute.configSysteme.deleteMany({ where: { cle: cleMarqueurPurge(CODE) } });
  await dans(async (tx) => {
    await tx.notification.deleteMany({});
    await tx.auditLog.deleteMany({});
    await tx.user.deleteMany({});
    await tx.arrondissement.deleteMany({});
  });
  await baseBrute.configSysteme.deleteMany({ where: { cle: cleMarqueurPurge(CODE) } });
  await baseBrute.departement.deleteMany({ where: { id: DEP } });
  await baseBrute.$disconnect();
  await base.$disconnect();
});

test("la fiche d'un département dit ce qui manque avant son lancement", async () => {
  const etat = (await etatDesDepartements("dep_menoua")).find((d) => d.id === DEP)!;
  assert.equal(etat.actif, false);
  assert.deepEqual(etat.arrondissements, ["Ebolowa-Controle"]);
  assert.equal(etat.comptes.total, 3);
  assert.equal(etat.comptes.jamaisConnectes, 2);
  assert.ok(etat.manques.some((m) => m.includes("modèles Word")), "sans modèles Word, son rapport mensuel ne se générerait pas");
  const menoua = (await etatDesDepartements("dep_menoua")).find((d) => d.id === "dep_menoua")!;
  assert.equal(menoua.actif, true);
  assert.equal(menoua.estLeMien, true);
  assert.deepEqual(menoua.manques, []);
});

test("un département pas prêt ne se lance pas ; le sien ne s'éteint pas", async () => {
  await assert.rejects(() => basculerDepartement(DEP, true, "dep_menoua"), ErreurAdministration);
  await assert.rejects(() => basculerDepartement("dep_menoua", false, "dep_menoua"), ErreurAdministration);
  assert.equal((await baseBrute.departement.findUniqueOrThrow({ where: { id: DEP } })).actif, false);
});

test("les identifiants ne touchent que les comptes jamais connectés, et le mot de passe remis fonctionne", async () => {
  const ids = await genererIdentifiants(DEP);
  assert.deepEqual(ids.map((i) => i.username), ["dd.zzd.controle", "da.zzd.controle"], "le DD d'abord, et jamais le compte déjà utilisé");
  // Un mot de passe SIMPLE, propre au département (décision du 15 octobre 2026).
  assert.deepEqual(ids.map((i) => i.motDePasse), ["ZZD123", "ZZD123"]);
  assert.equal(ids[0].fonction, "Délégué départemental du Controle");
  assert.equal(ids[1].fonction, "Délégué d'arrondissement d'Ebolowa-Controle");
  const comptes = await dans((tx) => tx.user.findMany({ select: { username: true, passwordHash: true, actif: true, mustChangePassword: true } }));
  for (const i of ids) {
    const c = comptes.find((u) => u.username === i.username)!;
    assert.ok(await bcrypt.compare(i.motDePasse, c.passwordHash), "le mot de passe imprimé ouvre le compte");
    assert.equal(c.actif, true);
    assert.equal(c.mustChangePassword, true, "il devra être changé à la première connexion");
  }
  assert.equal(comptes.find((u) => u.username === "agent.zzd.controle")!.passwordHash, "garde-le");
  const pdf = await rendreFichesIdentifiants(ids, { departement: "Controle", nomAvecArticle: "du Controle", adresse: "https://sid-menoua.xyz", eteint: true });
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});

test("le mot de passe provisoire : l'abréviation du département suivie de 123", () => {
  assert.equal(motDePasseProvisoire("BAM"), "BTOS123");
  assert.equal(motDePasseProvisoire("KKH"), "KKH123");
  assert.equal(motDePasseProvisoire("NOU"), "NOUN123");
  assert.equal(motDePasseProvisoire("MEN"), "password123", "la Menoua garde le mot de passe que ses agents connaissent");
});

test("les libellés de fonction suivent l'article du département", () => {
  assert.equal(fonctionDe("DD", { nom: "Bamboutos", nomAvecArticle: "des Bamboutos" }, null), "Délégué départemental des Bamboutos");
  assert.equal(fonctionDe("DA", { nom: "Bamboutos", nomAvecArticle: "des Bamboutos" }, "Mbouda"), "Délégué d'arrondissement de Mbouda");
});

test("l'administrateur voit les comptes d'un autre département, le DD en tête", async () => {
  const { comptes, motDePasse } = await comptesDuDepartement(DEP, "u_admin_ailleurs");
  assert.equal(motDePasse, "ZZD123");
  assert.deepEqual(comptes.map((c) => c.username), ["dd.zzd.controle", "da.zzd.controle", "agent.zzd.controle"]);
  const agent = comptes.find((c) => c.username === "agent.zzd.controle")!;
  assert.equal(agent.jamaisConnecte, false);
  assert.equal(agent.fonction, "Agent de saisie d'Ebolowa-Controle");
});

test("réinitialiser : un compte déjà utilisé retrouve le mot de passe provisoire, les autres ne bougent pas", async () => {
  const avant = await dans((tx) => tx.user.findMany({ select: { username: true, passwordHash: true } }));
  const r = await reinitialiserMotsDePasse(DEP, { ids: ["u_zzd_connu"] }, "u_admin_ailleurs");
  assert.deepEqual(r.comptes, ["agent.zzd.controle"]);
  const apres = await dans((tx) => tx.user.findMany({ select: { username: true, passwordHash: true, mustChangePassword: true } }));
  const agent = apres.find((u) => u.username === "agent.zzd.controle")!;
  assert.ok(await bcrypt.compare("ZZD123", agent.passwordHash), "le mot de passe oublié est remplacé par le provisoire");
  assert.equal(agent.mustChangePassword, true, "il devra le changer à sa prochaine connexion");
  for (const u of apres.filter((x) => x.username !== "agent.zzd.controle")) {
    assert.equal(u.passwordHash, avant.find((a) => a.username === u.username)!.passwordHash, `${u.username} n'a pas bougé`);
  }
  await assert.rejects(() => reinitialiserMotsDePasse(DEP, { ids: [] }, "u_admin_ailleurs"), ErreurAdministration);
});

test("réinitialiser tout un département : jamais son propre compte, ni un compte désactivé, ni la Menoua", async () => {
  await dans((tx) => tx.user.update({ where: { id: "u_zzd_da" }, data: { actif: false, passwordHash: "desactive" } }));
  const menouaAvant = await transactionCloisonnee(baseBrute, "dep_menoua", (tx) => tx.user.findMany({ select: { id: true, passwordHash: true } }));
  // L'administrateur est ici le DD du département visé : il ne s'enferme pas dehors.
  const r = await reinitialiserMotsDePasse(DEP, { tous: true }, "u_zzd_dd");
  assert.deepEqual(r.comptes, ["agent.zzd.controle"]);
  const seul = await reinitialiserMotsDePasse(DEP, { ids: ["u_zzd_da"] }, "u_zzd_dd");
  assert.deepEqual(seul.desactives, ["da.zzd.controle"], "l'écran prévient : réinitialisé, mais toujours fermé");
  await dans((tx) => tx.user.update({ where: { id: "u_zzd_da" }, data: { passwordHash: "desactive" } }));
  const da = await dans((tx) => tx.user.findUniqueOrThrow({ where: { id: "u_zzd_da" } }));
  assert.equal(da.passwordHash, "desactive");
  assert.equal(da.actif, false, "un compte désactivé n'est pas rallumé");
  // Un compte d'un autre département, désigné par erreur, est ignoré : le cloisonnement tient.
  const menouaId = menouaAvant[0].id;
  await assert.rejects(() => reinitialiserMotsDePasse(DEP, { ids: [menouaId] }, "u_zzd_dd"), ErreurAdministration);
  const menouaApres = await transactionCloisonnee(baseBrute, "dep_menoua", (tx) => tx.user.findMany({ select: { id: true, passwordHash: true } }));
  assert.deepEqual(menouaApres, menouaAvant, "aucun mot de passe de la Menoua n'a bougé");
});

test("réactiver : l'administrateur rouvre un compte désactivé, sans toucher à son mot de passe", async () => {
  // u_zzd_da est désactivé depuis le test précédent, avec le mot de passe « desactive ».
  const r = await reactiverCompte(DEP, "u_zzd_da", "u_admin_ailleurs");
  assert.equal(r.compte, "da.zzd.controle");
  const da = await dans((tx) => tx.user.findUniqueOrThrow({ where: { id: "u_zzd_da" } }));
  assert.equal(da.actif, true);
  assert.equal(da.passwordHash, "desactive", "il garde son mot de passe habituel");
  await assert.rejects(() => reactiverCompte(DEP, "u_zzd_da", "u_admin_ailleurs"), /déjà actif/);
  await assert.rejects(() => reactiverCompte(DEP, "u_zzd_dd", "u_zzd_dd"), /votre propre compte/);
  const menouaId = (await transactionCloisonnee(baseBrute, "dep_menoua", (tx) => tx.user.findFirstOrThrow({ select: { id: true } }))).id;
  await assert.rejects(() => reactiverCompte(DEP, menouaId, "u_admin_ailleurs"), /introuvable dans ce département/, "le cloisonnement tient");
});

test("la purge d'un département n'efface que ses données, et ne touche pas la Menoua", async () => {
  const menouaAvant = await compterDonnees("dep_menoua");
  const marqueurMenoua = await dernierePurge(base, "MEN");
  const supprime = await purgerDonnees(DEP, "u_zzd_dd");
  assert.equal(supprime.notifications, 1);
  assert.equal((await compterDonnees(DEP)).notifications, 0);
  assert.deepEqual(await compterDonnees("dep_menoua"), menouaAvant, "rien n'a bougé à la Menoua");
  assert.equal(await dernierePurge(base, "MEN"), marqueurMenoua, "les téléphones de la Menoua ne se videront pas");
  assert.ok(await dernierePurge(base, CODE), "ceux du département purgé, si");
});

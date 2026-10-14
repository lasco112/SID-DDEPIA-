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
  basculerDepartement, compterDonnees, etatDesDepartements, fonctionDe, genererIdentifiants, purgerDonnees, ErreurAdministration,
} from "../src/server/administration/systeme";
import { cleMarqueurPurge, dernierePurge } from "../src/lib/marqueurPurge";
import { rendreFichesIdentifiants } from "../src/server/administration/fichesIdentifiants";

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

test("les libellés de fonction suivent l'article du département", () => {
  assert.equal(fonctionDe("DD", { nom: "Bamboutos", nomAvecArticle: "des Bamboutos" }, null), "Délégué départemental des Bamboutos");
  assert.equal(fonctionDe("DA", { nom: "Bamboutos", nomAvecArticle: "des Bamboutos" }, "Mbouda"), "Délégué d'arrondissement de Mbouda");
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

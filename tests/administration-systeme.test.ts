/**
 * L'ouverture aux autres départements de l'Ouest (décisions du Délégué du
 * 14 octobre 2026) — ce qui protège la Menoua, en service, de ses voisins :
 *
 *   - un département préparé reste ÉTEINT : ses comptes ne se connectent pas ;
 *   - la purge des données d'essai d'un département ne touche pas le marqueur
 *     des autres — sinon tous les téléphones de la Menoua se videraient ;
 *   - les actions d'administration sont refusées à un DD ordinaire ;
 *   - les textes fixes de la Menoua ne sortent jamais chez un autre.
 *
 * Un département fictif est créé, éteint, avec un DD ; tout est supprimé à la
 * fin, y compris si le test échoue.
 *
 *   node --env-file=.env --import tsx --test tests/administration-systeme.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { baseBrute, base, exigerDepartementDeTravail } from "../src/lib/baseDeTravail";
import { transactionCloisonnee } from "../src/lib/dbCloisonne";
import { authOptions } from "../src/lib/auth";
import { departementEteint, invaliderCacheDepartements, assertAdminSysteme, ForbiddenError, type SessionUser } from "../src/lib/permissions";
import { MESSAGE_DEPARTEMENT_ETEINT } from "../src/lib/messagesConnexion";
import { cleMarqueurPurge, dernierePurge } from "../src/lib/marqueurPurge";
import { textesFixesDe } from "../src/server/trimestre/canevas/textesFixes";

const AUTRE = "dep_admin_controle";
const CODE_AUTRE = "ZZA";
const DD_AUTRE = { id: "user_admin_controle", username: "dd.admin.controle" };
// Un mot de passe d'essai tiré au sort, qui n'existe que le temps du test.
const MOT_DE_PASSE = randomBytes(12).toString("hex");

function dans<T>(departementId: string, travail: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return transactionCloisonnee(baseBrute, departementId, travail);
}

before(async () => {
  await exigerDepartementDeTravail();
  const region = await baseBrute.region.findFirstOrThrow();
  await baseBrute.departement.upsert({
    where: { id: AUTRE },
    update: { actif: false },
    create: { id: AUTRE, code: CODE_AUTRE, nom: "Departement de controle", regionId: region.id, actif: false },
  });
  await dans(AUTRE, async (tx) => {
    await tx.user.deleteMany({ where: { id: DD_AUTRE.id } });
    await tx.user.create({
      data: {
        id: DD_AUTRE.id,
        nom: "Delegue de controle",
        username: DD_AUTRE.username,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 4),
        role: "DD",
        actif: true,
        mustChangePassword: false,
        departementId: AUTRE,
      },
    });
  });
  invaliderCacheDepartements();
});

after(async () => {
  await dans(AUTRE, async (tx) => {
    await tx.auditLog.deleteMany({ where: { departementId: AUTRE } });
    await tx.user.deleteMany({ where: { departementId: AUTRE } });
  });
  await baseBrute.configSysteme.deleteMany({ where: { cle: cleMarqueurPurge(CODE_AUTRE) } });
  await baseBrute.departement.deleteMany({ where: { id: AUTRE } });
  invaliderCacheDepartements();
  await baseBrute.$disconnect();
  await base.$disconnect();
});

const connexion = (username: string, password: string) => {
  const fournisseur = authOptions.providers.find((p) => p.id === "credentials") as unknown as {
    options: { authorize: (c: Record<string, string>) => Promise<unknown> };
  };
  // `fournisseur.authorize` rend toujours null : la vraie fonction est sous `.options`.
  return fournisseur.options.authorize({ username, password });
};

test("un département préparé reste éteint ; la Menoua, en service, est allumée", async () => {
  assert.equal(await departementEteint(AUTRE), true);
  assert.equal(await departementEteint("dep_menoua"), false);
});

test("le DD d'un département éteint ne se connecte pas, et le motif lui est dit", async () => {
  await assert.rejects(() => connexion(DD_AUTRE.username, MOT_DE_PASSE), (e: Error) => e.message === MESSAGE_DEPARTEMENT_ETEINT);
  // Un mauvais mot de passe ne révèle rien de l'état du département.
  assert.equal(await connexion(DD_AUTRE.username, "mauvais-mot-de-passe"), null);
});

test("une fois le département allumé, son DD se connecte", async () => {
  await baseBrute.departement.update({ where: { id: AUTRE }, data: { actif: true } });
  invaliderCacheDepartements();
  try {
    const u = (await connexion(DD_AUTRE.username, MOT_DE_PASSE)) as { id: string } | null;
    assert.equal(u?.id, DD_AUTRE.id);
  } finally {
    await baseBrute.departement.update({ where: { id: AUTRE }, data: { actif: false } });
    invaliderCacheDepartements();
  }
});

test("la purge d'un département ne touche pas le marqueur de la Menoua", async () => {
  assert.notEqual(cleMarqueurPurge(CODE_AUTRE), cleMarqueurPurge("MEN"));
  const menouaAvant = await dernierePurge(base, "MEN");
  await baseBrute.configSysteme.upsert({
    where: { cle: cleMarqueurPurge(CODE_AUTRE) },
    create: { cle: cleMarqueurPurge(CODE_AUTRE), valeur: "2099-01-01T00:00:00.000Z" },
    update: { valeur: "2099-01-01T00:00:00.000Z" },
  });
  assert.equal(await dernierePurge(base, CODE_AUTRE), "2099-01-01T00:00:00.000Z");
  assert.equal(await dernierePurge(base, "MEN"), menouaAvant, "les téléphones de la Menoua ne doivent pas se vider");
});

test("l'ancien marqueur, sans département, ne vaut que pour la Menoua", async () => {
  const ancien = await baseBrute.configSysteme.findUnique({ where: { cle: "donnees_purgees_le" } });
  if (!ancien) return; // aucune purge avant l'ouverture : rien à reprendre
  assert.equal(await dernierePurge(base, "BAM"), null, "un nouveau département n'hérite pas de la purge de la Menoua");
});

test("les actions d'administration sont refusées à un DD ordinaire", () => {
  const dd = { role: "DD", adminSysteme: false } as SessionUser;
  assert.throws(() => assertAdminSysteme(dd), ForbiddenError);
  assert.doesNotThrow(() => assertAdminSysteme({ ...dd, adminSysteme: true }));
});

test("un seul administrateur du système : le Délégué de la Menoua", async () => {
  const admins = await base.user.findMany({ where: { adminSysteme: true }, select: { username: true, role: true } });
  assert.equal(admins.length, 1);
  assert.equal(admins[0].role, "DD");
});

test("les textes fixes de la Menoua ne sortent jamais chez un autre département", () => {
  assert.ok(textesFixesDe("MEN").size > 0);
  assert.equal(textesFixesDe(CODE_AUTRE).size, 0);
  assert.equal(textesFixesDe("NOU").size, 0);
});

/**
 * Le rôle avec lequel l'application se connecte.
 *
 * Ce test existe pour empêcher un retour en arrière silencieux. Une application
 * connectée en superutilisateur, ou portant l'attribut BYPASSRLS, voit
 * PostgreSQL ignorer purement et simplement les politiques de sécurité par
 * ligne — sans erreur, sans avertissement, sans la moindre trace. On croirait
 * le cloisonnement en place alors qu'il ne le serait pas.
 *
 * Aujourd'hui la base ne sert qu'un département et cela ne se verrait pas. Le
 * jour où les huit départements de l'Ouest la partagent, c'est la seule
 * barrière qui compte, et il sera trop tard pour s'apercevoir qu'elle n'a
 * jamais été posée.
 *
 *   node --env-file=.env --import tsx --test tests/role-base.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, baseBrute } from "../src/lib/baseDeTravail";

/** Le client tel quel : c'est LUI qu'on interroge sur ses droits. */
const db = baseBrute;

async function attributs() {
  const [r] = await db.$queryRawUnsafe<{ u: string; s: boolean; b: boolean }[]>(
    `SELECT current_user AS u,
            (SELECT rolsuper     FROM pg_roles WHERE rolname = current_user) AS s,
            (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS b`
  );
  return r;
}

test("l'application ne se connecte pas en superutilisateur", async () => {
  const r = await attributs();
  assert.equal(
    r.s, false,
    `L'application est connectée en « ${r.u} », superutilisateur. Toute politique ` +
      `de sécurité par ligne serait ignorée en silence.`
  );
});

test("le rôle applicatif ne porte pas BYPASSRLS", async () => {
  const r = await attributs();
  assert.equal(
    r.b, false,
    `« ${r.u} » porte BYPASSRLS : les politiques de sécurité par ligne ne s'appliqueraient pas à lui.`
  );
});

test("le rôle applicatif ne possède aucune table", async () => {
  // Piège moins connu que BYPASSRLS, et tout aussi efficace : le PROPRIÉTAIRE
  // d'une table échappe à ses politiques, sauf FORCE ROW LEVEL SECURITY.
  const [{ n }] = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_tables
      WHERE schemaname = 'public' AND tableowner = current_user`
  );
  assert.equal(
    n, 0,
    `Le rôle applicatif possède ${n} table(s). Un propriétaire échappe à ses propres ` +
      `politiques RLS : le cloisonnement serait inopérant pour lui.`
  );
});

test("le rôle applicatif ne peut pas modifier la structure de la base", async () => {
  let cree = false;
  try {
    await db.$executeRawUnsafe(`CREATE TABLE "essai_structure_interdite"(id int)`);
    cree = true;
  } catch {
    // Attendu : le rôle applicatif n'a pas le droit de créer une table.
  } finally {
    /*
     * Nettoyer MÊME quand la création a réussi — c'est-à-dire précisément
     * quand le test échoue. Sans ce filet, éprouver ce test contre une
     * connexion privilégiée (ce qu'il faut faire pour vérifier qu'il tombe
     * bien) laissait la table derrière lui, et Prisma voyait ensuite une
     * dérive du schéma qui bloquait toute nouvelle migration.
     */
    if (cree) await db.$executeRawUnsafe(`DROP TABLE IF EXISTS "essai_structure_interdite"`);
  }
  assert.equal(
    cree, false,
    "Le rôle applicatif a pu créer une table : il a des droits qu'il ne devrait pas avoir."
  );
});

test("sans département déclaré, il ne voit AUCUNE ligne", async () => {
  /*
   * Le bon sens de l'échec. Une connexion qui ne déclare pas son département
   * doit tomber sur une base vide, et non sur toute la base. C'est ce qui rend
   * inoffensif un chemin de code qu'on aurait oublié de cloisonner : il ne
   * fonctionne pas, au lieu de tout laisser voir en silence.
   */
  assert.equal(await db.user.count(), 0, "Le rôle applicatif voit des comptes sans avoir déclaré de département.");
  assert.equal(await db.saisieMatrice.count(), 0, "Il voit des saisies sans avoir déclaré de département.");
});

test("il peut néanmoins lire et écrire les données de SON département", async () => {
  const utilisateur = await base.user.findFirst({ select: { id: true } });
  assert.ok(utilisateur, "Base sans utilisateur : le test ne prouverait rien.");
  const ligne = await base.auditLog.create({
    data: { userId: utilisateur.id, action: "ESSAI_ROLE_BASE", entite: "Essai", entiteId: "x", details: {} },
  });
  await base.auditLog.delete({ where: { id: ligne.id } });
});

after(async () => { await db.$disconnect(); });

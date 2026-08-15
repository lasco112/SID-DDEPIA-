/**
 * Éprouve la séparation des rôles sur la base courante.
 *
 * Ce que ce contrôle cherche à empêcher : qu'on revienne un jour, sans s'en
 * apercevoir, à une application connectée en superutilisateur. Ce serait
 * indolore aujourd'hui, et fatal le jour où plusieurs départements partagent la
 * base — PostgreSQL ignore les politiques de sécurité par ligne pour un
 * superutilisateur, sans le moindre message.
 *
 *   node --env-file=.env --import tsx scripts/verifier-role-applicatif.ts
 */
import { PrismaClient } from "@prisma/client";

const app = new PrismaClient();
const admin = new PrismaClient({
  datasources: { db: { url: process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL } },
});

const dire = (quoi: string, ok: boolean) => {
  console.log(`  ${ok ? "ok    " : "FAUTE "}  ${quoi}`);
  if (!ok) process.exitCode = 1;
};

async function principal() {
  const [moi] = await app.$queryRawUnsafe<{ u: string; s: boolean; b: boolean }[]>(
    `SELECT current_user AS u,
            (SELECT rolsuper      FROM pg_roles WHERE rolname = current_user) AS s,
            (SELECT rolbypassrls  FROM pg_roles WHERE rolname = current_user) AS b`
  );
  console.log(`Rôle applicatif : « ${moi.u} »`);
  dire("il n'est pas superutilisateur", moi.s === false);
  dire("il ne porte pas BYPASSRLS", moi.b === false);

  const [{ n: possedees }] = await app.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user`
  );
  // Un propriétaire échappe à ses propres politiques RLS, sauf FORCE : posséder
  // les tables reproduirait le trou sous une autre forme.
  dire("il ne possède aucune table", possedees === 0);

  // Il doit pouvoir travailler : lire, écrire, effacer.
  const compte = await app.user.count();
  dire(`il lit les données (${compte} comptes)`, compte > 0);

  const unUser = await app.user.findFirst({ select: { id: true } });
  const ligne = await app.auditLog.create({
    data: { userId: unUser!.id, action: "ESSAI_ROLE_APPLICATIF", entite: "Essai", entiteId: "x", details: {} },
  });
  await app.auditLog.delete({ where: { id: ligne.id } });
  dire("il écrit et efface une ligne", true);

  // Mais il ne doit pas pouvoir toucher à la STRUCTURE.
  let ddlRefuse = false;
  try {
    await app.$executeRawUnsafe(`CREATE TABLE "essai_interdit"(id int)`);
    await app.$executeRawUnsafe(`DROP TABLE "essai_interdit"`);
  } catch {
    ddlRefuse = true;
  }
  dire("il ne peut pas créer de table", ddlRefuse);

  /*
   * Le point le plus facile à manquer : une migration future crée une table en
   * tant que `postgres`. Sans ALTER DEFAULT PRIVILEGES, le rôle applicatif
   * n'aurait AUCUN droit dessus, et l'application tomberait en panne au
   * déploiement suivant — pas au moment de la migration, mais à la première
   * requête sur la table neuve.
   */
  await admin.$executeRawUnsafe(`DROP TABLE IF EXISTS "essai_droits"`);
  await admin.$executeRawUnsafe(`CREATE TABLE "essai_droits"(id text primary key, v int)`);
  try {
    await app.$executeRawUnsafe(`INSERT INTO "essai_droits" VALUES ('a', 1)`);
    const [{ n }] = await app.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "essai_droits"`
    );
    dire("une table créée par une migration future lui est ouverte", n === 1);
  } catch (e) {
    dire(`une table créée par une migration future lui est ouverte — ${(e as Error).message}`, false);
  } finally {
    await admin.$executeRawUnsafe(`DROP TABLE IF EXISTS "essai_droits"`);
  }

  const [{ n: restes }] = await admin.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_tables WHERE tablename IN ('essai_droits', 'essai_interdit')`
  );
  dire("aucune table d'essai ne subsiste", restes === 0);
}

principal()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await app.$disconnect(); await admin.$disconnect(); });

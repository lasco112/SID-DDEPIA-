/**
 * demoDb.ts — client Prisma dédié à l'environnement de démonstration
 * (correction n°10, §10.1) : une base Postgres DISTINCTE de la production
 * (DEMO_DATABASE_URL), même schéma (mêmes migrations), mais aucune table,
 * aucune ligne, aucune connexion partagée avec `db` (production).
 *
 * Ne jamais faire pointer DEMO_DATABASE_URL sur la même base que
 * DATABASE_URL — les deux clients doivent rester deux bases physiquement
 * séparées pour qu'une erreur de code ne puisse jamais mélanger les
 * données réelles et fictives (voir §10.1 du cahier des charges).
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prismaDemo: PrismaClient | undefined;
};

function buildDemoClient(): PrismaClient | null {
  const url = process.env.DEMO_DATABASE_URL;
  if (!url) return null;
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error(
      "DEMO_DATABASE_URL est identique à DATABASE_URL : le mode démo doit utiliser une base distincte de la production."
    );
  }
  return new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const demoDb = globalForPrisma.prismaDemo ?? buildDemoClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaDemo = demoDb ?? undefined;

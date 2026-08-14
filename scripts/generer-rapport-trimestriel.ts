/**
 * Produit le rapport trimestriel en ligne de commande.
 *
 * Ce script ne fabrique RIEN lui-même : il appelle le même
 * `genererRapportCanevas` que la route de l'application. Un seul chemin de
 * production, donc un seul comportement à vérifier — et aucun risque que le
 * document produit ici diffère de celui que le Délégué télécharge.
 *
 *   npm run trimestre:rapport -- 2026 3
 *   npm run trimestre:rapport -- 2026 1 --brouillon
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { trimestrielle, libelleOfficiel } from "../src/server/periodes/calendrier";
import { genererRapportCanevas } from "../src/server/trimestre/rapportCanevas";

async function principal() {
  const annee = Number(process.argv[2] ?? 2026);
  const trimestre = Number(process.argv[3] ?? 3);
  const brouillon = process.argv.includes("--brouillon");

  const db = new PrismaClient();
  const p = trimestrielle(annee, trimestre);

  const { buffer, nomFichier, etat, rubriquesAlimentees, valeursConsolidees } =
    await genererRapportCanevas(db, p, { autoriserIncomplet: brouillon });

  mkdirSync("storage/exports", { recursive: true });
  writeFileSync(`storage/exports/${nomFichier}`, buffer);

  console.log(`${nomFichier} — ${(buffer.length / 1024).toFixed(1)} Ko`);
  console.log(`  période  : ${libelleOfficiel(p)} · ${etat.calculable ? "complète" : "INCOMPLÈTE"}`);
  console.log(`  rubriques alimentées : ${rubriquesAlimentees}`);
  console.log(`  valeurs consolidées  : ${valeursConsolidees}`);

  await db.$disconnect();
}

principal().catch((e) => { console.error(e); process.exit(1); });

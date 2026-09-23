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
 *   npm run trimestre:rapport -- 2026 3 --brouillon --da      (le DD + les six DA)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { base } from "../src/lib/baseDeTravail";
import { trimestrielle, libelleOfficiel } from "../src/server/periodes/calendrier";
import { genererRapportCanevas } from "../src/server/trimestre/rapportCanevas";
import { listerArrondissements } from "../src/lib/arrondissements";

async function principal() {
  const annee = Number(process.argv[2] ?? 2026);
  const trimestre = Number(process.argv[3] ?? 3);
  const brouillon = process.argv.includes("--brouillon");
  const avecDA = process.argv.includes("--da");

  const db = base;
  const p = trimestrielle(annee, trimestre);

  await produire(db, p, brouillon);
  if (avecDA) {
    for (const a of await listerArrondissements(db)) await produire(db, p, brouillon, a.nom);
  }

  await db.$disconnect();
}

async function produire(db: typeof base, p: ReturnType<typeof trimestrielle>, brouillon: boolean, arrondissement?: string) {
  const { buffer, nomFichier, etat, rubriquesAlimentees, valeursConsolidees, lignesNonClassees } =
    await genererRapportCanevas(db, p, { autoriserIncomplet: brouillon, arrondissement });

  mkdirSync("storage/exports", { recursive: true });
  writeFileSync(`storage/exports/${nomFichier}`, buffer);

  console.log(`${nomFichier} — ${(buffer.length / 1024).toFixed(1)} Ko`);
  console.log(`  période  : ${libelleOfficiel(p)} · ${etat.calculable ? "complète" : "INCOMPLÈTE"}`);
  console.log(`  rubriques alimentées : ${rubriquesAlimentees}`);
  console.log(`  valeurs consolidées  : ${valeursConsolidees}`);
  console.log(`  lignes non classées  : ${lignesNonClassees.length}`);
  for (const l of lignesNonClassees) console.log(`    - ${l.arrondissement} · ${l.ligne} · ${l.quantite ?? "—"} → ${l.tableau}`);
}

principal().catch((e) => { console.error(e); process.exit(1); });

/**
 * Produit les sept rapports trimestriels d'une période : celui du Délégué
 * départemental et celui de chacun des six Délégués d'arrondissement.
 *
 * Les DA comme le DD produisent un rapport trimestriel. Ce n'est pas deux
 * canevas : c'est le même, rendu au niveau de l'arrondissement — une seule
 * colonne territoriale, les titres transposés, et SES textes fixes à lui.
 *
 *   npm run trimestre:rapports -- 2026 3
 *   npm run trimestre:rapports -- 2026 1 --brouillon
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { base } from "../src/lib/baseDeTravail";
import { trimestrielle, libelleOfficiel } from "../src/server/periodes/calendrier";
import { genererRapportCanevas } from "../src/server/trimestre/rapportCanevas";

async function principal() {
  const annee = Number(process.argv[2] ?? 2026);
  const trimestre = Number(process.argv[3] ?? 3);
  const autoriserIncomplet = process.argv.includes("--brouillon");

  const db = base;
  const p = trimestrielle(annee, trimestre);
  const arrondissements = (
    await db.arrondissement.findMany({ orderBy: { ordre: "asc" }, select: { nom: true } })
  ).map((a) => a.nom);

  mkdirSync("storage/exports", { recursive: true });
  console.log(`${libelleOfficiel(p)}\n`);

  // Le département d'abord, puis les six arrondissements dans l'ordre du canevas.
  for (const arrondissement of [undefined, ...arrondissements]) {
    const r = await genererRapportCanevas(db, p, { autoriserIncomplet, arrondissement });
    writeFileSync(`storage/exports/${r.nomFichier}`, r.buffer);
    console.log(
      `  ${(arrondissement ?? "— département —").padEnd(16)} ${r.nomFichier.padEnd(46)} ` +
        `${(r.buffer.length / 1024).toFixed(1).padStart(6)} Ko  ` +
        `${r.valeursConsolidees} valeurs`
    );
  }

  await db.$disconnect();
}

principal().catch((e) => { console.error(e); process.exit(1); });

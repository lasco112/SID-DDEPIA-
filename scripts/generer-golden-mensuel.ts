/**
 * Génère la référence figée (« golden master ») du rapport mensuel.
 *
 * On fige la sortie de `genererPayloadDD` — l'ensemble des valeurs nommées du
 * rapport, avant toute mise en page — et non le fichier Word : un .docx est un
 * binaire compressé dont deux générations diffèrent pour des raisons sans
 * rapport avec les chiffres. Ce qu'on protège ici, ce sont les chiffres.
 *
 * Les valeurs volatiles (date de génération) sont retirées : elles changeraient
 * à chaque exécution et feraient échouer le test sans qu'aucun chiffre n'ait
 * bougé.
 *
 * Usage :
 *   npm run golden:generer -- 2026 7
 */
import { base } from "../src/lib/baseDeTravail";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { genererPayloadDD } from "../src/server/export/rapport-docx";
import { CHAMPS_VOLATILES, cheminFixture } from "../tests/golden-commun";

async function principal() {
  const annee = Number(process.argv[2]);
  const mois = Number(process.argv[3]);
  if (!Number.isInteger(annee) || !Number.isInteger(mois)) {
    console.error("Usage : npm run golden:generer -- <annee> <mois>");
    process.exit(1);
  }

  const db = base;
  const periode = await db.periodeReporting.findFirst({ where: { type: "MENSUEL", annee, mois } });
  if (!periode) {
    console.error(`Aucune période mensuelle ${mois}/${annee} en base.`);
    process.exit(1);
  }

  // Les deux variantes réellement produites par le SID : le rapport
  // départemental (événements agrégés) et la fiche de collecte (détaillée).
  const [rapportDD, ficheCollecte] = await Promise.all([
    genererPayloadDD(db, periode.id, true),
    genererPayloadDD(db, periode.id, false),
  ]);

  const nettoyer = (p: Record<string, unknown>) => {
    const copie = { ...p };
    for (const champ of CHAMPS_VOLATILES) delete copie[champ];
    return copie;
  };

  const reference = {
    meta: {
      periode: `${annee}-${String(mois).padStart(2, "0")}`,
      periodeId: periode.id,
      figeLe: new Date().toISOString(),
      champsVolatilesExclus: CHAMPS_VOLATILES,
      note: "Référence figée du rapport mensuel. Toute différence signale une régression.",
    },
    rapportDD: nettoyer(rapportDD),
    ficheCollecte: nettoyer(ficheCollecte),
  };

  const chemin = cheminFixture(annee, mois);
  mkdirSync(path.dirname(chemin), { recursive: true });
  writeFileSync(chemin, JSON.stringify(reference, null, 2), "utf8");

  console.log(`Référence figée : ${chemin}`);
  console.log(`  rapport départemental : ${Object.keys(reference.rapportDD).length} valeurs`);
  console.log(`  fiche de collecte     : ${Object.keys(reference.ficheCollecte).length} valeurs`);
  await db.$disconnect();
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});

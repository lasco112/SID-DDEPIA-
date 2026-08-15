/**
 * Test « golden master » du rapport mensuel — invariant n° 1 de CLAUDE.md.
 *
 * Régénère le rapport d'un mois de référence et compare valeur par valeur avec
 * la référence figée. Si un seul chiffre diffère, le test échoue et la
 * modification est refusée.
 *
 * Ce test est le filet de sécurité du chantier trimestriel : le module mensuel
 * est en production et a déjà servi à clôturer des cycles réels. Sans lui, on
 * coderait à l'aveugle, et le jour où un chiffre bougerait, on ne saurait ni
 * quand ni pourquoi.
 *
 * Il ne teste PAS la mise en page : un .docx est un binaire compressé dont deux
 * générations diffèrent pour des raisons sans rapport avec les chiffres. Ce
 * qu'on protège ici, ce sont les valeurs.
 *
 *   npm run test:golden
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { base } from "../src/lib/baseDeTravail";
import { genererPayloadDD } from "../src/server/export/rapport-docx";
import { CHAMPS_VOLATILES, cheminFixture } from "./golden-commun";

/** Mois de référence. Modifier ici suppose de régénérer la référence. */
const ANNEE = 2026;
const MOIS = 7;

const db = base;
let reference: any = null;
let periodeId: string | null = null;

before(async () => {
  const chemin = cheminFixture(ANNEE, MOIS);
  if (existsSync(chemin)) reference = JSON.parse(readFileSync(chemin, "utf8"));

  const periode = await db.periodeReporting.findFirst({ where: { type: "MENSUEL", annee: ANNEE, mois: MOIS } });
  periodeId = periode?.id ?? null;
});

after(async () => {
  await db.$disconnect();
});

/** Retire les valeurs qui changent à chaque exécution sans qu'un chiffre ait bougé. */
function nettoyer(p: Record<string, unknown>): Record<string, unknown> {
  const copie = { ...p };
  for (const champ of CHAMPS_VOLATILES) delete copie[champ];
  return copie;
}

/**
 * Compare deux jeux de valeurs et renvoie les différences en clair.
 * On ne s'arrête pas à la première : voir toutes les rubriques touchées dit
 * immédiatement s'il s'agit d'un accident isolé ou d'une régression de fond.
 */
function differences(attendu: Record<string, unknown>, obtenu: Record<string, unknown>): string[] {
  const ecarts: string[] = [];
  const cles = new Set([...Object.keys(attendu), ...Object.keys(obtenu)]);

  for (const cle of Array.from(cles).sort()) {
    const a = attendu[cle];
    const o = obtenu[cle];
    if (!(cle in attendu)) {
      ecarts.push(`${cle} : rubrique APPARUE (valeur ${JSON.stringify(o)})`);
      continue;
    }
    if (!(cle in obtenu)) {
      ecarts.push(`${cle} : rubrique DISPARUE (valait ${JSON.stringify(a)})`);
      continue;
    }
    // Comparaison structurelle : les rubriques de boucle (événements,
    // établissements) sont des tableaux d'objets, pas de simples nombres.
    const sa = JSON.stringify(a);
    const so = JSON.stringify(o);
    if (sa !== so) ecarts.push(`${cle} : ${sa} → ${so}`);
  }
  return ecarts;
}

test("la référence figée du mois de contrôle existe", () => {
  assert.ok(
    reference,
    `Référence absente : ${cheminFixture(ANNEE, MOIS)}\n` +
      `Générez-la d'abord avec : npm run golden:generer -- ${ANNEE} ${MOIS}`
  );
});

test("le mois de contrôle est toujours présent en base", () => {
  assert.ok(periodeId, `Aucune période mensuelle ${MOIS}/${ANNEE} en base.`);
});

test("le rapport départemental produit exactement les mêmes valeurs", async () => {
  if (!reference || !periodeId) return; // les tests précédents ont déjà signalé la cause
  const obtenu = nettoyer(await genererPayloadDD(db, periodeId, true));
  const ecarts = differences(reference.rapportDD, obtenu);

  assert.deepEqual(
    ecarts,
    [],
    `\n${ecarts.length} valeur(s) du rapport mensuel ont changé :\n` +
      ecarts.slice(0, 40).map((e) => `  - ${e}`).join("\n") +
      (ecarts.length > 40 ? `\n  … et ${ecarts.length - 40} autre(s)` : "") +
      `\n\nSi ce changement est VOULU, régénérez la référence :\n` +
      `  npm run golden:generer -- ${ANNEE} ${MOIS}\n`
  );
});

test("la fiche de collecte produit exactement les mêmes valeurs", async () => {
  if (!reference || !periodeId) return;
  const obtenu = nettoyer(await genererPayloadDD(db, periodeId, false));
  const ecarts = differences(reference.ficheCollecte, obtenu);

  assert.deepEqual(
    ecarts,
    [],
    `\n${ecarts.length} valeur(s) de la fiche de collecte ont changé :\n` +
      ecarts.slice(0, 40).map((e) => `  - ${e}`).join("\n") +
      (ecarts.length > 40 ? `\n  … et ${ecarts.length - 40} autre(s)` : "")
  );
});

test("deux générations successives donnent le même résultat", async () => {
  if (!periodeId) return;
  const [a, b] = await Promise.all([
    genererPayloadDD(db, periodeId, true),
    genererPayloadDD(db, periodeId, true),
  ]);
  assert.deepEqual(
    nettoyer(a),
    nettoyer(b),
    "La génération n'est pas déterministe : deux exécutions consécutives diffèrent."
  );
});

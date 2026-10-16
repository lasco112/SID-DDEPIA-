/**
 * Le chiffre de l'an passé est OBLIGATOIRE avant que le DA transmette
 * (décision du Délégué, 15 octobre 2026 — un DA ne remplissait pas le 2025 du
 * tableau de commercialisation des produits de l'élevage porcin, n° 41).
 *
 * Tant que le SID n'a pas la même période de l'an passé dans sa base, la case
 * « TOTAL {P-1} » de l'arrondissement se saisit (reprise d'historique). Ici :
 * elle est marquée obligatoire dans la grille, et listée tant qu'elle est vide
 * — seulement dans un tableau où l'arrondissement a des chiffres ce trimestre.
 *
 *   node --env-file=.env --import tsx --test tests/an-passe-obligatoire.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base, transaction } from "../src/lib/baseDeTravail";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { periodeTrimestrielle } from "../src/server/trimestre/rubriques";
import { ecrireSaisieCanevas } from "../src/server/trimestre/saisieCanevas";
import { anPasseManquant, chefDuTableau, grille, messageAnPasseManquant, refusCorrectionAnPasse } from "../src/server/trimestre/saisieTrimestrielle";

// Une année sans aucune donnée, ni mensuelle ni trimestrielle.
const P = trimestrielle(2032, 1);
const DA_DSCHANG = { role: "DA", arrondissement: "Dschang" };
const DA_FOKOUE = { role: "DA", arrondissement: "Fokoué" };
const N1 = "TOTAL T1 2031";

let periodeId: string | null = null;

after(async () => {
  if (periodeId) {
    await base.saisieCanevas.deleteMany({ where: { periodeId } });
    await base.periodeReporting.delete({ where: { id: periodeId } }).catch(() => {});
  }
  await base.$disconnect();
});

test("rien n'est exigé tant que l'arrondissement n'a rien rempli", async () => {
  assert.deepEqual(await anPasseManquant(base, P, DA_DSCHANG), []);
});

test("la case de l'an passé du tableau 41 est marquée obligatoire", async () => {
  const g = await grille(base, P, DA_DSCHANG, 41);
  const dschang = g!.lignes.find((l) => l.libelle === "Dschang")!;
  const caseN1 = dschang.cases.find((c) => c.colonne === N1)!;
  assert.equal(caseN1.etat, "saisie");
  assert.equal(caseN1.anPasse, true);
  // Les cases de l'année courante ne le sont pas.
  assert.ok(dschang.cases.filter((c) => c.colonne !== N1).every((c) => !c.anPasse));
});

test("le DA est bloqué tant que le chiffre de l'an passé manque, puis libéré", async () => {
  periodeId = await periodeTrimestrielle(base, P);
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const ecrire = (ligne: string, colonne: string, valeur: number) =>
    ecrireSaisieCanevas(base, transaction, periodeId!, { numeroTableau: 41, ligne, colonne }, { valeur }, dd.id);

  // Dschang vend de la viande ce trimestre, sans dire combien l'an passé.
  await ecrire("Dschang", "Viande", 12);
  const manquants = await anPasseManquant(base, P, DA_DSCHANG);
  assert.deepEqual(manquants.map((m) => m.numero), [41]);
  assert.match(messageAnPasseManquant(manquants, "T1 2031"), /T1 2031[\s\S]*n° 41[\s\S]*inscrivez 0/);

  // Fokoué n'a rien rempli : rien ne lui est exigé.
  assert.deepEqual(await anPasseManquant(base, P, DA_FOKOUE), []);

  // Un 0 suffit : l'activité était nulle l'an passé.
  await ecrire("Dschang", N1, 0);
  assert.deepEqual(await anPasseManquant(base, P, DA_DSCHANG), []);
});

// ---------------------------------------------------------------------------
// Corriger un chiffre déjà inscrit, même rapport transmis (15 octobre 2026).
// ---------------------------------------------------------------------------

test("correction de l'an passé : chacun dans son ressort, jamais l'agent", async () => {
  // Le DA corrige le chiffre de l'an passé de SON arrondissement.
  assert.equal(await refusCorrectionAnPasse(base, P, DA_DSCHANG, 41, "Dschang", N1), null);
  // Pas celui d'un autre.
  assert.ok(await refusCorrectionAnPasse(base, P, DA_DSCHANG, 41, "Fokoué", N1));
  // L'agent de saisie ne corrige pas après validation.
  assert.ok(await refusCorrectionAnPasse(base, P, { role: "AGENT_SAISIE", arrondissement: "Dschang" }, 41, "Dschang", N1));
  // Le DD corrige tout arrondissement.
  assert.equal(await refusCorrectionAnPasse(base, P, { role: "DD" }, 41, "Fokoué", N1), null);
  // Le chef de la section du tableau, oui ; un autre chef, non.
  const chef = chefDuTableau(41)!;
  const autreChef = ["CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"].find((r) => r !== chef)!;
  assert.equal(await refusCorrectionAnPasse(base, P, { role: chef }, 41, "Fokoué", N1), null);
  assert.ok(await refusCorrectionAnPasse(base, P, { role: autreChef }, 41, "Fokoué", N1));
});

test("les chiffres de l'année en cours restent au circuit ; ceux d'une année passée se corrigent", async () => {
  // 2032 n'est pas une année passée : « Viande » suit le circuit du rapport.
  assert.match((await refusCorrectionAnPasse(base, P, DA_DSCHANG, 41, "Dschang", "Viande")) ?? "", /an passé/);
  // Un trimestre de 2025 : ses cases saisissables se corrigent…
  const P2025 = trimestrielle(2025, 3);
  assert.equal(await refusCorrectionAnPasse(base, P2025, DA_DSCHANG, 41, "Dschang", "Viande"), null);
  // … mais pas un total, calculé.
  assert.ok(await refusCorrectionAnPasse(base, P2025, DA_DSCHANG, 41, "TOTAL T3 2025", "Viande"));
});
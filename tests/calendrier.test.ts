/**
 * Tests de la couche calendrier (E3).
 *
 * Aucune base, aucun réseau, aucune horloge : ces tests tournent partout et
 * doivent rester instantanés. Ils portent surtout sur les passages d'année,
 * qui sont l'endroit où ce genre de code se trompe silencieusement.
 *
 *   npm run test:periodes
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  periode, mensuelle, trimestrielle, semestrielle, annuelle,
  premierMois, dernierMois, moisDeLaPeriode,
  dateOuverture, dateFinExclusive, dateCloture,
  periodePrecedente, periodeSuivante, memePeriodeAnneePrecedente,
  libelleOfficiel, libelleCourt, cle, memePeriode,
  periodeContenant, contientLeMois, decouper,
  PeriodeInvalideError,
} from "../src/server/periodes/calendrier";

// ---------------------------------------------------------------- composition

test("un trimestre est fait de ses trois mois", () => {
  assert.deepEqual(moisDeLaPeriode(trimestrielle(2026, 1)), [
    { annee: 2026, mois: 1 }, { annee: 2026, mois: 2 }, { annee: 2026, mois: 3 },
  ]);
  assert.deepEqual(moisDeLaPeriode(trimestrielle(2026, 3)), [
    { annee: 2026, mois: 7 }, { annee: 2026, mois: 8 }, { annee: 2026, mois: 9 },
  ]);
  assert.deepEqual(moisDeLaPeriode(trimestrielle(2026, 4)), [
    { annee: 2026, mois: 10 }, { annee: 2026, mois: 11 }, { annee: 2026, mois: 12 },
  ]);
});

test("un semestre est fait de six mois, une année de douze", () => {
  assert.equal(moisDeLaPeriode(semestrielle(2026, 1)).length, 6);
  assert.equal(moisDeLaPeriode(semestrielle(2026, 2))[0].mois, 7);
  assert.equal(moisDeLaPeriode(annuelle(2026)).length, 12);
  assert.equal(dernierMois(annuelle(2026)), 12);
});

test("un mois n'est fait que de lui-même", () => {
  assert.deepEqual(moisDeLaPeriode(mensuelle(2026, 7)), [{ annee: 2026, mois: 7 }]);
  assert.equal(premierMois(mensuelle(2026, 7)), 7);
  assert.equal(dernierMois(mensuelle(2026, 7)), 7);
});

// --------------------------------------------------------------------- bornes

test("les bornes de dates sont en UTC et ne dépendent pas du fuseau", () => {
  const t1 = trimestrielle(2026, 1);
  assert.equal(dateOuverture(t1).toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(dateFinExclusive(t1).toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(dateCloture(t1).toISOString(), "2026-03-31T23:59:59.999Z");
});

test("le quatrième trimestre se ferme au 1er janvier suivant", () => {
  const t4 = trimestrielle(2026, 4);
  assert.equal(dateOuverture(t4).toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(dateFinExclusive(t4).toISOString(), "2027-01-01T00:00:00.000Z");
  assert.equal(dateCloture(t4).toISOString(), "2026-12-31T23:59:59.999Z");
});

test("février d'une année bissextile compte bien 29 jours", () => {
  assert.equal(dateCloture(mensuelle(2028, 2)).toISOString(), "2028-02-29T23:59:59.999Z");
  assert.equal(dateCloture(mensuelle(2026, 2)).toISOString(), "2026-02-28T23:59:59.999Z");
});

test("la borne de fin est exclusive : elle n'appartient pas à la période", () => {
  const t = trimestrielle(2026, 1);
  assert.ok(dateCloture(t) < dateFinExclusive(t));
  assert.equal(dateFinExclusive(t).getTime() - dateCloture(t).getTime(), 1);
  // La borne exclusive d'une période est l'ouverture de la suivante.
  assert.equal(dateFinExclusive(t).getTime(), dateOuverture(periodeSuivante(t)).getTime());
});

// ------------------------------------------------------- passages d'année

test("le premier trimestre 2026 est précédé du quatrième 2025", () => {
  assert.deepEqual(periodePrecedente(trimestrielle(2026, 1)), trimestrielle(2025, 4));
});

test("janvier 2026 est précédé de décembre 2025", () => {
  assert.deepEqual(periodePrecedente(mensuelle(2026, 1)), mensuelle(2025, 12));
});

test("le premier semestre 2026 est précédé du second 2025", () => {
  assert.deepEqual(periodePrecedente(semestrielle(2026, 1)), semestrielle(2025, 2));
});

test("l'année 2026 est précédée de 2025", () => {
  assert.deepEqual(periodePrecedente(annuelle(2026)), annuelle(2025));
  assert.deepEqual(periodeSuivante(annuelle(2026)), annuelle(2027));
});

test("le quatrième trimestre 2025 est suivi du premier 2026", () => {
  assert.deepEqual(periodeSuivante(trimestrielle(2025, 4)), trimestrielle(2026, 1));
  assert.deepEqual(periodeSuivante(mensuelle(2025, 12)), mensuelle(2026, 1));
});

test("avancer puis reculer ramène au point de départ, sur les quatre types", () => {
  for (const p of [mensuelle(2026, 1), trimestrielle(2026, 1), semestrielle(2026, 1), annuelle(2026)]) {
    assert.ok(memePeriode(periodePrecedente(periodeSuivante(p)), p));
    assert.ok(memePeriode(periodeSuivante(periodePrecedente(p)), p));
  }
});

// ------------------------------------------------------------ comparaison N-1

test("la comparaison N-1 garde le rang et recule d'une année", () => {
  assert.deepEqual(memePeriodeAnneePrecedente(trimestrielle(2026, 1)), trimestrielle(2025, 1));
  assert.deepEqual(memePeriodeAnneePrecedente(mensuelle(2026, 7)), mensuelle(2025, 7));
});

test("N-1 et période précédente ne sont pas la même chose", () => {
  const t1 = trimestrielle(2026, 1);
  assert.ok(!memePeriode(memePeriodeAnneePrecedente(t1), periodePrecedente(t1)));
  // Sauf pour une période annuelle, où les deux coïncident.
  const a = annuelle(2026);
  assert.ok(memePeriode(memePeriodeAnneePrecedente(a), periodePrecedente(a)));
});

// -------------------------------------------------------------------- libellés

test("les libellés officiels sont ceux du canevas", () => {
  assert.equal(libelleOfficiel(trimestrielle(2026, 1)), "PREMIER TRIMESTRE 2026");
  assert.equal(libelleOfficiel(trimestrielle(2026, 4)), "QUATRIÈME TRIMESTRE 2026");
  assert.equal(libelleOfficiel(semestrielle(2026, 2)), "DEUXIÈME SEMESTRE 2026");
  assert.equal(libelleOfficiel(annuelle(2026)), "ANNÉE 2026");
  assert.equal(libelleOfficiel(mensuelle(2026, 8)), "AOÛT 2026");
  assert.equal(libelleOfficiel(mensuelle(2026, 2)), "FÉVRIER 2026");
});

test("les libellés courts servent aux listes et aux noms de fichiers", () => {
  assert.equal(libelleCourt(mensuelle(2026, 7)), "07/2026");
  assert.equal(libelleCourt(trimestrielle(2026, 3)), "T3 2026");
  assert.equal(libelleCourt(semestrielle(2026, 1)), "S1 2026");
  assert.equal(libelleCourt(annuelle(2026)), "2026");
});

test("la clé se trie dans l'ordre chronologique", () => {
  const cles = [
    trimestrielle(2026, 2), trimestrielle(2025, 4), trimestrielle(2026, 1),
  ].map(cle).sort();
  assert.deepEqual(cles, ["2025-T04", "2026-T01", "2026-T02"]);
  assert.deepEqual([mensuelle(2026, 10), mensuelle(2026, 2)].map(cle).sort(), ["2026-M02", "2026-M10"]);
});

// ------------------------------------------------------- appartenance, découpe

test("juillet 2026 tombe dans le troisième trimestre", () => {
  assert.deepEqual(periodeContenant("TRIMESTRIEL", 2026, 7), trimestrielle(2026, 3));
  assert.deepEqual(periodeContenant("SEMESTRIEL", 2026, 7), semestrielle(2026, 2));
  assert.deepEqual(periodeContenant("ANNUEL", 2026, 7), annuelle(2026));
  assert.deepEqual(periodeContenant("MENSUEL", 2026, 7), mensuelle(2026, 7));
});

test("chaque mois de l'année tombe dans le bon trimestre", () => {
  const attendu = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4];
  for (let m = 1; m <= 12; m++) {
    assert.equal(periodeContenant("TRIMESTRIEL", 2026, m).rang, attendu[m - 1], `mois ${m}`);
  }
});

test("l'appartenance d'un mois tient compte de l'année", () => {
  const t3 = trimestrielle(2026, 3);
  assert.ok(contientLeMois(t3, 2026, 8));
  assert.ok(!contientLeMois(t3, 2026, 6));
  assert.ok(!contientLeMois(t3, 2025, 8), "même mois, autre année");
});

test("un trimestre se découpe en trois mois, une année en quatre trimestres", () => {
  assert.deepEqual(decouper(trimestrielle(2026, 3), "MENSUEL"),
    [mensuelle(2026, 7), mensuelle(2026, 8), mensuelle(2026, 9)]);
  assert.deepEqual(decouper(annuelle(2026), "TRIMESTRIEL"),
    [trimestrielle(2026, 1), trimestrielle(2026, 2), trimestrielle(2026, 3), trimestrielle(2026, 4)]);
  assert.deepEqual(decouper(semestrielle(2026, 2), "TRIMESTRIEL"),
    [trimestrielle(2026, 3), trimestrielle(2026, 4)]);
  assert.equal(decouper(annuelle(2026), "MENSUEL").length, 12);
});

test("on ne découpe pas une période en plus grand qu'elle", () => {
  assert.throws(() => decouper(trimestrielle(2026, 1), "ANNUEL"), PeriodeInvalideError);
  assert.throws(() => decouper(mensuelle(2026, 1), "TRIMESTRIEL"), PeriodeInvalideError);
});

// ------------------------------------------------------------------ validation

test("une période impossible est refusée à la construction", () => {
  assert.throws(() => trimestrielle(2026, 5), PeriodeInvalideError, "cinquième trimestre");
  assert.throws(() => trimestrielle(2026, 0), PeriodeInvalideError);
  assert.throws(() => mensuelle(2026, 13), PeriodeInvalideError);
  assert.throws(() => mensuelle(2026, 0), PeriodeInvalideError);
  assert.throws(() => semestrielle(2026, 3), PeriodeInvalideError);
  assert.throws(() => periode("ANNUEL", 2026, 2), PeriodeInvalideError);
  assert.throws(() => periodeContenant("TRIMESTRIEL", 2026, 13), PeriodeInvalideError);
});

test("une année ou un rang non entier est refusé", () => {
  assert.throws(() => mensuelle(2026.5, 1), PeriodeInvalideError);
  assert.throws(() => mensuelle(2026, 1.5), PeriodeInvalideError);
  assert.throws(() => mensuelle(1800, 1), PeriodeInvalideError);
});

test("le message d'erreur dit ce qui était attendu", () => {
  assert.throws(() => trimestrielle(2026, 7), (e: Error) => /entre 1 et 4/.test(e.message));
});

// ----------------------------------------------------------------- pureté

test("deux appels identiques donnent le même résultat", () => {
  const t = trimestrielle(2026, 2);
  assert.deepEqual(moisDeLaPeriode(t), moisDeLaPeriode(t));
  assert.equal(dateOuverture(t).getTime(), dateOuverture(t).getTime());
  assert.equal(libelleOfficiel(t), libelleOfficiel(t));
});

test("les fonctions ne modifient pas la période reçue", () => {
  const t = trimestrielle(2026, 2);
  const copie = { ...t };
  periodePrecedente(t); periodeSuivante(t); moisDeLaPeriode(t); decouper(t, "MENSUEL");
  assert.deepEqual(t, copie);
});

test("le trimestre à rapporter est le même sur tous les écrans du trimestre", async () => {
  const { trimestreARapporter } = await import("../src/lib/trimestreEchu");
  const le = (iso: string) => trimestreARapporter(new Date(iso));
  // Dernier mois du trimestre : lui-même, sa saisie commence.
  assert.deepEqual(le("2026-09-24T10:00:00Z"), { annee: 2026, trimestre: 3 });
  // Les deux mois suivants : toujours lui, son rapport se rédige et circule.
  assert.deepEqual(le("2026-10-15T10:00:00Z"), { annee: 2026, trimestre: 3 });
  assert.deepEqual(le("2026-11-30T10:00:00Z"), { annee: 2026, trimestre: 3 });
  assert.deepEqual(le("2026-12-01T10:00:00Z"), { annee: 2026, trimestre: 4 });
  // Changement d'année : en janvier et février, le T4 de l'an passé.
  assert.deepEqual(le("2027-01-10T10:00:00Z"), { annee: 2026, trimestre: 4 });
  assert.deepEqual(le("2027-03-02T10:00:00Z"), { annee: 2027, trimestre: 1 });
});

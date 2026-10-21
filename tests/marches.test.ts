/**
 * La fiche d'un marché (21 octobre 2026) : le calendrier yemba de 8 jours, la
 * fiche contrôlée (lieu principal, codes connus), et ce qui en est déduit.
 *
 *   node --import tsx --test tests/marches.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ESPECES, INFRASTRUCTURES_MARCHE } from "../src/lib/acteurs";
import {
  CALENDRIERS, dateAuCameroun, equipementsPresents, jourTraditionnel, joursEnClair, lieuxEnClair, nettoyerFicheMarche, prochaineDate,
} from "../src/lib/marches";
import { preparerEcriture } from "../src/server/etablissements/donnees";

const YEMBA = CALENDRIERS.MEN;
const especes = ESPECES.map((e) => e.code);
const equipements = INFRASTRUCTURES_MARCHE.map((e) => e.code);
const nettoyer = (b: unknown) => nettoyerFicheMarche(b, especes, equipements, "MEN");

test("calendrier yemba : les dates de référence d'ASENGO, et le 21 octobre 2026 vérifié par le Délégué", () => {
  assert.equal(jourTraditionnel(YEMBA, "2017-09-08").libelle, "Ngang");
  assert.equal(jourTraditionnel(YEMBA, "2017-09-02").libelle, "Mbouolo");
  assert.equal(jourTraditionnel(YEMBA, "2017-09-30").libelle, "Efa'a");
  assert.equal(jourTraditionnel(YEMBA, "2017-09-01").libelle, "Mbouwa"); // avant la date de référence aussi
  assert.equal(jourTraditionnel(YEMBA, "2026-10-21").libelle, "Mbouolo");
  // Le cycle : huit jours plus tard, le même jour.
  assert.equal(jourTraditionnel(YEMBA, "2026-10-29").libelle, "Mbouolo");
});

test("prochaine date d'un jour de marché, aujourd'hui compris", () => {
  assert.equal(prochaineDate(YEMBA, "NGANG", "2026-10-21"), "2026-10-27");
  assert.equal(prochaineDate(YEMBA, "MBOUOLO", "2026-10-21"), "2026-10-21");
  assert.equal(prochaineDate(YEMBA, "META", "2026-10-21"), "2026-10-22");
  assert.equal(prochaineDate(YEMBA, "INCONNU", "2026-10-21"), null);
  assert.match(dateAuCameroun(new Date("2026-10-20T23:30:00Z")), /^2026-10-21$/); // UTC+1 au Cameroun
});

test("la fiche : codes inconnus écartés, petit et grand marché distincts", () => {
  const r = nettoyer({ typeMarche: "BETAIL", fonctionnement: "N'IMPORTE", rythme: "HUIT_JOURS", grandMarche: "NGANG", petitMarche: "META", nomLocalJour: "  Ngan  " });
  assert.ok("fiche" in r);
  if ("fiche" in r) {
    assert.equal(r.fiche.typeMarche, "BETAIL");
    assert.equal(r.fiche.fonctionnement, null);
    assert.equal(r.fiche.nomLocalJour, "Ngan");
    assert.equal(joursEnClair(r.fiche, "MEN", false), "Grand marché : Ngang · Petit marché : Meta · nom local : Ngan");
  }
  assert.ok("erreur" in nettoyer({ rythme: "HUIT_JOURS", grandMarche: "NGANG", petitMarche: "NGANG" }));
  // Un jour yemba n'a pas de sens pour un marché hebdomadaire.
  const s = nettoyer({ rythme: "SEMAINE", grandMarche: "NGANG" });
  assert.ok("fiche" in s && s.fiche.grandMarche === null);
});

test("provenances et destinations : plusieurs lieux, toujours un principal parmi eux", () => {
  assert.ok("erreur" in nettoyer({ provenances: ["ARR:Fokoué", "REG:Adamaoua"] }), "deux lieux sans principal : refusé");
  assert.ok("erreur" in nettoyer({ provenances: ["ARR:Fokoué"], provenancePrincipale: "REG:Adamaoua" }), "un principal hors de la liste : refusé");
  const un = nettoyer({ destinations: ["VILLE:Douala"] });
  assert.ok("fiche" in un && un.fiche.destinationPrincipale === "VILLE:Douala", "un seul lieu : c'est lui le principal");
  const r = nettoyer({ provenances: ["ARR:Fokoué", "REG:Adamaoua", "AUTRE", "<script>"], provenancePrincipale: "REG:Adamaoua", provenanceAutre: "Bamenda" });
  assert.ok("fiche" in r);
  if ("fiche" in r) {
    assert.deepEqual(r.fiche.provenances, ["ARR:Fokoué", "REG:Adamaoua", "AUTRE"]);
    assert.equal(lieuxEnClair(r.fiche.provenances, r.fiche.provenancePrincipale, r.fiche.provenanceAutre), "Région Adamaoua (principal), Fokoué, Bamenda");
  }
});

test("équipements et état : les présents alimentent l'ancienne colonne", () => {
  const r = nettoyer({ equipements: { CLOTURE: "BON", HANGAR: "ABSENT", POINT_EAU: "MAUVAIS", INCONNU: "BON", BASCULE: "CASSE" } });
  assert.ok("fiche" in r);
  if ("fiche" in r) {
    assert.deepEqual(r.fiche.equipements, { CLOTURE: "BON", HANGAR: "ABSENT", POINT_EAU: "MAUVAIS" });
    assert.deepEqual(equipementsPresents(r.fiche).sort(), ["CLOTURE", "POINT_EAU"]);
  }
});

test("écriture : un marché n'a ni propriétaire ni téléphone ; la fiche est réservée aux marchés ; l'auteur du GPS est la session", () => {
  const ctx = { typeCode: "ETAB_MARCHE", codeDepartement: "MEN", username: "da.dschang" };
  const r = preparerEcriture(
    {
      proprietaire: "M. X", telephone: "699", especes: ["BOVINS"],
      latitude: 5.44, longitude: 10.05, precisionGPS: 4, dateCollecteGPS: "2026-10-21T08:00:00Z",
      fiche: { rythme: "SEMAINE", grandMarche: "JEUDI", effectifs: { BOVINS: "PLUS_200", PORCINS: "MOINS_50" }, equipements: { CLOTURE: "BON" } },
    },
    ctx
  );
  assert.ok("data" in r);
  if ("data" in r) {
    assert.equal(r.data.proprietaire, null);
    assert.equal(r.data.telephone, null);
    assert.equal(r.data.sourceGPS, "da.dschang");
    assert.deepEqual(r.data.joursMarche, ["JEUDI"]);
    assert.deepEqual(r.data.infrastructures, ["CLOTURE"]);
    assert.deepEqual((r.data.fiche as { effectifs: object }).effectifs, { BOVINS: "PLUS_200" }, "pas d'effectif pour une espèce non vendue");
  }
  assert.ok("erreur" in preparerEcriture({ fiche: {} }, { ...ctx, typeCode: "ETAB_COUVOIR" }));
});

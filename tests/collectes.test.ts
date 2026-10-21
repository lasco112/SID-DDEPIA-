/**
 * Les collectes ponctuelles (21 octobre 2026) : contrôle du lancement, qui la
 * voit, l'avancement lu dans le journal, le rappel du matin une seule fois.
 *
 *   node --env-file=.env --import tsx --test --test-concurrency=1 tests/collectes.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { base } from "../src/lib/baseDeTravail";
import { listerArrondissements } from "../src/lib/arrondissements";
import { avancement, collectesPour, etatDe, lancerCollecte, nettoyerCollecte, rappelsDuMatin, type Collecte } from "../src/server/collectes/collectes";

const TITRE = "ESSAI collecte des marchés";
const crees: { collectes: string[]; etabs: string[] } = { collectes: [], etabs: [] };

after(async () => {
  await base.auditLog.deleteMany({ where: { entiteId: { in: crees.etabs } } });
  await base.etablissement.deleteMany({ where: { id: { in: crees.etabs } } });
  for (const id of crees.collectes) await base.configSysteme.deleteMany({ where: { cle: { startsWith: `collecte_rappel_${id}_` } } });
  await base.collecteCampagne.deleteMany({ where: { id: { in: crees.collectes } } });
  await base.notification.deleteMany({ where: { declencheur: "COLLECTE", message: { contains: TITRE } } });
  // L'envoi aux téléphones part en arrière-plan : on le laisse finir.
  await new Promise((r) => setTimeout(r, 2000));
  await base.$disconnect();
});

test("lancer : titre, questionnaire, rôles, dates — et « tous » se note par une liste vide", () => {
  const arrs = ["a1", "a2"];
  const ok = { titre: "Recensement", typeCode: "ETAB_MARCHE", arrondissementIds: ["a1", "a2"], roles: ["DA", "AGENT_SAISIE"], debut: "2026-10-21", fin: "2026-10-22" };
  const r = nettoyerCollecte(ok, arrs, "2026-10-21");
  assert.ok("data" in r && r.data.arrondissementIds.length === 0 && r.data.prioritaire === true);
  const refus = (b: Record<string, unknown>) => "erreur" in nettoyerCollecte({ ...ok, ...b }, arrs, "2026-10-21");
  assert.ok(refus({ titre: "x" }));
  assert.ok(refus({ typeCode: "INCONNU" }));
  assert.ok(refus({ roles: [] }));
  assert.ok(refus({ roles: ["CHEF_PSA"] }));
  assert.ok(refus({ arrondissementIds: ["autre-departement"] }));
  assert.ok(refus({ debut: "2026-10-23", fin: "2026-10-22" }));
  assert.ok(refus({ debut: "2026-10-01", fin: "2026-10-20" }), "déjà finie");
  assert.ok(refus({ fin: "2027-06-01" }), "plus de trois mois");
});

test("état : à venir, en cours (bornes comprises), terminée, clôturée", () => {
  const c = { debut: "2026-10-21", fin: "2026-10-22", clotureeLe: null };
  assert.equal(etatDe(c, "2026-10-20"), "a_venir");
  assert.equal(etatDe(c, "2026-10-21"), "en_cours");
  assert.equal(etatDe(c, "2026-10-22"), "en_cours");
  assert.equal(etatDe(c, "2026-10-23"), "terminee");
  assert.equal(etatDe({ ...c, clotureeLe: new Date() }, "2026-10-21"), "terminee");
});

test("ciblage, avancement et rappel du matin", async () => {
  const arrs = await listerArrondissements(base);
  const dschang = arrs.find((a) => a.nom === "Dschang")!;
  const fokoue = arrs.find((a) => a.nom === "Fokoué")!;
  const dd = await base.user.findFirstOrThrow({ where: { role: "DD", actif: true }, select: { id: true } });
  const da = await base.user.findFirstOrThrow({ where: { role: "DA", actif: true, arrondissementId: dschang.id }, select: { id: true } });
  const aujourdhui = "2035-03-14";

  // Une collecte pour Dschang seulement, DA et agents, sur deux jours de 2035.
  const { collecte, notifies } = await lancerCollecte(
    base,
    { titre: TITRE, consigne: "Essai", typeCode: "ETAB_MARCHE", arrondissementIds: [dschang.id], roles: ["DA", "AGENT_SAISIE"], debut: aujourdhui, fin: "2035-03-15", prioritaire: true },
    dd.id
  );
  crees.collectes.push(collecte.id);
  const attendus = await base.user.count({ where: { actif: true, role: { in: ["DA", "AGENT_SAISIE"] }, arrondissementId: dschang.id } });
  assert.equal(notifies, attendus, "prévenus : les DA et agents actifs de Dschang, et eux seuls");

  assert.equal((await collectesPour(base, { role: "DA", arrondissementId: dschang.id }, aujourdhui)).filter((c) => c.id === collecte.id).length, 1);
  assert.equal((await collectesPour(base, { role: "DA", arrondissementId: fokoue.id }, aujourdhui)).filter((c) => c.id === collecte.id).length, 0, "Fokoué n'est pas visé");
  assert.equal((await collectesPour(base, { role: "CHEF_PSA", arrondissementId: dschang.id }, aujourdhui)).length, 0, "un chef ne collecte pas");
  assert.equal((await collectesPour(base, { role: "DA", arrondissementId: dschang.id }, "2035-03-16")).filter((c) => c.id === collecte.id).length, 0, "finie");

  // Un marché recensé pendant la collecte — et un couvoir, qui ne compte pas.
  const pendant = new Date("2035-03-14T10:00:00+01:00");
  for (const [typeCode, nom] of [["ETAB_MARCHE", "ESSAI marché"], ["ETAB_COUVOIR", "ESSAI couvoir"]] as const) {
    const e = await base.etablissement.create({ data: { typeCode, nom, localite: "x", arrondissementId: dschang.id, latitude: typeCode === "ETAB_MARCHE" ? 5.4 : null, longitude: typeCode === "ETAB_MARCHE" ? 10 : null, fiche: { organisation: "ZONE_ANIMAUX", rythme: "QUOTIDIEN" } } });
    crees.etabs.push(e.id);
    await base.auditLog.create({ data: { userId: da.id, action: "CREATION_ETABLISSEMENT", entite: "Etablissement", entiteId: e.id, createdAt: pendant, details: { typeCode } } });
  }
  const a = await avancement(base, collecte as Collecte);
  assert.equal(a.lignes.length, 1);
  assert.equal(a.lignes[0].fiches, 1, "le marché compte, pas le couvoir");
  assert.equal(a.lignes[0].completes, 1, "organisation, jours et position : complète");
  assert.equal(a.lignes[0].avecGps, 1);
  assert.equal(a.lignes[0].auteurs.length, 1);
  assert.equal(a.total.arrondissementsActifs, 1);

  // Le rappel du matin : pas avant 7 h ; à 8 h, une fois ; pas deux.
  assert.equal(await rappelsDuMatin(base, new Date("2035-03-15T05:30:00+01:00")), 0, "avant 7 h");
  const premier = await rappelsDuMatin(base, new Date("2035-03-15T08:00:00+01:00"));
  assert.equal(premier, attendus);
  assert.equal(await rappelsDuMatin(base, new Date("2035-03-15T09:00:00+01:00")), 0, "une seule fois par jour");
  assert.equal(await rappelsDuMatin(base, new Date("2035-03-16T08:00:00+01:00")), 0, "après la fin, plus rien");
});

/**
 * La démonstration de formation (14 et 15 octobre 2026) : chaque département
 * de l'Ouest a la sienne — ses arrondissements, et pour chacun un DA et un
 * agent de saisie —, six mois clos et complets puis le mois en cours.
 *
 * Sans base de démonstration configurée, le test ne fait rien.
 *
 *   node --env-file=.env --import tsx --test tests/demonstration.test.ts
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { clientCloisonne } from "../src/lib/dbCloisonne";
import { reinitialiserDonneesDemo } from "../prisma/seed-demo";
import { inspecterPeriode } from "../src/server/trimestre/agregation";
import { trimestrielle } from "../src/server/periodes/calendrier";

const URL_DEMO = process.env.DEMO_DATABASE_URL;
const brut = URL_DEMO ? new PrismaClient({ datasources: { db: { url: URL_DEMO } } }) : null;
after(async () => brut?.$disconnect());

test("la remise à zéro remplit chaque département, avec ses propres comptes", { skip: !brut }, async () => {
  const r = await reinitialiserDonneesDemo();
  assert.equal(r.mois, 7);
  for (const d of await brut!.departement.findMany()) {
    const c = clientCloisonne(brut!, d.id);
    const arrondissements = await c.arrondissement.count();
    if (arrondissements === 0) continue;
    assert.ok((await c.saisieMatrice.count()) > 0, `${d.code} a ses saisies`);
    const comptes = await c.user.findMany({ where: { username: { startsWith: "demo." } }, select: { role: true } });
    const n = (role: string) => comptes.filter((u) => u.role === role).length;
    assert.equal(n("DD"), 1, `${d.code} : un DD`);
    assert.equal(n("DA"), arrondissements, `${d.code} : un DA par arrondissement`);
    assert.equal(n("AGENT_SAISIE"), arrondissements, `${d.code} : un agent par arrondissement`);
    assert.equal(n("CHEF_PSA") + n("CHEF_SSV") + n("CHEF_SPAIH") + n("CHEF_BAC"), 4, `${d.code} : quatre chefs`);
  }
});

test("la Menoua garde ses comptes d'origine ; les autres sont préfixés de leur code", { skip: !brut }, async () => {
  const men = await brut!.departement.findUniqueOrThrow({ where: { code: "MEN" } });
  const bam = await brut!.departement.findUniqueOrThrow({ where: { code: "BAM" } });
  assert.ok(await clientCloisonne(brut!, men.id).user.findUnique({ where: { username: "demo.da.dschang" } }));
  assert.ok(await clientCloisonne(brut!, men.id).user.findUnique({ where: { username: "demo.agent.dschang" } }));
  assert.ok(await clientCloisonne(brut!, bam.id).user.findUnique({ where: { username: "demo.bam.da.mbouda" } }));
  assert.ok(await clientCloisonne(brut!, bam.id).user.findUnique({ where: { username: "demo.bam.dd" } }));
});

test("le 3e trimestre de démonstration est complet ; octobre est en cours, une situation par arrondissement", { skip: !brut }, async () => {
  const men = await brut!.departement.findUniqueOrThrow({ where: { code: "MEN" } });
  const db = clientCloisonne(brut!, men.id);
  assert.equal((await inspecterPeriode(db, trimestrielle(2026, 3))).calculable, true);
  const octobre = await db.periodeReporting.findFirstOrThrow({ where: { type: "MENSUEL", annee: 2026, mois: 10 } });
  assert.equal(octobre.statut, "OUVERTE");
  const statuts = (await db.rapportArrondissement.findMany({ where: { periodeId: octobre.id }, select: { statut: true } })).map((x) => x.statut).sort();
  assert.deepEqual(statuts, ["CLOTURE", "EN_SAISIE", "REJETE", "SOUMIS", "SOUMIS", "SOUMIS"]);
});

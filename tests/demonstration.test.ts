/**
 * La démonstration de formation (lot F, 14 octobre 2026) : remise à zéro sur
 * la Menoua fictive — jamais sur un autre département —, six mois clos et
 * complets puis le mois en cours, et le 3e trimestre calculable.
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

test("la remise à zéro remplit la Menoua de démonstration, et elle seule", { skip: !brut }, async () => {
  const r = await reinitialiserDonneesDemo();
  assert.equal(r.mois, 7);
  assert.ok(r.saisies > 1000);
  for (const d of await brut!.departement.findMany()) {
    const n = await clientCloisonne(brut!, d.id).saisieMatrice.count();
    if (d.code === "MEN") assert.ok(n > 0, "la Menoua de démonstration a ses saisies");
    else assert.equal(n, 0, `${d.code} ne reçoit rien de la démonstration`);
  }
});

test("le 3e trimestre de démonstration est complet ; octobre est en cours", { skip: !brut }, async () => {
  const men = await brut!.departement.findUniqueOrThrow({ where: { code: "MEN" } });
  const db = clientCloisonne(brut!, men.id);
  const etat = await inspecterPeriode(db, trimestrielle(2026, 3));
  assert.equal(etat.calculable, true);
  const octobre = await db.periodeReporting.findFirstOrThrow({ where: { type: "MENSUEL", annee: 2026, mois: 10 } });
  assert.equal(octobre.statut, "OUVERTE");
  const statuts = (await db.rapportArrondissement.findMany({ where: { periodeId: octobre.id }, select: { statut: true } })).map((x) => x.statut).sort();
  assert.deepEqual(statuts, ["CLOTURE", "EN_SAISIE", "REJETE", "SOUMIS", "SOUMIS", "SOUMIS"], "un arrondissement dans chaque situation");
  assert.ok(await db.user.findUnique({ where: { username: "demo.agent.dschang" } }), "un compte d'agent de saisie");
});

/**
 * État du cloisonnement par département.
 *
 * Ce contrôle répond à une seule question, et il faut pouvoir y répondre à tout
 * moment : « une ligne peut-elle échapper à son département ? » Il dresse
 * l'inventaire de ce qui est posé — colonnes, valeurs par défaut, clés
 * étrangères, politiques de sécurité — et signale ce qui manque.
 *
 *   node --env-file=.env --import tsx scripts/verifier-cloisonnement.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Les tables dont chaque ligne appartient à un département. */
const CLOISONNEES = [
  "Arrondissement", "PeriodeReporting", "User", "Etablissement", "AssignationSaisie",
  "RapportArrondissement", "ValidationSection", "SaisieMatrice", "SaisieNominative",
  "SaisieEvenement", "Correction", "RubriqueNarrative", "SyntheseSection",
  "ExportDocument", "Notification", "AbonnementPush", "PointSIG", "AuditLog", "DemandeAide",
];

/** Communes à tous les départements : nomenclature du MINEPIA, pas données d'un territoire. */
const COMMUNES = ["Section", "ReferentielItem", "FormTemplate", "FormField", "MappingRapport", "ConfigSysteme"];

const dire = (quoi: string, ok: boolean) => {
  console.log(`  ${ok ? "ok    " : "MANQUE"}  ${quoi}`);
  if (!ok) process.exitCode = 1;
};

async function principal() {
  const [{ u }] = await db.$queryRawUnsafe<{ u: string }[]>(`SELECT current_user AS u`);
  console.log(`Rôle applicatif : « ${u} »\n`);

  // --- Les territoires ------------------------------------------------------
  const regions = await db.region.findMany({ include: { departements: true } });
  console.log("Territoires");
  for (const r of regions) {
    console.log(`  ${r.code} ${r.nom} — ${r.departements.map((d) => `${d.code} ${d.nom}`).join(", ") || "aucun département"}`);
  }
  dire("au moins une région et un département", regions.some((r) => r.departements.length > 0));

  // --- Les colonnes, les défauts, les clés étrangères ------------------------
  console.log("\nColonnes de cloisonnement");
  const colonnes = await db.$queryRawUnsafe<{ table_name: string; column_default: string | null }[]>(
    `SELECT table_name, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'departementId'`
  );
  const avecColonne = new Set(colonnes.map((c) => c.table_name));
  const sansDefaut = colonnes.filter((c) => !c.column_default).map((c) => c.table_name);

  const manquantes = CLOISONNEES.filter((t) => !avecColonne.has(t));
  dire(`les ${CLOISONNEES.length} tables cloisonnées portent la colonne`, manquantes.length === 0);
  if (manquantes.length) console.log(`        manquent : ${manquantes.join(", ")}`);

  const enTrop = COMMUNES.filter((t) => avecColonne.has(t));
  dire("aucune table commune ne la porte à tort", enTrop.length === 0);
  if (enTrop.length) console.log(`        en trop : ${enTrop.join(", ")}`);

  dire("chacune a une valeur par défaut (compatibilité de déploiement)", sansDefaut.length === 0);
  if (sansDefaut.length) console.log(`        sans défaut : ${sansDefaut.join(", ")}`);

  const fks = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage k
         ON tc.constraint_name = k.constraint_name AND tc.table_schema = k.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
        AND k.column_name = 'departementId'`
  );
  dire(`chaque colonne pointe vraiment un département (${fks[0].n} clés étrangères)`, fks[0].n >= CLOISONNEES.length);

  // --- Les lignes orphelines ------------------------------------------------
  console.log("\nRattachement des lignes");
  let total = 0;
  const orphelines: string[] = [];
  for (const t of CLOISONNEES) {
    const [{ n, sans }] = await db.$queryRawUnsafe<{ n: number; sans: number }[]>(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE "departementId" IS NULL)::int AS sans
         FROM "${t}"`
    );
    total += n;
    if (sans > 0) orphelines.push(`${t} (${sans}/${n})`);
  }
  dire(`${total} lignes rattachées, aucune orpheline`, orphelines.length === 0);
  if (orphelines.length) console.log(`        orphelines : ${orphelines.join(", ")}`);

  // --- Les politiques de sécurité par ligne ---------------------------------
  console.log("\nSécurité par ligne");
  const rls = await db.$queryRawUnsafe<{ tablename: string; rowsecurity: boolean }[]>(
    `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`
  );
  const actives = rls.filter((t) => t.rowsecurity).map((t) => t.tablename);
  const politiques = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`
  );
  console.log(`  ${actives.length}/${CLOISONNEES.length} tables avec RLS activée, ${politiques[0].n} politique(s)`);
  const manquantesRls = CLOISONNEES.filter((t) => !actives.includes(t));
  dire("toutes les tables cloisonnées ont la sécurité par ligne", manquantesRls.length === 0);
  if (manquantesRls.length) {
    console.log(`        sans RLS : ${manquantesRls.length} table(s) — ${manquantesRls.slice(0, 6).join(", ")}${manquantesRls.length > 6 ? "…" : ""}`);
  }
}

principal()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());

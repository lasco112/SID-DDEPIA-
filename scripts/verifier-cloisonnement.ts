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
import { transactionCloisonnee } from "../src/lib/dbCloisonne";

const db = new PrismaClient();

/** Les tables dont chaque ligne appartient à un département. */
const CLOISONNEES = [
  "Arrondissement", "PeriodeReporting", "User", "Etablissement", "AssignationSaisie",
  "RapportArrondissement", "ValidationSection", "SaisieMatrice", "SaisieNominative",
  "SaisieEvenement", "Correction", "RubriqueNarrative", "SaisieCanevas", "AppelIA", "CasBancEssai", "SyntheseSection",
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

  // La valeur par défaut a été RETIRÉE, et c'est voulu : elle rattachait à la
  // Menoua toute ligne créée sans département déclaré. Un déclencheur la
  // remplace — il pose le département de la session, et refuse la ligne s'il
  // n'y en a pas. Une insertion non cloisonnée échoue au lieu de produire une
  // ligne mal rattachée.
  const avecDefaut = colonnes.filter((c) => c.column_default).map((c) => c.table_name);
  dire("aucune n'a de valeur par défaut (elle masquerait l'absence de département)", avecDefaut.length === 0);
  if (avecDefaut.length) console.log(`        avec défaut : ${avecDefaut.join(", ")}`);

  const declencheurs = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n
       FROM pg_trigger
      WHERE NOT tgisinternal
        AND tgfoid = 'public.poser_departement'::regproc`
  );
  dire(
    `le département est posé à la création (${declencheurs[0].n} déclencheur(s))`,
    declencheurs[0].n >= CLOISONNEES.length
  );

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
  //
  // ATTENTION : une fois les politiques posées, ce recensement fait avec le
  // rôle applicatif ne verrait plus RIEN — et « 0 ligne, aucune orpheline »
  // s'afficherait en vert. On compte donc département par département, avec le
  // client cloisonné de chacun, exactement comme l'application.
  console.log("\nRattachement des lignes");
  const departements = await db.departement.findMany({ orderBy: { code: "asc" } });
  let total = 0;
  const orphelines: string[] = [];

  for (const departement of departements) {
    const parDepartement = await transactionCloisonnee(db, departement.id, async (tx) => {
      let n = 0;
      for (const t of CLOISONNEES) {
        const [{ c, sans }] = await tx.$queryRawUnsafe<{ c: number; sans: number }[]>(
          `SELECT count(*)::int AS c,
                  count(*) FILTER (WHERE "departementId" IS NULL)::int AS sans
             FROM "${t}"`
        );
        n += c;
        if (sans > 0) orphelines.push(`${departement.code}/${t} (${sans}/${c})`);
      }
      return n;
    });
    console.log(`  ${departement.code} : ${parDepartement} ligne(s)`);
    total += parDepartement;
  }

  dire(`${total} lignes rattachées, aucune orpheline`, orphelines.length === 0 && total > 0);
  if (orphelines.length) console.log(`        orphelines : ${orphelines.join(", ")}`);
  if (total === 0) console.log("        aucune ligne visible : le contrôle ne prouverait rien");

  // Le contrôle qui donne son sens à tous les autres : sans département
  // déclaré, la connexion applicative ne doit voir aucune ligne.
  const [{ n: vues }] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "SaisieMatrice"`);
  dire("sans réglage de session, l'application ne voit aucune ligne", vues === 0);

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

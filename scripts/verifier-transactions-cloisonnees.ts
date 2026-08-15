/**
 * Les transactions applicatives, une fois le client cloisonné.
 *
 * Sept endroits du code ouvraient une transaction. Aucun ne tenait ses
 * promesses une fois `db` remplacé par un client étendu — et l'échec est
 * silencieux : le code a l'air atomique, les écritures ne le sont pas. Ce
 * contrôle le montre plutôt que de l'affirmer, puis vérifie que la forme
 * retenue (`user.transaction`) répare bien le défaut.
 *
 * Tout se joue sur des lignes fictives, supprimées à la fin.
 *
 *   node --env-file=.env --import tsx scripts/verifier-transactions-cloisonnees.ts
 */
import { PrismaClient } from "@prisma/client";
import { clientCloisonne, transactionCloisonnee, REGLAGE_DEPARTEMENT } from "../src/lib/dbCloisonne";

const db = new PrismaClient({ log: ["error"] });

const dire = (quoi: string, ok: boolean) => {
  console.log(`  ${ok ? "ok    " : "FAUTE "}  ${quoi}`);
  if (!ok) process.exitCode = 1;
};

const PREFIXE = "controle_transaction_";
const A = `${PREFIXE}a`;
const B = `${PREFIXE}b`;

class EchecVoulu extends Error {}

async function principal() {
  const menoua = await db.departement.findFirstOrThrow({ where: { code: "MEN" } });
  const etendu = clientCloisonne(db, menoua.id);
  const nettoyer = () => db.configSysteme.deleteMany({ where: { cle: { startsWith: PREFIXE } } });

  try {
    // --- Le garde-fou --------------------------------------------------------
    console.log("\nLe garde-fou");

    let refus: string | null = null;
    try {
      await transactionCloisonnee(etendu, menoua.id, async () => null);
    } catch (e) {
      refus = e instanceof Error ? e.message : String(e);
    }
    dire("un client déjà cloisonné est refusé, au lieu de partir en récursion", Boolean(refus));
    if (refus) console.log(`        « ${refus.slice(0, 78)}… »`);

    // --- Ce que faisait l'ancienne forme -------------------------------------
    console.log("\nL'ancienne forme, en tableau, sur un client cloisonné");

    await nettoyer();
    let formeTableauRompue = false;
    try {
      await (etendu as any).$transaction([
        etendu.configSysteme.create({ data: { cle: A, valeur: "1" } }),
        // Même clé : la seconde opération viole l'unicité et doit tout défaire.
        etendu.configSysteme.create({ data: { cle: A, valeur: "2" } }),
      ]);
    } catch {
      formeTableauRompue = true;
    }
    const rescapee = await db.configSysteme.findUnique({ where: { cle: A } });
    dire("la seconde opération échoue bien", formeTableauRompue);
    // Si la ligne A a survécu, c'est que la première opération avait déjà été
    // validée dans SA propre transaction : rien n'était atomique.
    dire(
      rescapee
        ? "elle n'était PAS atomique — la première écriture a survécu (défaut reproduit)"
        : "elle n'était PAS atomique — Prisma refuse même de composer le tableau (défaut reproduit)",
      true
    );

    // --- Ce que fait la nouvelle forme ---------------------------------------
    console.log("\nLa forme retenue : la transaction de la session");

    await nettoyer();
    let annulee = false;
    try {
      await transactionCloisonnee(db, menoua.id, async (tx) => {
        await tx.configSysteme.create({ data: { cle: A, valeur: "1" } });
        await tx.configSysteme.create({ data: { cle: B, valeur: "2" } });
        throw new EchecVoulu("panne au milieu de la séquence");
      });
    } catch (e) {
      annulee = e instanceof EchecVoulu;
    }
    dire("l'erreur du milieu remonte telle quelle à l'appelant", annulee);

    const restes = await db.configSysteme.count({ where: { cle: { startsWith: PREFIXE } } });
    dire(`aucune des deux écritures ne subsiste (${restes} ligne(s) trouvée(s))`, restes === 0);

    // --- Et elle déclare bien le département ---------------------------------
    console.log("\nCe que la transaction déclare");

    const observe = await transactionCloisonnee(db, menoua.id, async (tx) => {
      await tx.configSysteme.create({ data: { cle: A, valeur: "1" } });
      const [{ v }] = await tx.$queryRawUnsafe<{ v: string | null }[]>(
        `SELECT current_setting('${REGLAGE_DEPARTEMENT}', true) AS v`
      );
      return v;
    });
    dire("le département est déclaré pour toute la durée de la transaction", observe === menoua.id);

    const validee = await db.configSysteme.findUnique({ where: { cle: A } });
    dire("une transaction qui va au bout, elle, est bien validée", Boolean(validee));

    // --- Une transaction imbriquée ne casse rien -----------------------------
    console.log("\nUne transaction dans une transaction");

    const imbrique = await transactionCloisonnee(db, menoua.id, async (tx) => {
      // PostgreSQL n'imbrique pas les transactions : l'appel intérieur doit se
      // raccrocher à celle déjà ouverte, sans en réclamer une seconde.
      return transactionCloisonnee(db, menoua.id, async (interne) => {
        await interne.configSysteme.create({ data: { cle: B, valeur: "2" } });
        return "abouti";
      });
    });
    dire("l'appel intérieur se raccroche à celle déjà ouverte", imbrique === "abouti");
  } finally {
    const r = await nettoyer();
    console.log(`\nRemise en état : ${r.count} ligne(s) de contrôle supprimée(s).`);
  }
}

principal()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

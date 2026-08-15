/**
 * Les relances calendaires, département par département.
 *
 * Les tâches de fond ne disposent d'aucune session : elles auraient pu recevoir
 * une connexion d'administration. La décision a été de les faire boucler sur
 * les départements avec le client cloisonné de chacun (docs/CLOISONNEMENT.md,
 * étape 2). Ce contrôle vérifie que cette boucle se comporte comme annoncé.
 *
 * Il est conçu pour ne RIEN envoyer : il pilote l'horloge de `verifierRelances`
 * sur des instants où la relance due retombe sur une période déjà validée, donc
 * sans destinataire. Le nombre de notifications en base est relevé avant et
 * après, et le contrôle échoue s'il a bougé.
 *
 *   node --env-file=.env --import tsx scripts/verifier-relances-cloisonnees.ts
 */
import { transactionCloisonnee, REGLAGE_DEPARTEMENT } from "../src/lib/dbCloisonne";
import { verifierRelances } from "../src/server/cron/planificateur";
import { base, baseBrute } from "../src/lib/baseDeTravail";

/*
 * Deux clients, et il faut les distinguer :
 *
 *   `db`   — nu. Pour `Departement` et `ConfigSysteme`, qui ne sont pas des
 *            tables cloisonnées, et pour ouvrir les transactions de contrôle
 *            (transactionCloisonnee refuse un client déjà cloisonné).
 *   `base` — cloisonné. Pour `PeriodeReporting` et `Notification`, qui le sont :
 *            les lire à nu rendrait ce contrôle aveugle, et il conclurait
 *            « rien à signaler » sur une base qu'il ne voit pas.
 */
const db = baseBrute;

const dire = (quoi: string, ok: boolean) => {
  console.log(`  ${ok ? "ok    " : "FAUTE "}  ${quoi}`);
  if (!ok) process.exitCode = 1;
};
const noter = (quoi: string) => console.log(`  ?     NON VÉRIFIÉ — ${quoi}`);

/** 09h00 à Douala le jour dit : une heure après l'échéance de la relance. */
const instant = (jour: number, heureLocale: number) =>
  new Date(Date.UTC(2026, 7, jour, heureLocale - 1, 0, 0));

const CODE_FICTIF = "ZZT";

async function principal() {
  const menoua = await db.departement.findFirstOrThrow({ where: { code: "MEN" } });
  const notificationsAvant = await base.notification.count();
  const marqueursCrees: string[] = [];
  let departementFictifId: string | null = null;

  try {
    // --- Le client que la boucle fabrique déclare bien son département -------
    console.log("\nCe que déclare le client de la boucle");

    const [{ v }] = await transactionCloisonnee(db, menoua.id, (tx) =>
      tx.$queryRawUnsafe<{ v: string | null }[]>(
        `SELECT current_setting('${REGLAGE_DEPARTEMENT}', true) AS v`
      )
    );
    dire(`le département est déclaré à la base (${v === menoua.id ? "MEN" : String(v)})`, v === menoua.id);

    const [{ v: horsTransaction }] = await db.$queryRawUnsafe<{ v: string | null }[]>(
      `SELECT current_setting('${REGLAGE_DEPARTEMENT}', true) AS v`
    );
    // `set_config(..., true)` est local à la transaction : la valeur ne doit pas
    // survivre sur la connexion mutualisée, sinon la requête suivante — celle
    // d'un autre délégué — la lirait.
    dire("il ne survit pas à la fin de la transaction", !horsTransaction);

    // --- La clé héritée, pour ne pas notifier deux fois à la mise en service --
    console.log("\nLes relances déjà parties avant le cloisonnement");

    const heritee = "relance_RAPPEL_CLOTURE_DD_2026-07";
    const marqueurHerite = await db.configSysteme.findUnique({ where: { cle: heritee } });
    const nbDepartements = await db.departement.count();

    if (!marqueurHerite || nbDepartements !== 1) {
      noter(`la clé « ${heritee} » ${marqueurHerite ? "existe" : "est absente"} et la base compte ${nbDepartements} département(s) : le cas de reprise ne peut pas être joué ici`);
    } else {
      // 2 août 2026, 09h00 : le rappel de clôture du DD est dû, et il vise
      // juillet — le mois que porte justement la clé héritée.
      await verifierRelances(instant(2, 9));
      const doublon = await db.configSysteme.findUnique({
        where: { cle: "relance_RAPPEL_CLOTURE_DD_MEN_2026-07" },
      });
      dire("une relance déjà partie n'est pas renvoyée sous sa nouvelle clé", !doublon);
      if (doublon) marqueursCrees.push(doublon.cle);
    }

    // --- Le marqueur porte le département -----------------------------------
    console.log("\nLe marqueur d'une relance");

    const periode = await base.periodeReporting.findFirst({ where: { type: "MENSUEL", annee: 2026, mois: 8 } });
    if (!periode || periode.statut === "OUVERTE") {
      noter("la période 08/2026 est ouverte (ou absente) : jouer le rappel du 27 enverrait de vraies notifications");
    } else {
      // 27 août 2026, 09h00 : le rappel J-1 est dû. La période étant déjà
      // validée, le déclencheur s'arrête aussitôt — aucun destinataire.
      await verifierRelances(instant(27, 9));

      const cleMen = "relance_RAPPEL_J-1_MEN_2026-08";
      const marqueur = await db.configSysteme.findUnique({ where: { cle: cleMen } });
      if (marqueur) marqueursCrees.push(cleMen);
      dire("il porte le code du département, pas seulement le mois", Boolean(marqueur));

      const ancienneForme = await db.configSysteme.findUnique({ where: { cle: "relance_RAPPEL_J-1_2026-08" } });
      dire("l'ancienne forme, sans département, n'est plus écrite", !ancienneForme);

      // --- Un second département est traité pour lui-même --------------------
      console.log("\nUn second département");

      const fictif = await db.departement.create({
        data: { code: CODE_FICTIF, nom: "Département de contrôle", regionId: menoua.regionId },
      });
      departementFictifId = fictif.id;

      await verifierRelances(instant(27, 9));

      const cleFictif = `relance_RAPPEL_J-1_${CODE_FICTIF}_2026-08`;
      const marqueurFictif = await db.configSysteme.findUnique({ where: { cle: cleFictif } });
      if (marqueurFictif) marqueursCrees.push(cleFictif);
      dire("il reçoit son propre marqueur, distinct de celui de la Menoua", Boolean(marqueurFictif));

      const marqueurMenIntact = await db.configSysteme.findUnique({ where: { cle: cleMen } });
      dire("le marqueur de la Menoua n'a pas été réécrit à sa place", Boolean(marqueurMenIntact));
    }

    // --- Rien n'est parti ----------------------------------------------------
    console.log("\nCe qui a été envoyé");
    const notificationsApres = await base.notification.count();
    dire(
      `aucune notification produite par ce contrôle (${notificationsAvant} avant, ${notificationsApres} après)`,
      notificationsApres === notificationsAvant
    );
  } finally {
    // --- Remise en état ------------------------------------------------------
    let marqueursSupprimes = 0;
    if (marqueursCrees.length) {
      const r = await db.configSysteme.deleteMany({ where: { cle: { in: marqueursCrees } } });
      marqueursSupprimes = r.count;
    }
    if (departementFictifId) {
      await db.departement.delete({ where: { id: departementFictifId } });
    }
    console.log(
      `\nRemise en état : ${marqueursSupprimes} marqueur(s)` +
        `${departementFictifId ? ", 1 département fictif" : ""} — supprimé(s).`
    );
  }
}

principal()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

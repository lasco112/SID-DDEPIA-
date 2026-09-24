/**
 * PROTOCOLE HORS LIGNE — la synchronisation éprouvée jusqu'à ses limites.
 *
 * Joue sur l'application qui tourne ce qu'un appareil de terrain envoie à
 * /api/sync après des heures ou des jours sans réseau : renvois, conflits
 * entre deux appareils, horloges déréglées, lignes fautives au milieu d'un
 * lot, gros lots, rapport soumis entre-temps, période verrouillée, et
 * cloisonnement entre arrondissements. Sessions forgées, jamais de mot de
 * passe. Travaille sur un MOIS DE TEST (janvier 2031) créé puis supprimé.
 *
 *   node --env-file=.env --import tsx scripts/verifier-hors-ligne.ts
 *
 * LOCAL SEULEMENT.
 */
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";
import { base } from "../src/lib/baseDeTravail";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const resultats: { intitule: string; ok: boolean; detail?: string }[] = [];
const controle = (intitule: string, ok: boolean, detail?: string) => {
  resultats.push({ intitule, ok, detail });
  console.log(`${ok ? "  ok     " : "  FAUTE  "} ${intitule}${detail ? ` — ${detail}` : ""}`);
};

type Compte = { id: string; username: string; role: string };
async function sync(u: Compte, periodeId: string, saisies: unknown[]) {
  const jeton = await encode({ token: { sub: u.id, id: u.id, name: u.username, role: u.role }, secret: process.env.NEXTAUTH_SECRET! });
  const r = await fetch(`${BASE}/api/sync`, {
    method: "POST",
    headers: { Cookie: `next-auth.session-token=${jeton}`, "Content-Type": "application/json" },
    body: JSON.stringify({ periodeId, saisies }),
  });
  const json = (await r.json().catch(() => ({}))) as { confirmedIds?: string[]; echecs?: { clientId: string }[]; ignorees?: number; message?: string };
  return { status: r.status, ...json };
}

const il = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

async function principal() {
  const db = base;
  const compte = async (where: object) => db.user.findFirstOrThrow({ where: { ...where, actif: true }, select: { id: true, username: true, role: true, arrondissementId: true } });
  const agent = await compte({ role: "AGENT_SAISIE", arrondissement: { nom: "Nkong-Ni" } });
  const da = await compte({ role: "DA", arrondissement: { nom: "Nkong-Ni" } });
  const daAutre = await compte({ role: "DA", arrondissement: { nom: "Santchou" } });
  const dd = await compte({ role: "DD" });
  const etab = await db.etablissement.findFirst({ where: { arrondissementId: agent.arrondissementId! }, select: { id: true } });

  // Le mois de test.
  const debut = new Date(Date.UTC(2031, 0, 1));
  const periode = await db.periodeReporting.create({
    data: {
      type: "MENSUEL", annee: 2031, mois: 1, statut: "OUVERTE", dateOuverture: debut,
      dateLimiteDA: new Date(Date.UTC(2031, 0, 28)), dateLimiteChef: new Date(Date.UTC(2031, 0, 29)), dateLimiteDD: new Date(Date.UTC(2031, 1, 2)),
    },
  });
  const P = periode.id;
  const cellule = async (fieldCode: string) => {
    const r = await db.rapportArrondissement.findFirst({ where: { periodeId: P, arrondissementId: agent.arrondissementId! }, select: { id: true } });
    return r ? db.saisieMatrice.findFirst({ where: { rapportId: r.id, fieldCode } }) : null;
  };

  try {
    console.log("\n1. ENVOI D'UN LOT APRÈS UNE JOURNÉE HORS LIGNE");
    const lot1 = [
      { clientId: randomUUID(), templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_BOVIN", valeur: 120, nonRenseigne: false, updatedAt: il(600) },
      { clientId: randomUUID(), templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_OVIN", valeur: 0, nonRenseigne: false, updatedAt: il(590) },
      { clientId: randomUUID(), templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_CAPRIN", nonRenseigne: true, motifNonRenseigne: "Recensement en cours", updatedAt: il(580) },
      { clientId: randomUUID(), templateCode: "T32", famille: "EVENEMENT", payload: { maladie: "MAL_PPCB", espece: "ESP_BOVIN", vaccin: "VAC_PPCB", effectifVaccine: 40 }, nonRenseigne: false, updatedAt: il(570) },
      ...(etab ? [{ clientId: randomUUID(), templateCode: "T14", famille: "NOMINATIF", fieldCode: "T14_PONDEUSES_DEBUT", etablissementId: etab.id, valeur: 500, nonRenseigne: false, updatedAt: il(560) }] : []),
    ];
    const r1 = await sync(agent, P, lot1);
    controle("toutes les lignes sont confirmées", r1.status === 200 && r1.confirmedIds?.length === lot1.length, `${r1.status} ${r1.confirmedIds?.length}/${lot1.length}`);
    controle("0 reste 0 (mesuré et nul)", Number((await cellule("T11_CHEPTEL_OVIN"))?.valeur) === 0);
    const nr = await cellule("T11_CHEPTEL_CAPRIN");
    controle("« non renseigné » motivé : valeur vide, motif conservé", nr?.valeur == null && nr?.nonRenseigne === true && nr.motifNonRenseigne === "Recensement en cours");

    console.log("\n2. LE MÊME LOT RENVOYÉ (coupure pendant la réponse)");
    const avant = await db.saisieMatrice.count({ where: { rapport: { periodeId: P } } });
    const r2 = await sync(agent, P, lot1);
    const apres = await db.saisieMatrice.count({ where: { rapport: { periodeId: P } } });
    const evts = await db.saisieEvenement.count({ where: { rapport: { periodeId: P } } });
    controle("renvoi confirmé, sans aucun doublon", r2.confirmedIds?.length === lot1.length && avant === apres && evts === 1, `matrice ${avant}→${apres}, événements ${evts}`);

    console.log("\n3. DEUX APPAREILS SUR LA MÊME CASE");
    const r3 = await sync(da, P, [{ clientId: randomUUID(), templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_BOVIN", valeur: 130, nonRenseigne: false, updatedAt: il(60) }]);
    controle("la correction du DA, plus récente, l'emporte", r3.status === 200 && Number((await cellule("T11_CHEPTEL_BOVIN"))?.valeur) === 130);
    const r4 = await sync(agent, P, [{ clientId: randomUUID(), templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_BOVIN", valeur: 99, nonRenseigne: false, updatedAt: il(3 * 1440) }]);
    controle(
      "l'agent qui revient après 3 jours n'écrase PAS la correction du DA",
      Number((await cellule("T11_CHEPTEL_BOVIN"))?.valeur) === 130 && r4.ignorees === 1,
      `valeur ${(await cellule("T11_CHEPTEL_BOVIN"))?.valeur}, ignorées ${r4.ignorees}, échec : ${JSON.stringify(r4.echecs ?? []).slice(0, 300)}`
    );
    controle("…et sa ligne est confirmée (le serveur détient mieux) : la file de l'agent se vide", r4.confirmedIds?.length === 1);

    console.log("\n4. HORLOGE D'APPAREIL DÉRÉGLÉE (dans le futur)");
    await sync(agent, P, [{ clientId: randomUUID(), templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_OVIN", valeur: 7, nonRenseigne: false, updatedAt: new Date(Date.now() + 365 * 86_400_000).toISOString() }]);
    const futur = await cellule("T11_CHEPTEL_OVIN");
    controle("date future ramenée à l'heure du serveur", futur != null && futur.modifieLe != null && futur.modifieLe.getTime() <= Date.now() + 5_000);
    await sync(da, P, [{ clientId: randomUUID(), templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_OVIN", valeur: 8, nonRenseigne: false, updatedAt: new Date().toISOString() }]);
    controle("…si bien qu'elle ne s'arroge pas le dernier mot", Number((await cellule("T11_CHEPTEL_OVIN"))?.valeur) === 8);

    console.log("\n5. UNE LIGNE FAUTIVE AU MILIEU D'UN LOT");
    const bonne1 = randomUUID(), fautive = randomUUID(), bonne2 = randomUUID();
    const r5 = await sync(agent, P, [
      { clientId: bonne1, templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_BOVIN", valeur: 131, nonRenseigne: false, updatedAt: new Date().toISOString() },
      { clientId: fautive, templateCode: "T14", famille: "NOMINATIF", fieldCode: "T14_PONDEUSES_DEBUT", etablissementId: "etablissement-inexistant", valeur: 1, nonRenseigne: false, updatedAt: new Date().toISOString() },
      { clientId: bonne2, templateCode: "T32", famille: "EVENEMENT", payload: { maladie: "MAL_ROUGET", espece: "ESP_PORCIN", effectifVaccine: 12 }, nonRenseigne: false, updatedAt: new Date().toISOString() },
    ]);
    controle("les bonnes lignes passent", r5.confirmedIds?.includes(bonne1) === true && r5.confirmedIds?.includes(bonne2) === true);
    controle("la fautive n'est JAMAIS confirmée, et revient en échec", !r5.confirmedIds?.includes(fautive) && r5.echecs?.some((e) => e.clientId === fautive) === true);

    console.log("\n6. LIGNES QUE LE SERVEUR ÉCARTE SANS LES SIGNALER");
    const sansMotif = randomUUID(), modeleInconnu = randomUUID();
    const r6 = await sync(agent, P, [
      { clientId: sansMotif, templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_BOVIN", nonRenseigne: true, updatedAt: new Date().toISOString() },
      { clientId: modeleInconnu, templateCode: "T99", famille: "MATRICE", fieldCode: "X", valeur: 1, nonRenseigne: false, updatedAt: new Date().toISOString() },
    ]);
    const signalees = [sansMotif, modeleInconnu].filter((id) => r6.echecs?.some((e) => e.clientId === id)).length;
    controle(
      "« non renseigné » sans motif, modèle inconnu : signalés à l'appareil",
      signalees === 2,
      `${signalees}/2 signalées`
    );

    console.log("\n7. GROS LOT (une semaine de saisie d'événements)");
    const gros = Array.from({ length: 450 }, (_, i) => ({
      clientId: randomUUID(), templateCode: "T33", famille: "EVENEMENT",
      payload: { activite: "ACTE_CONSULTATION", espece: "ESP_BOVIN", effectif: 1, localite: `L${i}` }, nonRenseigne: false, updatedAt: il(i),
    }));
    const t0 = Date.now();
    const r7 = await sync(agent, P, gros);
    controle("450 lignes en un envoi : toutes confirmées", r7.confirmedIds?.length === 450, `${r7.confirmedIds?.length} en ${Date.now() - t0} ms`);

    console.log("\n8. CLOISONNEMENT ENTRE ARRONDISSEMENTS");
    const idSantchou = randomUUID();
    await sync(daAutre, P, [{ clientId: idSantchou, templateCode: "T32", famille: "EVENEMENT", payload: { maladie: "MAL_PPR", effectifVaccine: 300 }, nonRenseigne: false, updatedAt: il(30) }]);
    // Un appareil de Nkong-Ni renvoie une ligne portant le MÊME identifiant.
    await sync(agent, P, [{ clientId: idSantchou, templateCode: "T32", famille: "EVENEMENT", payload: { maladie: "MAL_PPR", effectifVaccine: 1 }, nonRenseigne: false, updatedAt: new Date().toISOString() }]);
    const ev = await db.saisieEvenement.findFirst({ where: { clientId: idSantchou }, select: { payload: true } });
    controle(
      "un appareil de Nkong-Ni ne peut pas modifier un événement de Santchou",
      (ev?.payload as { effectifVaccine?: number } | null)?.effectifVaccine === 300,
      `effectif de Santchou : ${(ev?.payload as { effectifVaccine?: number } | null)?.effectifVaccine}`
    );
    const rDD = await sync(dd, P, []);
    controle("DD et chefs n'envoient rien par la synchronisation", rDD.status === 403);

    console.log("\n9. RAPPORT SOUMIS ENTRE-TEMPS, PUIS PÉRIODE VERROUILLÉE");
    const rapport = await db.rapportArrondissement.findFirstOrThrow({ where: { periodeId: P, arrondissementId: agent.arrondissementId! } });
    await db.rapportArrondissement.update({ where: { id: rapport.id }, data: { statut: "SOUMIS" } });
    const idApres = randomUUID();
    const r9 = await sync(agent, P, [{ clientId: idApres, templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_BOVIN", valeur: 5, nonRenseigne: false, updatedAt: new Date().toISOString() }]);
    controle("rapport soumis : refus clair, rien d'écrit, rien de confirmé", r9.status === 423 && !r9.confirmedIds && Number((await cellule("T11_CHEPTEL_BOVIN"))?.valeur) === 131, `${r9.status} « ${r9.message} »`);
    await db.rapportArrondissement.update({ where: { id: rapport.id }, data: { statut: "EN_SAISIE" } });
    await db.periodeReporting.update({ where: { id: P }, data: { statut: "VERROUILLEE_DA" } });
    const r10 = await sync(agent, P, [{ clientId: randomUUID(), templateCode: "T11", famille: "MATRICE", fieldCode: "T11_CHEPTEL_BOVIN", valeur: 6, nonRenseigne: false, updatedAt: new Date().toISOString() }]);
    controle("période verrouillée : refus clair, rien de confirmé", r10.status === 423 && !r10.confirmedIds, `${r10.status} « ${r10.message} »`);
  } finally {
    // Remise en état : tout ce qui touche le mois de test disparaît.
    const rapports = await db.rapportArrondissement.findMany({ where: { periodeId: P }, select: { id: true } });
    const ids = rapports.map((r) => r.id);
    await db.saisieMatrice.deleteMany({ where: { rapportId: { in: ids } } });
    await db.saisieNominative.deleteMany({ where: { rapportId: { in: ids } } });
    await db.saisieEvenement.deleteMany({ where: { rapportId: { in: ids } } });
    await db.correction.deleteMany({
      where: { OR: [{ saisieMatrice: { rapportId: { in: ids } } }, { saisieNominative: { rapportId: { in: ids } } }, { saisieEvenement: { rapportId: { in: ids } } }] },
    });
    await db.auditLog.deleteMany({ where: { entiteId: { in: ids } } });
    await db.rapportArrondissement.deleteMany({ where: { periodeId: P } });
    await db.periodeReporting.delete({ where: { id: P } });
  }

  const fautes = resultats.filter((r) => !r.ok);
  console.log(`\n${resultats.length - fautes.length}/${resultats.length} contrôles réussis.`);
  if (fautes.length) console.log("FAUTES :\n" + fautes.map((f) => `  - ${f.intitule}${f.detail ? ` — ${f.detail}` : ""}`).join("\n"));
  await db.$disconnect();
  process.exit(fautes.length ? 1 : 0);
}

principal().catch(async (e) => {
  console.error(e);
  await base.$disconnect();
  process.exit(2);
});

// Épreuve d'étanchéité de l'intervention à distance de l'administrateur
// (lib/intervention.ts), contre le serveur LOCAL. Exigence du Délégué
// (4 novembre 2026) : sa dérogation ne doit jamais faire fuir une donnée d'un
// département à l'autre. À rejouer avant chaque livraison qui touche aux
// sessions, aux permissions ou au cloisonnement.
//
// Jetons : sessions forgées (méthode du CLAUDE.md) de l'administrateur et d'un
// DA de la Menoua. Le DD des Bamboutos doit être actif en local le temps de
// l'épreuve (sinon l'intervention est refusée, faute de DD), et les Bamboutos
// doivent avoir un mois mensuel ouvert avec au moins un rapport transmis
// (sinon les contrôles 3 bis / 3 ter n'éprouvent rien : « mois non précisé »).
//
// Usage : node scripts/verifier-intervention.mjs <jetonAdmin> <jetonDA>
const [jetonAdmin, jetonDA] = process.argv.slice(2);
const BASE = "http://localhost:3000";
const BAM = "dep_bamboutos";
let echecs = 0;
const ok = (cond, texte) => {
  console.log(`${cond ? "✔" : "✖"} ${texte}`);
  if (!cond) echecs++;
};
const appel = async (jeton, chemin, { intervention = null, methode = "GET", corps } = {}) => {
  const cookie = [`next-auth.session-token=${jeton}`, ...(intervention ? [`sid_intervention=${intervention}`] : [])].join("; ");
  const r = await fetch(BASE + chemin, { method: methode, headers: { cookie, ...(corps ? { "Content-Type": "application/json" } : {}) }, body: corps ? JSON.stringify(corps) : undefined });
  let j = null;
  try { j = await r.json(); } catch {}
  return { status: r.status, j };
};

// 1. Un compte ordinaire qui se fabrique le cookie reste chez lui.
const daSans = await appel(jetonDA, "/api/bootstrap");
const daAvec = await appel(jetonDA, "/api/bootstrap", { intervention: BAM });
ok(daAvec.j?.meta?.arrondissementNom === daSans.j?.meta?.arrondissementNom && daAvec.j?.meta?.username === daSans.j?.meta?.username,
  `DA avec un faux cookie : toujours ${daSans.j?.meta?.username} / ${daSans.j?.meta?.arrondissementNom}`);
const etabsDA = daAvec.j?.etablissements ?? [];
ok(etabsDA.every((e) => e.arrondissementId === etabsDA[0]?.arrondissementId), `DA avec un faux cookie : ${etabsDA.length} établissement(s), tous de son arrondissement`);

// 2. L'administrateur chez lui.
const chezMoi = await appel(jetonAdmin, "/api/bootstrap");
const idsMenoua = new Set((chezMoi.j?.etablissements ?? []).map((e) => e.id));

// 3. L'administrateur dans les Bamboutos : il ne voit QUE les Bamboutos.
const dedans = await appel(jetonAdmin, "/api/bootstrap", { intervention: BAM });
ok(dedans.status === 200 && dedans.j?.meta?.username === "dd.bamboutos", `en intervention : la session agit comme ${dedans.j?.meta?.username}`);
const etabsBam = dedans.j?.etablissements ?? [];
ok(etabsBam.every((e) => !idsMenoua.has(e.id)), `en intervention : aucun des ${idsMenoua.size} établissements de la Menoua n'est visible (${etabsBam.length} des Bamboutos)`);
const czv = (dedans.j?.referentiels ?? []).filter((r) => r.categorie === "CZV").map((r) => r.libelle);
ok(czv.length === 9 && czv.every((n) => !/Dschang|Fokoué|Santchou/.test(n)), `en intervention : les 9 CZV des Bamboutos seulement (${czv.slice(0, 3).join(", ")}…)`);
const liste = await appel(jetonAdmin, "/api/etablissements/liste?typeCode=TOUS", { intervention: BAM });
ok(liste.status === 200 && (liste.j?.lignes ?? []).every((l) => ["Babadjou", "Batcham", "Galim", "Mbouda"].includes(l.arrondissement)), `liste des acteurs en intervention : ${liste.j?.lignes?.length ?? "?"} ligne(s), toutes des Bamboutos`);

// 3 bis (6 novembre 2026). Le chef qui complète une ferme oubliée : le registre
// des fermes (vue croisée 1.4) en intervention ne montre rien de la Menoua, et
// une ferme de la Menoua ne se remplit pas depuis les Bamboutos.
const periodeBam = dedans.j?.periode?.id;
if (periodeBam) {
  const vue14 = await appel(jetonAdmin, `/api/section/vue-croisee/T14?periodeId=${periodeBam}`, { intervention: BAM });
  const reg = vue14.j?.registre ?? [];
  ok(vue14.status === 200 && reg.every((e) => !idsMenoua.has(e.id)), `registre des fermes (1.4) en intervention : ${reg.length} ferme(s), aucune de la Menoua`);
} else {
  ok(false, "registre des fermes (1.4) en intervention : pas de mois en cours dans les Bamboutos pour l'épreuve");
}
const fermeMenoua = (chezMoi.j?.etablissements ?? []).find((e) => e.typeCode === "ETAB_FERME_PONTE");
if (fermeMenoua) {
  const remplir = await appel(jetonAdmin, "/api/section/saisie-manquante", {
    intervention: BAM, methode: "POST",
    corps: { templateCode: "T14", periodeId: periodeBam, arrondissementId: fermeMenoua.arrondissementId, etablissementId: fermeMenoua.id, fieldCode: "T14_PONDEUSES_DEBUT", valeur: "1", motif: "épreuve d'étanchéité" },
  });
  ok(remplir.status >= 400 && remplir.status < 500, `remplir, depuis les Bamboutos, une ferme de la Menoua : refusé (${remplir.status} ${remplir.j?.message ?? ""})`);
}
// 3 ter (7 novembre 2026). Le chef inscrit une ferme absente du registre :
// jamais dans un arrondissement d'un autre département.
const arrMenouaFerme = (chezMoi.j?.etablissements ?? [])[0]?.arrondissementId;
const inscrire = await appel(jetonAdmin, "/api/section/etablissement-oublie", {
  intervention: BAM, methode: "POST",
  corps: { templateCode: "T14", periodeId: periodeBam, arrondissementId: arrMenouaFerme, nom: "INTRUS ETANCHEITE", localite: "X", motif: "épreuve d'étanchéité" },
});
ok(inscrire.status === 403, `inscrire, depuis les Bamboutos, une ferme dans un arrondissement de la Menoua : refusé (${inscrire.status} ${inscrire.j?.message ?? ""})`);
// 3 quater (12 novembre 2026). L'import d'un répertoire : jamais dans un arrondissement d'un autre département.
const importer = await appel(jetonAdmin, "/api/etablissements/repertoire", {
  intervention: BAM, methode: "POST",
  corps: { arrondissementId: arrMenouaFerme, fichier: "épreuve", lignes: [{ typeCode: "ETAB_BOVINS", nom: "INTRUS ETANCHEITE", village: null, especes: [], fiche: null }] },
});
ok(importer.status === 403, `importer, depuis les Bamboutos, un répertoire dans un arrondissement de la Menoua : refusé (${importer.status} ${importer.j?.message ?? ""})`);

// 4. Écrire dans un arrondissement de la Menoua depuis les Bamboutos : refusé.
const arrMenoua = (chezMoi.j?.etablissements ?? [])[0]?.arrondissementId;
const intrus = await appel(jetonAdmin, "/api/etablissements", { intervention: BAM, methode: "POST", corps: { typeCode: "ETAB_COUVOIR", nom: "INTRUS ETANCHEITE", localite: "X", arrondissementId: arrMenoua } });
ok(intrus.status === 403, `créer, depuis les Bamboutos, un établissement dans un arrondissement de la Menoua : refusé (${intrus.status} ${intrus.j?.message ?? ""})`);

// 4 bis. Écrire dans les Bamboutos : la ligne y reste, et porte le vrai auteur au journal.
const arrBam = (dedans.j?.referentiels ?? []).find((r) => r.categorie === "CZV")?.parent;
const cree = await appel(jetonAdmin, "/api/etablissements", { intervention: BAM, methode: "POST", corps: { typeCode: "ETAB_COUVOIR", nom: "ESSAI ETANCHEITE", localite: "Essai", arrondissementId: arrBam } });
ok(cree.status === 201, `créer un établissement dans les Bamboutos pendant l'intervention : accepté (${cree.status})`);
const idCree = cree.j?.etablissement?.id;
const journal = await appel(jetonAdmin, "/api/technique/audit?page=1", { intervention: BAM });
const ligne = (journal.j?.entrees ?? journal.j?.logs ?? journal.j?.lignes ?? []).find((l) => l.entiteId === idCree);
ok(ligne?.details?.intervention?.administrateur === "dd.menoua", `journal des Bamboutos : la création porte « fait par l'administrateur dd.menoua »`);
const vuDeLaMenoua = await appel(jetonAdmin, "/api/bootstrap");
ok(!(vuDeLaMenoua.j?.etablissements ?? []).some((e) => e.id === idCree), `cet établissement des Bamboutos est invisible depuis la Menoua`);
const journalMenoua = await appel(jetonAdmin, "/api/technique/audit?page=1");
ok(!JSON.stringify(journalMenoua.j ?? {}).includes(idCree ?? "@@"), `et absent du journal de la Menoua`);
const suppr = await appel(jetonAdmin, `/api/etablissements/${idCree}`, { intervention: BAM, methode: "DELETE" });
ok(suppr.status === 200, `essai supprimé (${suppr.status})`);

// 5. L'administration du système est fermée pendant l'intervention.
const admin = await appel(jetonAdmin, "/api/admin-systeme/departements", { intervention: BAM });
ok(admin.status === 403, `administration du système pendant l'intervention : fermée (${admin.status})`);

// 6. Retour : de nouveau la Menoua, rien des Bamboutos.
const retour = await appel(jetonAdmin, "/api/bootstrap");
const idsBam = new Set(etabsBam.map((e) => e.id));
ok(retour.j?.meta?.username === chezMoi.j?.meta?.username && (retour.j?.etablissements ?? []).every((e) => !idsBam.has(e.id)), `retour chez soi : ${retour.j?.meta?.username}, aucun établissement des Bamboutos`);

console.log(echecs ? `\n${echecs} ÉCHEC(S)` : "\nÉtanchéité vérifiée : aucun échec.");
process.exit(echecs ? 1 : 0);

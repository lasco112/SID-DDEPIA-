/**
 * PROTOCOLE DE VÉRIFICATION — rôles, cloisonnement, circuit, rapports.
 *
 * Exerce l'application QUI TOURNE (localhost:3000), rôle par rôle, avec des
 * sessions forgées (next-auth/jwt + NEXTAUTH_SECRET) : aucun mot de passe
 * n'est saisi. Chaque contrôle éprouve le SUCCÈS et le REFUS. Les données
 * créées sont supprimées à la fin.
 *
 *   A. Accès — chaque rôle n'atteint que ses routes.
 *   B. Cloisonnement — un DA ne voit ni n'écrit que son arrondissement ; le
 *      rapport d'un DA ne porte que ses données, celui du DD tout le département.
 *   C. Circuit trimestriel — agent → DA (transmet) → chefs (valident) → DD
 *      (définitif), verrous et renvoi.
 *   D. Mensuel — génération DA et DD, droits inchangés.
 *
 *   node --env-file=.env --import tsx scripts/verifier-protocole.ts
 *
 * LOCAL SEULEMENT : cette base n'est pas la production.
 */
import { encode } from "next-auth/jwt";
import PizZip from "pizzip";
import { base } from "../src/lib/baseDeTravail";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const ANNEE = 2026;
const TRIMESTRE = 3;
const DEBUT = new Date();

type Compte = { id: string; username: string; role: string; arrondissement: string | null };
const resultats: { bloc: string; intitule: string; ok: boolean; detail?: string }[] = [];
let blocCourant = "";

function controle(intitule: string, ok: boolean, detail?: string) {
  resultats.push({ bloc: blocCourant, intitule, ok, detail });
  console.log(`${ok ? "  ok     " : "  FAUTE  "} ${intitule}${detail ? ` — ${detail}` : ""}`);
}
function bloc(titre: string) {
  blocCourant = titre;
  console.log(`\n${titre}`);
}

async function cookie(u: Compte) {
  const jeton = await encode({ token: { sub: u.id, id: u.id, name: u.username, role: u.role }, secret: process.env.NEXTAUTH_SECRET! });
  return `next-auth.session-token=${jeton}`;
}

async function appel(u: Compte, methode: string, chemin: string, corps?: unknown) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { Cookie: await cookie(u), "Content-Type": "application/json" },
    body: corps == null ? undefined : JSON.stringify(corps),
    redirect: "manual",
  });
  const type = r.headers.get("Content-Type") ?? "";
  const json = type.includes("json") ? await r.json().catch(() => null) : null;
  const buffer = type.includes("officedocument") ? Buffer.from(await r.arrayBuffer()) : null;
  return { status: r.status, json, buffer, fichier: r.headers.get("Content-Disposition") ?? "" };
}

const texteDocx = (b: Buffer) =>
  new PizZip(b).file("word/document.xml")!.asText().replace(/<[^>]+>/g, " ").replace(/&apos;/g, "’").replace(/\s+/g, " ");
const tableauxDocx = (b: Buffer) =>
  (new PizZip(b).file("word/document.xml")!.asText().match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function principal() {
  const db = base;
  const comptes = (
    await db.user.findMany({
      where: { actif: true },
      select: { id: true, username: true, role: true, arrondissement: { select: { nom: true, id: true } } },
    })
  ).map((u) => ({ id: u.id, username: u.username, role: u.role, arrondissement: u.arrondissement?.nom ?? null, arrId: u.arrondissement?.id ?? null }));
  const un = (role: string, arr?: string) => {
    const c = comptes.find((x) => x.role === role && (!arr || x.arrondissement === arr));
    if (!c) throw new Error(`Compte ${role} ${arr ?? ""} introuvable`);
    return c;
  };
  const DD = un("DD");
  const DA_DSC = un("DA", "Dschang");
  const DA_NKN = un("DA", "Nkong-Ni");
  const AGENT_NKN = un("AGENT_SAISIE", "Nkong-Ni");
  const CHEFS = ["CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"].map((r) => un(r));
  const [CHEF_BAC, CHEF_PSA, , CHEF_SSV] = CHEFS;
  const arrondissements = await db.arrondissement.findMany({ select: { id: true, nom: true } });
  const idDe = (nom: string) => arrondissements.find((a) => a.nom === nom)!.id;
  const P = { annee: ANNEE, trimestre: TRIMESTRE };
  const q = `annee=${ANNEE}&trimestre=${TRIMESTRE}`;

  // État de départ du circuit : il doit être vierge pour que le protocole soit probant.
  const periode = await db.periodeReporting.findFirst({ where: { type: "TRIMESTRIEL", annee: ANNEE, trimestre: TRIMESTRE }, select: { id: true } });
  if (periode && (await db.circuitTrimestre.count({ where: { periodeId: periode.id } })) > 0) {
    throw new Error("Le circuit du T3 2026 n'est pas vierge : le protocole ne peut pas être probant.");
  }

  // =================================================================== A
  bloc("A. ACCÈS — chaque rôle n'atteint que ses routes");
  controle("DA refusé sur le rapport départemental (/api/dd/trimestre)", (await appel(DA_DSC, "GET", `/api/dd/trimestre?${q}`)).status === 403);
  controle("agent refusé sur la génération du rapport DA", (await appel(AGENT_NKN, "POST", "/api/da/trimestre", { ...P, apercu: true })).status === 403);
  controle("chef de section refusé sur la saisie trimestrielle (sauf BAC)", (await appel(CHEF_PSA, "GET", `/api/trimestre/saisie?${q}`)).status === 403);
  controle("chef BAC admis sur la saisie trimestrielle", (await appel(CHEF_BAC, "GET", `/api/trimestre/saisie?${q}`)).status === 200);
  for (const u of [DD, DA_DSC, AGENT_NKN, ...CHEFS]) {
    const a = await appel(u, "GET", `/api/trimestre/analyses?${q}`);
    const t = await appel(u, "GET", `/api/trimestre/rubriques?${q}`);
    const c = await appel(u, "GET", `/api/trimestre/circuit?${q}`);
    controle(`${u.username} : analyses, textes et circuit accessibles`, a.status === 200 && t.status === 200 && c.status === 200, `${a.status}/${t.status}/${c.status}`);
  }
  controle("agent : ne peut PAS transmettre (comme au mensuel)", (await appel(AGENT_NKN, "POST", "/api/trimestre/circuit", { ...P, action: "transmettre" })).status === 403);
  controle("DA : ne peut PAS valider un domaine", (await appel(DA_DSC, "POST", "/api/trimestre/circuit", { ...P, action: "valider" })).status === 403);
  controle("chef : ne peut PAS transmettre", (await appel(CHEF_PSA, "POST", "/api/trimestre/circuit", { ...P, action: "transmettre" })).status === 403);
  controle("DA : ne peut PAS renvoyer un rapport", (await appel(DA_DSC, "POST", "/api/trimestre/circuit", { ...P, action: "renvoyer", arrondissementId: idDe("Fokoué"), motif: "x" })).status === 403);

  // =================================================================== B
  bloc("B. CLOISONNEMENT — DA et DD ne se mélangent pas");
  const g14 = (await appel(DA_DSC, "GET", `/api/trimestre/saisie?${q}&tableau=14`)).json;
  const territoires = g14?.grille?.lignes.map((l: { libelle: string }) => l.libelle).filter((l: string) => !/^TOTAL|^ÉCART/.test(l));
  controle("grille du DA de Dschang : sa seule ligne", JSON.stringify(territoires) === '["Dschang"]', JSON.stringify(territoires));
  const totalDsc = g14?.grille?.lignes.find((l: { libelle: string }) => l.libelle === "TOTAL T3 2026")?.cases.find((c: { colonne: string }) => c.colonne === "TOTAL T3 2026")?.affiche;
  const ligneDsc = g14?.grille?.lignes.find((l: { libelle: string }) => l.libelle === "Dschang")?.cases.find((c: { colonne: string }) => c.colonne === "TOTAL T3 2026")?.affiche;
  controle("grille du DA : la ligne TOTAL est la sienne, pas celle du département", totalDsc === ligneDsc, `${totalDsc} / ${ligneDsc}`);
  const put = await appel(DA_DSC, "PUT", "/api/trimestre/saisie", { ...P, numeroTableau: 14, ligne: "Fokoué", colonne: "Taurillon", valeur: 1 });
  controle("DA de Dschang : écrire dans la ligne de Fokoué est refusé", put.status === 403, String(put.status));
  const lAgent = (await appel(AGENT_NKN, "GET", `/api/trimestre/saisie?${q}`)).json;
  controle("agent de Nkong-Ni : son arrondissement, et lui seul", lAgent?.arrondissement === "Nkong-Ni", lAgent?.arrondissement);

  const anDsc = (await appel(DA_DSC, "GET", `/api/trimestre/analyses?${q}`)).json;
  const anDD = (await appel(DD, "GET", `/api/trimestre/analyses?${q}`)).json;
  const t14 = (e: { analyses: { numero: number; propose: string }[] }) => e?.analyses.find((a) => a.numero === 14)?.propose ?? "";
  controle("analyses du DA : portée de son arrondissement", anDsc?.portee === "l’arrondissement de Dschang", anDsc?.portee);
  controle("analyses du DA : ses chiffres (cheptel ≠ département)", t14(anDsc) !== t14(anDD) && t14(anDsc).length > 0);
  controle("analyses du DA : ne nomment aucun autre arrondissement", !/Fokoué|Santchou|Nkong-Ni|Penka-Michel|Fongo-Tongo/.test(anDsc?.analyses.map((a: { propose: string }) => a.propose).join(" ")));
  const anSSV = (await appel(CHEF_SSV, "GET", `/api/trimestre/analyses?${q}`)).json;
  controle("analyses du chef SSV : son seul domaine (santé animale)", anSSV?.analyses.every((a: { section: string }) => /SANT|IV/i.test(a.section)) && anSSV.analyses.length > 0, `${anSSV?.analyses.length} tableaux`);

  const txPSA = (await appel(CHEF_PSA, "GET", `/api/trimestre/rubriques?${q}`)).json;
  controle(
    "textes du chef PSA : productions animales et conclusion, rien d'autre",
    txPSA?.zones.every((z: { sectionCle: string; cle: string }) => /^II/.test(z.sectionCle) || z.cle === "conclusion") &&
      txPSA.zones.some((z: { cle: string }) => z.cle === "conclusion"),
    `${txPSA?.zones.length} zones`
  );
  const txAgent = (await appel(AGENT_NKN, "GET", `/api/trimestre/rubriques?${q}`)).json;
  controle("textes de l'agent : ceux de son arrondissement", txAgent?.pour === "arrondissement");
  const conclusionAgent = txAgent?.zones.find((z: { cle: string }) => z.cle === "conclusion")?.automatique ?? "";
  controle("conclusion de l'agent : rédigée automatiquement, pour la DAEPIA de Nkong-Ni", /DAEPIA de Nkong-Ni/.test(conclusionAgent));

  // Un texte écrit par le DA : dans SON rapport, jamais dans celui du DD.
  const MARQUE = "TEXTE-DE-VERIFICATION-DSCHANG";
  await appel(DA_DSC, "PUT", "/api/trimestre/rubriques", { ...P, cle: "II2.animation", contenu: MARQUE });
  const docDsc = await appel(DA_DSC, "POST", "/api/da/trimestre", { ...P, apercu: true, arrondissement: "Fokoué" });
  controle("DA de Dschang demandant le rapport de Fokoué : il reçoit le sien", /Dschang/.test(docDsc.fichier) && !/Fokou/.test(docDsc.fichier), docDsc.fichier.replace(/.*filename="|"/g, ""));
  controle("rapport DA : porte le texte de son DA", docDsc.buffer != null && texteDocx(docDsc.buffer).includes(MARQUE));
  const tabDsc = docDsc.buffer ? tableauxDocx(docDsc.buffer) : "";
  controle("rapport DA : aucun autre arrondissement dans ses tableaux", !/ (Fokoué|Santchou|Nkong-Ni|Penka-Michel|Fongo-Tongo) /.test(tabDsc));
  const docDD = await appel(DD, "POST", "/api/dd/trimestre", { ...P, apercu: true });
  const texteDD = docDD.buffer ? texteDocx(docDD.buffer) : "";
  controle("rapport DD : ne porte PAS le texte d'un DA", docDD.status === 200 && !texteDD.includes(MARQUE), String(docDD.status));
  controle("rapport DD : les six arrondissements dans ses tableaux", ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"].every((a) => (docDD.buffer ? tableauxDocx(docDD.buffer) : "").includes(a)));
  controle("aperçu DD avant la fin du circuit : marqué PROVISOIRE", texteDD.includes("DOCUMENT PROVISOIRE") && /BROUILLON/.test(docDD.fichier));
  await appel(DA_DSC, "PUT", "/api/trimestre/rubriques", { ...P, cle: "II2.animation", contenu: "" });

  // =================================================================== C
  bloc("C. CIRCUIT — agent → DA → chefs de section → DD");
  const defDD0 = await appel(DD, "POST", "/api/dd/trimestre", { ...P, apercu: false });
  controle("DD : version définitive refusée tant que le circuit n'est pas achevé", defDD0.status === 409, defDD0.json?.message);
  const defDA0 = await appel(DA_NKN, "POST", "/api/da/trimestre", { ...P, apercu: false });
  controle("DA : version définitive refusée avant transmission", defDA0.status === 409);
  const valTot = await appel(CHEF_PSA, "POST", "/api/trimestre/circuit", { ...P, action: "valider" });
  controle("chef PSA : validation refusée tant que les six n'ont pas transmis", valTot.status === 409, valTot.json?.message);

  const tr = await appel(DA_NKN, "POST", "/api/trimestre/circuit", { ...P, action: "transmettre" });
  controle("DA de Nkong-Ni : transmet son rapport", tr.status === 200);
  controle("DA : transmettre deux fois est refusé", (await appel(DA_NKN, "POST", "/api/trimestre/circuit", { ...P, action: "transmettre" })).status === 409);
  const lockSaisie = await appel(AGENT_NKN, "PUT", "/api/trimestre/saisie", { ...P, numeroTableau: 14, ligne: "Nkong-Ni", colonne: "Taurillon", valeur: 3 });
  controle("agent : après transmission, la saisie est figée", lockSaisie.status === 409, lockSaisie.json?.message);
  controle("agent : après transmission, les textes sont figés", (await appel(AGENT_NKN, "PUT", "/api/trimestre/rubriques", { ...P, cle: "II2.animation", contenu: "x" })).status === 409);
  controle("DA : après transmission, ses analyses sont figées", (await appel(DA_NKN, "PUT", "/api/trimestre/analyses", { ...P, numeroTableau: 14 })).status === 409);
  const defDA1 = await appel(DA_NKN, "POST", "/api/da/trimestre", { ...P, apercu: false });
  controle("DA : version définitive après transmission", defDA1.status === 200 && !/BROUILLON/.test(defDA1.fichier), defDA1.fichier.replace(/.*filename="|"/g, ""));
  const vueAgent = (await appel(AGENT_NKN, "GET", `/api/trimestre/circuit?${q}`)).json;
  controle("agent : voit son rapport « transmis », et lui seul", vueAgent?.arrondissements.length === 1 && vueAgent.arrondissements[0].statut === "TRANSMIS");

  // Les cinq autres transmettent.
  for (const nom of ["Dschang", "Fokoué", "Fongo-Tongo", "Penka-Michel", "Santchou"]) {
    const r = await appel(un("DA", nom), "POST", "/api/trimestre/circuit", { ...P, action: "transmettre" });
    controle(`DA de ${nom} : transmet`, r.status === 200);
  }
  for (const chef of CHEFS) {
    const r = await appel(chef, "POST", "/api/trimestre/circuit", { ...P, action: "valider" });
    controle(`${chef.role} : valide son domaine`, r.status === 200, r.json?.message);
  }
  controle("chef PSA : après validation, la conclusion est figée", (await appel(CHEF_PSA, "PUT", "/api/trimestre/rubriques", { ...P, cle: "conclusion", contenu: "x" })).status === 409);
  controle("chef BAC : après validation, les tableaux du BAC sont figés", (await appel(CHEF_BAC, "PUT", "/api/trimestre/saisie", { ...P, numeroTableau: 13, ligne: "JUILLET", colonne: "DDEPIA", valeur: 1 })).status === 409);
  controle("DD : garde la main (écriture permise après le circuit)", (await appel(DD, "PUT", "/api/trimestre/rubriques", { ...P, cle: "IV7.autres", contenu: "" })).status === 200);
  const etatDD = (await appel(DD, "GET", `/api/trimestre/circuit?${q}`)).json;
  controle("DD : circuit achevé", etatDD?.complet === true);
  const defDD1 = await appel(DD, "POST", "/api/dd/trimestre", { ...P, apercu: false });
  controle("DD : version définitive produite", defDD1.status === 200 && !/BROUILLON/.test(defDD1.fichier) && !texteDocx(defDD1.buffer!).includes("DOCUMENT PROVISOIRE"), defDD1.fichier.replace(/.*filename="|"/g, ""));

  controle("renvoi sans motif refusé", (await appel(CHEF_SSV, "POST", "/api/trimestre/circuit", { ...P, action: "renvoyer", arrondissementId: idDe("Dschang"), motif: " " })).status === 409);
  const rv = await appel(CHEF_SSV, "POST", "/api/trimestre/circuit", { ...P, action: "renvoyer", arrondissementId: idDe("Dschang"), motif: "Vaccinations à revoir." });
  controle("chef SSV : renvoie le rapport de Dschang, motif à l'appui", rv.status === 200);
  const vueDsc = (await appel(DA_DSC, "GET", `/api/trimestre/circuit?${q}`)).json;
  controle("DA de Dschang : voit le renvoi et son motif", vueDsc?.arrondissements[0]?.statut === "RENVOYE" && vueDsc.arrondissements[0].motif === "Vaccinations à revoir.");
  controle("renvoi : les validations de section tombent", vueDsc?.sections.every((s: { statut: string }) => s.statut !== "VALIDE"));
  controle("DA de Dschang : peut de nouveau écrire", (await appel(DA_DSC, "PUT", "/api/trimestre/rubriques", { ...P, cle: "II2.animation", contenu: "" })).status === 200);
  controle("DD : définitif de nouveau refusé", (await appel(DD, "POST", "/api/dd/trimestre", { ...P, apercu: false })).status === 409);

  // =================================================================== D
  bloc("D. MENSUEL — génération et droits inchangés");
  const mois = await db.periodeReporting.findFirst({ where: { type: "MENSUEL", statut: "VALIDEE_DD" }, orderBy: [{ annee: "desc" }, { mois: "desc" }], select: { id: true, annee: true, mois: true } });
  if (mois) {
    const daM = await appel(DA_DSC, "POST", "/api/reports/generate", { periodeId: mois.id, type: "DA" });
    controle(`mensuel ${mois.mois}/${mois.annee} : le DA de Dschang génère SON rapport`, daM.status === 200 && /Dschang/.test(daM.fichier), `${daM.status} ${daM.json?.message ?? ""}`);
    controle("mensuel : le DA ne peut pas générer le rapport départemental", (await appel(DA_DSC, "POST", "/api/reports/generate", { periodeId: mois.id, type: "DD" })).status === 403);
    const ddM = await appel(DD, "POST", "/api/reports/generate", { periodeId: mois.id, type: "APERCU" });
    controle("mensuel : le DD produit l'aperçu départemental", ddM.status === 200, `${ddM.status} ${ddM.json?.message ?? ""}`);
  } else {
    controle("mensuel : aucun mois validé en base locale", false, "NON VÉRIFIÉ");
  }
  // Le circuit mensuel : l'agent ne soumet jamais, le DA ne valide jamais une section.
  const moisOuvert = await db.periodeReporting.findFirst({ where: { type: "MENSUEL" }, orderBy: [{ annee: "desc" }, { mois: "desc" }], select: { id: true } });
  controle("mensuel : l'agent ne peut pas soumettre le rapport", (await appel(AGENT_NKN, "POST", "/api/rapports/submit", { periodeId: moisOuvert?.id })).status === 403);
  controle("mensuel : le DA ne peut pas valider une section", (await appel(DA_DSC, "POST", "/api/validations", { periodeId: moisOuvert?.id })).status === 403);
  controle("mensuel : un chef ne peut pas produire le rapport départemental", (await appel(CHEF_PSA, "POST", "/api/reports/generate", { periodeId: moisOuvert?.id, type: "DD" })).status === 403);

  // =================================================================== remise en état
  const pid = (await db.periodeReporting.findFirst({ where: { type: "TRIMESTRIEL", annee: ANNEE, trimestre: TRIMESTRE }, select: { id: true } }))!.id;
  await db.circuitTrimestre.deleteMany({ where: { periodeId: pid } });
  await db.exportDocument.deleteMany({ where: { createdAt: { gte: DEBUT } } });

  const fautes = resultats.filter((r) => !r.ok);
  console.log(`\n${resultats.length - fautes.length}/${resultats.length} contrôles réussis.`);
  if (fautes.length) console.log("FAUTES :\n" + fautes.map((f) => `  - [${f.bloc.slice(0, 2)}] ${f.intitule}${f.detail ? ` — ${f.detail}` : ""}`).join("\n"));
  await db.$disconnect();
  process.exit(fautes.length ? 1 : 0);
}

principal().catch(async (e) => {
  console.error(e);
  await base.$disconnect();
  process.exit(2);
});

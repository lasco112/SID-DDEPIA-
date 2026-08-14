/**
 * Éprouve la chaîne complète des rubriques narratives, sur l'application qui
 * tourne : écrire une zone, la retrouver dans le .docx produit, et vérifier
 * qu'un DA n'écrit jamais dans les rubriques du département.
 *
 * Tout ce qui est créé est ensuite retiré : la base locale sert aussi aux
 * démonstrations.
 *
 *   node --env-file=.env --import tsx scripts/verifier-rubriques.ts
 */
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";
import PizZip from "pizzip";
import { trimestrielle } from "../src/server/periodes/calendrier";
import { genererRapportCanevas } from "../src/server/trimestre/rapportCanevas";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const P = { annee: 2026, trimestre: 3 };
const MARQUE = "Contrôle automatique — ce texte doit ressortir dans le document produit.";

async function cookie(u: { id: string; username: string; role: string; arrondissementId: string | null }) {
  const jeton = await encode({
    token: {
      sub: u.id, id: u.id, name: u.username, role: u.role,
      arrondissementId: u.arrondissementId, sectionId: null,
      mustChangePassword: false, isDemo: false,
    },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  return `next-auth.session-token=${jeton}`;
}

const texteDu = (b: Buffer) =>
  new PizZip(b).file("word/document.xml")!.asText()
    .replace(/<[^>]+>/g, " ").replace(/&apos;/g, "’").replace(/\s+/g, " ");

const dire = (quoi: string, ok: boolean) => console.log(`  ${ok ? "ok    " : "FAUTE "}  ${quoi}`);

async function principal() {
  const db = new PrismaClient();
  const dd = await db.user.findFirst({
    where: { role: "DD" },
    select: { id: true, username: true, role: true, arrondissementId: true },
  });
  const da = await db.user.findFirst({
    where: { role: "DA", arrondissementId: { not: null } },
    select: { id: true, username: true, role: true, arrondissementId: true, arrondissement: { select: { nom: true } } },
  });
  if (!dd || !da) throw new Error("Il faut un compte DD et un compte DA.");

  const enteteDD = { Cookie: await cookie(dd), "Content-Type": "application/json" };
  const enteteDA = { Cookie: await cookie(da), "Content-Type": "application/json" };

  // 1. L'inventaire des zones.
  const g = await fetch(`${BASE}/api/trimestre/rubriques?annee=${P.annee}&trimestre=${P.trimestre}`, { headers: enteteDD });
  const inv = await g.json();
  console.log(`GET ${g.status} — ${inv.total} zones, ${inv.redigees} rédigées, pour « ${inv.pour} »`);
  dire("le canevas expose bien ses zones", inv.total > 40);
  dire("le DD écrit pour le département", inv.pour === "departement");

  // 2. Le DD écrit une zone.
  const cle = "I4.performances";
  const w = await fetch(`${BASE}/api/trimestre/rubriques`, {
    method: "PUT", headers: enteteDD, body: JSON.stringify({ ...P, cle, contenu: MARQUE }),
  });
  dire(`écriture de « ${cle} » acceptée`, w.status === 200);

  // 3. Le texte doit ressortir dans le document du DD, et PAS dans celui du DA.
  const p = trimestrielle(P.annee, P.trimestre);
  const rDD = await genererRapportCanevas(db, p, { autoriserIncomplet: true });
  const rDA = await genererRapportCanevas(db, p, { autoriserIncomplet: true, arrondissement: da.arrondissement!.nom });
  dire("le texte ressort dans le rapport du DD", texteDu(rDD.buffer).includes(MARQUE));
  dire("il ne fuit PAS dans le rapport du DA", !texteDu(rDA.buffer).includes(MARQUE));

  // 4. Une zone inconnue est refusée, pas créée en silence.
  const faux = await fetch(`${BASE}/api/trimestre/rubriques`, {
    method: "PUT", headers: enteteDD, body: JSON.stringify({ ...P, cle: "zone.inventee", contenu: "x" }),
  });
  dire("une zone inconnue du canevas est refusée", faux.status === 400);

  // 5. Le DA écrit : sa rubrique doit être la SIENNE, pas celle du département.
  const wda = await fetch(`${BASE}/api/trimestre/rubriques`, {
    method: "PUT", headers: enteteDA, body: JSON.stringify({ ...P, cle, contenu: "Texte du DA." }),
  });
  const periode = await db.periodeReporting.findFirst({ where: { type: "TRIMESTRIEL", annee: P.annee, trimestre: P.trimestre } });
  const sienne = await db.rubriqueNarrative.findFirst({ where: { periodeId: periode!.id, arrondissementId: da.arrondissementId, cle } });
  const celleDD = await db.rubriqueNarrative.findFirst({ where: { periodeId: periode!.id, arrondissementId: null, cle } });
  dire("l’écriture du DA est acceptée", wda.status === 200);
  dire("elle est rangée sous SON arrondissement", sienne?.contenu === "Texte du DA.");
  dire("celle du département est intacte", celleDD?.contenu === MARQUE);

  // 6. Effacer remet la consigne.
  await fetch(`${BASE}/api/trimestre/rubriques`, {
    method: "PUT", headers: enteteDD, body: JSON.stringify({ ...P, cle, contenu: "   " }),
  });
  const apres = await db.rubriqueNarrative.count({ where: { periodeId: periode!.id, arrondissementId: null, cle } });
  dire("un contenu vide efface la rubrique", apres === 0);

  // Remise en état.
  const supprimees = await db.rubriqueNarrative.deleteMany({ where: { periodeId: periode!.id } });
  const audits = await db.auditLog.deleteMany({
    where: { action: { in: ["REDACTION_RUBRIQUE_TRIMESTRIELLE", "EFFACEMENT_RUBRIQUE_TRIMESTRIELLE"] } },
  });
  await db.periodeReporting.delete({ where: { id: periode!.id } });
  console.log(
    `\nRemise en état : ${supprimees.count} rubrique(s), ${audits.count} ligne(s) d’audit, ` +
      `1 période trimestrielle — supprimées.`
  );

  await db.$disconnect();
}

principal().catch((e) => { console.error(e); process.exit(1); });

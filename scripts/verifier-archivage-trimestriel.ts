/**
 * Éprouve l'historisation et le versionnage des rapports trimestriels sur
 * l'application qui tourne : le document produit est-il conservé, numéroté,
 * et un DA retrouve-t-il le sien sans voir celui d'un autre ?
 *
 * Tout ce qui est créé est ensuite retiré.
 *
 *   node --env-file=.env --import tsx scripts/verifier-archivage-trimestriel.ts
 */
import { encode } from "next-auth/jwt";
import { base } from "../src/lib/baseDeTravail";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const P = { annee: 2026, trimestre: 3 };

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

const dire = (quoi: string, ok: boolean) => console.log(`  ${ok ? "ok    " : "FAUTE "}  ${quoi}`);

async function principal() {
  const db = base;
  const dd = await db.user.findFirst({
    where: { role: "DD" }, select: { id: true, username: true, role: true, arrondissementId: true },
  });
  const das = await db.user.findMany({
    where: { role: "DA", arrondissementId: { not: null } },
    select: { id: true, username: true, role: true, arrondissementId: true, arrondissement: { select: { nom: true } } },
    take: 2,
  });
  if (!dd || das.length < 2) throw new Error("Il faut un DD et deux DA.");
  const [moi, autre] = das;

  const post = (entete: string, brouillon = false) =>
    fetch(`${BASE}/api/dd/trimestre`, {
      method: "POST",
      headers: { Cookie: entete, "Content-Type": "application/json" },
      body: JSON.stringify({ ...P, apercu: brouillon }),
    });

  const enteteDD = await cookie(dd);

  // 1. Deux générations successives du rapport départemental.
  const a = await post(enteteDD);
  const b = await post(enteteDD);
  dire("les deux générations aboutissent", a.status === 200 && b.status === 200);

  const periode = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: P.annee, trimestre: P.trimestre },
  });
  dire("la période trimestrielle est matérialisée", Boolean(periode));

  const versions = await db.exportDocument.findMany({
    where: { periodeId: periode!.id, type: "RAPPORT_TRIMESTRIEL_DD_DOCX" },
    orderBy: { version: "asc" },
    select: { version: true, hashSha256: true, contenu: true, cheminFichier: true },
  });
  dire("deux versions conservées, numérotées 1 puis 2", versions.map((v) => v.version).join(",") === "1,2");
  dire("le document lui-même est en base", versions.every((v) => (v.contenu?.length ?? 0) > 20000));
  dire("chaque version porte son empreinte", versions.every((v) => v.hashSha256?.length === 64));

  /*
   * 2. Un brouillon ne doit PAS être conservé.
   *
   * Attention au piège : sur une période COMPLÈTE, demander un aperçu produit
   * le document définitif — il n'y a pas de brouillon. Le seul vrai brouillon
   * est celui d'une période incomplète, et c'est lui qu'on éprouve ici. Le
   * premier trimestre 2026 n'a aucun mois en base.
   */
  const vide = { annee: 2026, trimestre: 1 };
  const r = await fetch(`${BASE}/api/dd/trimestre`, {
    method: "POST",
    headers: { Cookie: enteteDD, "Content-Type": "application/json" },
    body: JSON.stringify({ ...vide, apercu: true }),
  });
  const periodeVide = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: vide.annee, trimestre: vide.trimestre },
  });
  dire("le brouillon est bien produit", r.status === 200);
  dire("il n’est pas archivé", periodeVide === null);
  if (periodeVide) {
    await db.exportDocument.deleteMany({ where: { periodeId: periodeVide.id } });
    await db.periodeReporting.delete({ where: { id: periodeVide.id } });
  }

  // 3. Le versionnage d'un DA repart de 1, indépendamment du département.
  const posterDA = (u: typeof moi) =>
    cookie(u).then((c) =>
      fetch(`${BASE}/api/da/trimestre`, {
        method: "POST",
        headers: { Cookie: c, "Content-Type": "application/json" },
        body: JSON.stringify(P),
      })
    );
  await posterDA(moi);
  await posterDA(autre);
  const sien = await db.exportDocument.findMany({
    where: { periodeId: periode!.id, type: "RAPPORT_TRIMESTRIEL_DA_DOCX", arrondissementId: moi.arrondissementId },
    select: { version: true },
  });
  const celuiDeLautre = await db.exportDocument.findMany({
    where: { periodeId: periode!.id, type: "RAPPORT_TRIMESTRIEL_DA_DOCX", arrondissementId: autre.arrondissementId },
    select: { version: true },
  });
  dire(`${moi.arrondissement?.nom} démarre à la version 1`, sien.map((v) => v.version).join() === "1");
  dire(`${autre.arrondissement?.nom} démarre AUSSI à 1, pas à 2`, celuiDeLautre.map((v) => v.version).join() === "1");

  // 4. La liste des archives : chacun ne voit que ce qui le regarde.
  const listeDA = await (await fetch(`${BASE}/api/reports/archives?periodeId=${periode!.id}`, {
    headers: { Cookie: await cookie(moi) },
  })).json();
  const nomsDA: string[] = listeDA.documents.map((d: { nomFichier: string }) => d.nomFichier);
  dire("le DA retrouve son rapport trimestriel", nomsDA.some((n) => n.includes("DAEPIA")));
  dire(
    "il ne voit ni le départemental ni celui du voisin",
    !nomsDA.some((n) => n.includes("DDEPIA")) &&
      !nomsDA.some((n) => n.includes(autre.arrondissement!.nom.replace(/[ ’']/g, "")))
  );
  const listeDD = await (await fetch(`${BASE}/api/reports/archives?periodeId=${periode!.id}`, {
    headers: { Cookie: enteteDD },
  })).json();
  dire("le DD voit tout", listeDD.documents.length >= 4);
  dire("les documents sont relisibles", listeDD.documents.every((d: { disponible: boolean }) => d.disponible));

  // Remise en état.
  const sup = await db.exportDocument.deleteMany({ where: { periodeId: periode!.id } });
  const aud = await db.auditLog.deleteMany({
    where: { action: { in: ["GENERATION_RAPPORT_TRIMESTRIEL", "GENERATION_RAPPORT_TRIMESTRIEL_ARRONDISSEMENT"] } },
  });
  await db.rubriqueNarrative.deleteMany({ where: { periodeId: periode!.id } });
  await db.periodeReporting.delete({ where: { id: periode!.id } });
  console.log(`\nRemise en état : ${sup.count} document(s), ${aud.count} ligne(s) d’audit, 1 période — supprimés.`);

  await db.$disconnect();
}

principal().catch((e) => { console.error(e); process.exit(1); });

/**
 * Vérifie la route /api/da/trimestre sur l'application qui tourne.
 *
 * La session est forgée avec le secret NextAuth — on ne tape jamais de mot de
 * passe. Ce qu'on veut prouver, ce n'est pas que la génération marche (les
 * tests et le script CLI le disent déjà), c'est le CLOISONNEMENT : qu'un DA
 * n'obtienne QUE son arrondissement, même en nommant celui d'un autre.
 *
 *   node --env-file=.env --import tsx scripts/verifier-route-da-trimestre.ts
 */
import { encode } from "next-auth/jwt";
import { base } from "../src/lib/baseDeTravail";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function cookie(user: { id: string; username: string; role: string }) {
  const jeton = await encode({
    token: { sub: user.id, id: user.id, name: user.username, role: user.role },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  return `next-auth.session-token=${jeton}`;
}

async function principal() {
  const db = base;
  const das = await db.user.findMany({
    where: { role: "DA", arrondissementId: { not: null } },
    select: { id: true, username: true, role: true, arrondissement: { select: { nom: true } } },
    take: 2,
  });
  if (das.length < 2) throw new Error("Il faut deux comptes DA pour éprouver le cloisonnement.");
  const [moi, autre] = das;

  const entete = { Cookie: await cookie(moi), "Content-Type": "application/json" };

  // 1. GET : la route doit annoncer SON arrondissement.
  const g = await fetch(`${BASE}/api/da/trimestre`, { headers: entete });
  const etat = await g.json();
  console.log(
    `GET   ${g.status}  arrondissement annoncé : ${etat.arrondissement} ` +
      `${etat.arrondissement === moi.arrondissement?.nom ? "— ok" : "— FAUTE"}`
  );

  const t = etat.disponibles?.[0];
  if (!t) { console.log("Aucun trimestre en base."); await db.$disconnect(); return; }

  // 2. POST en nommant l'arrondissement d'un AUTRE : le paramètre doit être
  //    ignoré, et le document produit rester le sien.
  const p = await fetch(`${BASE}/api/da/trimestre`, {
    method: "POST",
    headers: entete,
    body: JSON.stringify({
      annee: t.annee,
      trimestre: t.trimestre,
      apercu: true,
      arrondissement: autre.arrondissement?.nom,
    }),
  });
  const nom = p.headers.get("Content-Disposition") ?? "";
  const sien = nom.includes(moi.arrondissement!.nom.replace(/[ ’']/g, ""));
  const volé = nom.includes(autre.arrondissement!.nom.replace(/[ ’']/g, ""));
  console.log(
    `POST  ${p.status}  ${nom.replace(/.*filename="|"/g, "")}\n` +
      `      ${moi.username} a demandé « ${autre.arrondissement?.nom} » : ` +
      `${sien && !volé ? "il reçoit le sien — ok" : "IL REÇOIT CELUI DE L’AUTRE — FAUTE"}`
  );

  // 3. Un rôle sans droit doit être refusé.
  const agent = await db.user.findFirst({
    where: { role: "AGENT_SAISIE" },
    select: { id: true, username: true, role: true },
  });
  if (agent) {
    const a = await fetch(`${BASE}/api/da/trimestre`, { headers: { Cookie: await cookie(agent) } });
    console.log(`GET   ${a.status}  agent de saisie ${a.status === 403 ? "refusé — ok" : "ADMIS — FAUTE"}`);
  }

  await db.$disconnect();
}

principal().catch((e) => { console.error(e); process.exit(1); });

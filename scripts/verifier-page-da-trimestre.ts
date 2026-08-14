/**
 * Vérifie que la page /da/trimestre est bien servie à un DA — et refusée aux
 * autres. Session forgée avec le secret NextAuth : aucun mot de passe n'est
 * saisi, et le navigateur de l'utilisateur n'est pas touché.
 *
 *   node --env-file=.env --import tsx scripts/verifier-page-da-trimestre.ts
 */
import { encode } from "next-auth/jwt";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function cookie(u: { id: string; username: string; role: string }) {
  const jeton = await encode({
    token: { sub: u.id, id: u.id, name: u.username, role: u.role },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  return `next-auth.session-token=${jeton}`;
}

async function principal() {
  const db = new PrismaClient();
  const da = await db.user.findFirst({
    where: { role: "DA", arrondissementId: { not: null } },
    select: { id: true, username: true, role: true },
  });
  const chef = await db.user.findFirst({
    where: { role: "CHEF_BAC" },
    select: { id: true, username: true, role: true },
  });
  if (!da) throw new Error("Aucun compte DA en base.");

  const res = await fetch(`${BASE}/da/trimestre`, {
    headers: { Cookie: await cookie(da) },
    redirect: "manual",
  });
  const html = await res.text();
  const a = (quoi: string, ok: boolean) => console.log(`  ${ok ? "ok    " : "MANQUE"}  ${quoi}`);

  console.log(`GET /da/trimestre (${da.username}) → ${res.status}`);
  a("titre de la page", html.includes("Mon rapport trimestriel"));
  a("le composant est monté", html.includes("Production du document") || html.includes("Chargement"));
  a("le menu porte l’entrée", html.includes("/da/trimestre"));
  a("aucune erreur de rendu", !/Application error|Unhandled Runtime Error/.test(html));

  if (chef) {
    const r = await fetch(`${BASE}/da/trimestre`, {
      headers: { Cookie: await cookie(chef) },
      redirect: "manual",
    });
    // Le middleware renvoie le chef ailleurs : 3xx, ou une page qui ne porte
    // pas l'écran du DA.
    const t = r.status >= 300 && r.status < 400 ? "" : await r.text();
    console.log(
      `GET /da/trimestre (${chef.username}, CHEF_BAC) → ${r.status} ` +
        `${r.status >= 300 && r.status < 400 ? "redirigé — ok" : t.includes("Mon rapport trimestriel") ? "ADMIS — FAUTE" : "écarté — ok"}`
    );
  }

  await db.$disconnect();
}

principal().catch((e) => { console.error(e); process.exit(1); });

/**
 * /api/admin-systeme/intervention — l'administrateur du système entre dans un
 * autre département pour y dépanner un collègue, ou en sort (demande du
 * Délégué, 4 novembre 2026 ; principe : lib/intervention.ts).
 *
 *   POST   { departementId } → commence l'intervention (administrateur seul) ;
 *   DELETE                    → la termine et revient à son département.
 *
 * Le DD du département est prévenu au début ; le début et la fin sont inscrits
 * dans le journal de l'administration ET dans celui du département.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientCloisonne } from "@/lib/dbCloisonne";
import { composerIdentite } from "@/lib/departement";
import { COOKIE_INTERVENTION, DUREE_INTERVENTION_S } from "@/lib/intervention";
import { notifierEvenement } from "@/server/notifications/evenements";
import { departementVise, tracer } from "@/server/administration/systeme";
import { administrateur, reponseErreur } from "../garde";

export async function POST(req: Request) {
  try {
    const admin = await administrateur();
    const body = (await req.json().catch(() => ({}))) as { departementId?: unknown };
    const d = await departementVise(body.departementId);
    if (d.id === admin.departementId) {
      return NextResponse.json({ message: "C'est votre propre département : vous y avez déjà tous les droits." }, { status: 400 });
    }
    const dep = clientCloisonne(db, d.id);
    const dd = await dep.user.findFirst({ where: { role: "DD", actif: true }, select: { id: true } });
    if (!dd) {
      return NextResponse.json(
        { message: `Le département ${composerIdentite(d).nomAvecArticle} n'a pas de DD actif : réactivez d'abord son compte (Comptes et mots de passe).` },
        { status: 400 }
      );
    }

    await tracer(admin.db, admin.id, "INTERVENTION_DEBUT", d);
    await dep.auditLog.create({
      data: { userId: dd.id, action: "INTERVENTION_DEBUT", entite: "Departement", entiteId: d.id, details: { intervention: { administrateur: admin.username, departement: d.code } } },
    });
    await notifierEvenement(dep, { roles: ["DD"] }, {
      declencheur: "INTERVENTION_ADMIN",
      message: `L'administrateur du SID (${admin.username}) intervient à distance dans votre département pour vous aider. Tout ce qu'il fait est inscrit au journal d'activité.`,
      lien: "/technique/audit",
    });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_INTERVENTION, d.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: DUREE_INTERVENTION_S, secure: new URL(req.url).protocol === "https:" });
    return res;
  } catch (e) {
    return reponseErreur(e);
  }
}

/** Fin de l'intervention : ouverte à toute session (effacer son propre cookie est sans risque). */
export async function DELETE(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_INTERVENTION, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0, secure: new URL(req.url).protocol === "https:" });
  try {
    const session = await getServerSession(authOptions);
    const id = (session?.user as { id?: string } | undefined)?.id;
    const cible = req.headers.get("cookie")?.match(new RegExp(`${COOKIE_INTERVENTION}=([^;]+)`))?.[1];
    if (id && cible) {
      // Le vrai compte de l'administrateur, lu dans SON département (porte d'amorçage).
      const { compteParId } = await import("@/lib/comptes");
      const moi = await compteParId(db, id);
      const d = await db.departement.findUnique({ where: { id: decodeURIComponent(cible) } });
      if (moi?.departementId && d) {
        await tracer(clientCloisonne(db, moi.departementId), moi.id, "INTERVENTION_FIN", d);
        const dd = await clientCloisonne(db, d.id).user.findFirst({ where: { role: "DD", actif: true }, select: { id: true } });
        await clientCloisonne(db, d.id).auditLog.create({
          data: { userId: dd?.id ?? null, action: "INTERVENTION_FIN", entite: "Departement", entiteId: d.id, details: { intervention: { administrateur: moi.username, departement: d.code } } },
        });
      }
    }
  } catch {
    // La trace de fin ne doit jamais empêcher de revenir chez soi.
  }
  return res;
}

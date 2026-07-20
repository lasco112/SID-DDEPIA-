/**
 * GET /api/technique/audit — consultation du journal d'audit, réservé à
 * ADMIN_TECH. Lecture seule : personne ne modifie ni ne supprime l'historique.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

const TAILLE_PAGE = 50;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["ADMIN_TECH"]);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const action = searchParams.get("action") || undefined;

    const where = action ? { action } : {};
    const [total, entrees, actionsDistinctes] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * TAILLE_PAGE,
        take: TAILLE_PAGE,
        include: { user: { select: { username: true, nom: true, role: true } } },
      }),
      db.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    ]);

    return NextResponse.json({
      total,
      page,
      tailleDePage: TAILLE_PAGE,
      actionsDisponibles: actionsDistinctes.map((a) => a.action),
      entrees,
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * GET /api/admin-systeme/journal — ce que l'administrateur du système a fait :
 * départements allumés ou éteints, identifiants remis, purges, espèces
 * validées. Les 200 dernières actions.
 */
import { NextResponse } from "next/server";
import { ACTIONS_ADMINISTRATION } from "@/server/administration/systeme";
import { administrateur, reponseErreur } from "../garde";

export async function GET() {
  try {
    const admin = await administrateur();
    const lignes = await admin.db.auditLog.findMany({
      where: { action: { in: [...ACTIONS_ADMINISTRATION] } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { nom: true, username: true } } },
    });
    return NextResponse.json({
      lignes: lignes.map((l) => ({
        id: l.id,
        le: l.createdAt.toISOString(),
        action: l.action,
        auteur: l.user?.nom ?? l.user?.username ?? "—",
        details: l.details,
      })),
    });
  } catch (e) {
    return reponseErreur(e);
  }
}

/**
 * GET /api/rapports/mon-rapport?periodeId= — statut du rapport du DA
 * connecté pour la période donnée (null si aucune saisie synchronisée
 * encore effectuée).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "AGENT_SAISIE"]);
    if (!user.arrondissementId) {
      return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const periodeId = searchParams.get("periodeId");
    if (!periodeId) return NextResponse.json({ message: "periodeId requis" }, { status: 400 });

    const rapport = await db.rapportArrondissement.findUnique({
      where: { periodeId_arrondissementId: { periodeId, arrondissementId: user.arrondissementId } },
    });
    return NextResponse.json({ rapport });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

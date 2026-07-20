/**
 * GET /api/periodes/active — période mensuelle pertinente pour l'utilisateur
 * courant (la plus récente non archivée). Utilisée par les pages de saisie,
 * de contrôle et de supervision pour connaître le periodeId à manipuler.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";

export async function GET() {
  try {
    await requireUser();
    const periode = await db.periodeReporting.findFirst({
      where: { type: "MENSUEL", statut: { not: "ARCHIVEE" } },
      orderBy: [{ annee: "desc" }, { mois: "desc" }],
    });
    if (!periode) {
      return NextResponse.json({ message: "Aucune période active" }, { status: 404 });
    }
    return NextResponse.json({ periode });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

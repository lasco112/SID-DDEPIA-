/**
 * POST /api/rapports/rejeter — un chef de section renvoie le rapport d'un
 * arrondissement au DA pour correction (CDC §A.2). SOUMIS → REJETE → (le DA
 * repasse en EN_SAISIE dès sa prochaine synchronisation).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, ROLES_CHEF, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ROLES_CHEF);

    const { rapportId, motif } = (await req.json()) as { rapportId: string; motif: string };
    if (!motif?.trim()) {
      return NextResponse.json({ message: "Le motif de rejet est obligatoire." }, { status: 400 });
    }

    const rapport = await db.rapportArrondissement.update({
      where: { id: rapportId },
      data: { statut: "REJETE", motifRejet: motif },
    });

    await db.auditLog.create({
      data: { userId: user.id, action: "REJET", entite: "RapportArrondissement", entiteId: rapport.id, details: { motif } },
    });

    return NextResponse.json({ rapport });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

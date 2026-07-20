/**
 * POST /api/periodes/deverrouiller — déverrouillage exceptionnel d'un
 * rapport DA après le 28, motivé et audité (CDC §5, §A.7 règle non
 * négociable : toute exception est tracée).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const { rapportId, motif } = (await req.json()) as { rapportId: string; motif: string };
    if (!motif?.trim()) {
      return NextResponse.json({ message: "Le motif de déverrouillage est obligatoire." }, { status: 400 });
    }

    const rapport = await db.rapportArrondissement.update({
      where: { id: rapportId },
      data: {
        deverrouillePar: user.id,
        motifDeverrouillage: motif,
        dateDeverrouillage: new Date(),
      },
    });

    await db.auditLog.create({
      data: { userId: user.id, action: "DEVERROUILLAGE", entite: "RapportArrondissement", entiteId: rapport.id, details: { motif } },
    });

    return NextResponse.json({ rapport });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

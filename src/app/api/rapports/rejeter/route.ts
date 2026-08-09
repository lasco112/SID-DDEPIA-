/**
 * POST /api/rapports/rejeter — un chef de section renvoie le rapport d'un
 * arrondissement au DA pour correction (CDC §A.2). SOUMIS → REJETE → (le DA
 * repasse en EN_SAISIE dès sa prochaine synchronisation).
 */
import { NextResponse } from "next/server";
import { notifierEvenement } from "@/server/notifications/evenements";
import type { PrismaClient } from "@prisma/client";
import { requireUser, assertRole, ROLES_CHEF, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const db = user.db;
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

    await notifierEvenement(
      db as PrismaClient,
      { arrondissementId: rapport.arrondissementId },
      {
        declencheur: "REJET",
        message: `Votre rapport a été renvoyé pour correction. Motif : ${motif}`,
        lien: "/da/saisie",
      }
    );

    return NextResponse.json({ rapport });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * POST /api/syntheses/valider — le DD valide ou renvoie pour correction la
 * synthèse d'une section (CDC §6, tableau de bord DD).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const { syntheseId, valide } = (await req.json()) as { syntheseId: string; valide: boolean };
    const synthese = await db.syntheseSection.update({
      where: { id: syntheseId },
      data: { valideDD: valide },
    });

    await db.auditLog.create({
      data: { userId: user.id, action: valide ? "SYNTHESE_VALIDEE" : "SYNTHESE_RENVOYEE", entite: "SyntheseSection", entiteId: synthese.id },
    });

    return NextResponse.json({ synthese });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

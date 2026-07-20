/**
 * POST /api/admin/utilisateurs/[id]/statut — autoriser (première connexion)
 * ou désactiver un compte (CDC §4.1). Rien n'est supprimé.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireUser();
    assertRole(admin, ["DD"]);

    const { actif } = (await req.json()) as { actif: boolean };
    const updated = await db.user.update({ where: { id: params.id }, data: { actif } });

    await db.auditLog.create({
      data: {
        userId: admin.id,
        action: actif ? "AUTORISATION_COMPTE" : "DESACTIVATION_COMPTE",
        entite: "User",
        entiteId: updated.id,
      },
    });

    return NextResponse.json({ user: { id: updated.id, actif: updated.actif } });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

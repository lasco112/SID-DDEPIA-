/**
 * POST /api/admin/utilisateurs/[id]/statut — autoriser (première connexion)
 * ou désactiver un compte (CDC §4.1). Rien n'est supprimé.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireUser();
    assertRole(admin, ["DD"]);

    const { actif } = (await req.json()) as { actif: boolean };
    if (!actif) {
      // Un DD qui désactivait son propre compte s'enfermait dehors : il n'avait
      // plus personne dans son département pour le rouvrir (constaté le 27 octobre 2026).
      if (params.id === admin.id) {
        return NextResponse.json({ message: "Vous ne pouvez pas désactiver votre propre compte." }, { status: 400 });
      }
      const cible = await admin.db.user.findUnique({ where: { id: params.id }, select: { role: true, actif: true } });
      if (cible?.role === "DD" && cible.actif) {
        const nbDD = await admin.db.user.count({ where: { role: "DD", actif: true } });
        if (nbDD <= 1) {
          return NextResponse.json({ message: "Impossible de désactiver le dernier compte Délégué Départemental actif." }, { status: 400 });
        }
      }
    }
    const updated = await admin.db.user.update({ where: { id: params.id }, data: { actif } });

    await admin.db.auditLog.create({
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

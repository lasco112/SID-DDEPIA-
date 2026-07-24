/**
 * POST /api/admin/utilisateurs/[id]/revoquer — révocation d'appareil à
 * distance (hors-ligne, sécurité) : invalide immédiatement tout jeton de
 * session déjà émis pour ce compte (utile si l'appareil est perdu ou volé).
 * Voir lib/auth.ts (callback jwt) pour l'application effective, au prochain
 * contact serveur — jamais pendant une coupure réseau réelle. Le compte
 * lui-même n'est pas désactivé : une reconnexion normale reste possible.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireUser();
    assertRole(admin, ["DD", "ADMIN_TECH"]);

    const updated = await db.user.update({ where: { id: params.id }, data: { sessionRevoqueeLe: new Date() } });

    await db.auditLog.create({
      data: { userId: admin.id, action: "REVOCATION_SESSION", entite: "User", entiteId: updated.id },
    });

    return NextResponse.json({ ok: true, sessionRevoqueeLe: updated.sessionRevoqueeLe });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

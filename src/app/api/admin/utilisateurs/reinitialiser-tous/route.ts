/**
 * POST /api/admin/utilisateurs/reinitialiser-tous — remet le mot de passe
 * temporaire (password123) et `mustChangePassword: true` sur TOUS les
 * comptes actifs sauf celui du DD qui déclenche l'action (pour ne pas se
 * déconnecter lui-même sans le vouloir). Demande explicite du DD, réunion de
 * service : « le bouton réinitialiser tous les mots de passe ».
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const admin = await requireUser();
    assertRole(admin, ["DD"]);

    const { confirmation } = (await req.json().catch(() => ({}))) as { confirmation?: string };
    if (confirmation !== "REINITIALISER") {
      return NextResponse.json({ message: "Confirmation invalide." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash("password123", 10);
    const { count } = await db.user.updateMany({
      where: { actif: true, id: { not: admin.id } },
      data: { passwordHash, mustChangePassword: true },
    });

    await db.auditLog.create({
      data: {
        userId: admin.id,
        action: "REINITIALISATION_GLOBALE_MOTS_DE_PASSE",
        entite: "User",
        entiteId: "global",
        details: { comptesAffectes: count },
      },
    });

    return NextResponse.json({ ok: true, comptesAffectes: count });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

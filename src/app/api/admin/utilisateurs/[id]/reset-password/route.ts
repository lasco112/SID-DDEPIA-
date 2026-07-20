/**
 * POST /api/admin/utilisateurs/[id]/reset-password — le DD génère un nouveau
 * mot de passe temporaire (compte perdu/bloqué). Le titulaire devra le
 * changer à sa prochaine connexion.
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { genererMotDePasseTemporaire } from "@/lib/generateCredentials";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireUser();
    assertRole(admin, ["DD"]);

    const motDePasseTemporaire = genererMotDePasseTemporaire();
    const passwordHash = await bcrypt.hash(motDePasseTemporaire, 10);
    const updated = await db.user.update({
      where: { id: params.id },
      data: { passwordHash, mustChangePassword: true },
    });

    await db.auditLog.create({
      data: { userId: admin.id, action: "REINITIALISATION_MOT_DE_PASSE", entite: "User", entiteId: updated.id },
    });

    return NextResponse.json({ motDePasseTemporaire });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * POST /api/admin/utilisateurs/[id]/reset-password — le DD réinitialise le
 * mot de passe d'un compte (perdu/bloqué). Le mot de passe temporaire est
 * proposé par le système (password123, simple à communiquer) mais le DD
 * peut l'écraser par un autre de son choix avant de valider — jamais
 * imposé. Le titulaire devra le changer à sa prochaine connexion.
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { genererMotDePasseTemporaire } from "@/lib/generateCredentials";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireUser();
    assertRole(admin, ["DD"]);

    const { motDePasse } = (await req.json().catch(() => ({}))) as { motDePasse?: string };
    const motDePasseTemporaire = motDePasse?.trim() || genererMotDePasseTemporaire();
    if (motDePasseTemporaire.length < 4) {
      return NextResponse.json({ message: "Le mot de passe doit contenir au moins 4 caractères." }, { status: 400 });
    }
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

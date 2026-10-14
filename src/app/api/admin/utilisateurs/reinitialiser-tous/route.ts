/**
 * POST /api/admin/utilisateurs/reinitialiser-tous — remet le mot de passe
 * temporaire (abréviation du département + 123) et `mustChangePassword: true` sur TOUS les
 * comptes actifs sauf celui du DD qui déclenche l'action (pour ne pas se
 * déconnecter lui-même sans le vouloir). Demande explicite du DD, réunion de
 * service : « le bouton réinitialiser tous les mots de passe ».
 */
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { identiteDepartement, motDePasseProvisoire } from "@/lib/departement";

export async function POST(req: Request) {
  try {
    const admin = await requireUser();
    assertRole(admin, ["DD"]);

    const { confirmation } = (await req.json().catch(() => ({}))) as { confirmation?: string };
    if (confirmation !== "REINITIALISER") {
      return NextResponse.json({ message: "Confirmation invalide." }, { status: 400 });
    }

    const motDePasse = motDePasseProvisoire((await identiteDepartement(admin.db)).code);
    const passwordHash = await bcrypt.hash(motDePasse, 10);
    const { count } = await admin.db.user.updateMany({
      where: { actif: true, id: { not: admin.id } },
      data: { passwordHash, mustChangePassword: true },
    });

    await admin.db.auditLog.create({
      data: {
        userId: admin.id,
        action: "REINITIALISATION_GLOBALE_MOTS_DE_PASSE",
        entite: "User",
        entiteId: "global",
        details: { comptesAffectes: count },
      },
    });

    return NextResponse.json({ ok: true, comptesAffectes: count, motDePasse });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

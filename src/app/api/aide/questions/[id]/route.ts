/**
 * POST /api/aide/questions/[id] — marquer une demande d'aide comme traitée.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD", "ADMIN_TECH"]);

    await user.db.demandeAide.update({ where: { id: params.id }, data: { traite: true } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

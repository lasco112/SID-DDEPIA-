/**
 * GET /api/form-templates — liste des 28 tableaux (pour l'index de saisie et
 * la navigation section). Piloté entièrement par la base : aucun tableau
 * n'est codé en dur côté client.
 */
import { NextResponse } from "next/server";
import { requireUser, permissionErrorResponse, ROLES_CHEF, ACCES_TABLEAU_SUPPLEMENTAIRE } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    const scopeSection = ROLES_CHEF.includes(user.role) && user.sectionId ? user.sectionId : undefined;
    const codesSupplementaires = ACCES_TABLEAU_SUPPLEMENTAIRE[user.role] ?? [];
    const templates = await user.db.formTemplate.findMany({
      where: {
        actif: true,
        ...(scopeSection ? { OR: [{ sectionId: scopeSection }, { code: { in: codesSupplementaires } }] } : {}),
      },
      orderBy: { ordre: "asc" },
      include: { section: true, _count: { select: { fields: true } } },
    });
    return NextResponse.json({ templates });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

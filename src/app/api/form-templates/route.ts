/**
 * GET /api/form-templates — liste des 28 tableaux (pour l'index de saisie et
 * la navigation section). Piloté entièrement par la base : aucun tableau
 * n'est codé en dur côté client.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";

const ROLES_CHEF = ["CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"];

export async function GET() {
  try {
    const user = await requireUser();
    const scopeSection = ROLES_CHEF.includes(user.role) && user.sectionId ? user.sectionId : undefined;
    const templates = await db.formTemplate.findMany({
      where: { actif: true, ...(scopeSection ? { sectionId: scopeSection } : {}) },
      orderBy: { ordre: "asc" },
      include: { section: true, _count: { select: { fields: true } } },
    });
    return NextResponse.json({ templates });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

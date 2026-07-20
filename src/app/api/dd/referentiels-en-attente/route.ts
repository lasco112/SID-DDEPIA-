/**
 * GET /api/dd/referentiels-en-attente — liste les propositions de référentiel
 * "structurelles" (ESPECE, VOLAILLE, ESPECE_HALIEUTIQUE) en attente de
 * validation par le DD avant de créer de nouvelles colonnes dans le canevas.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const items = await db.referentielItem.findMany({
      where: { enAttenteValidationDD: true },
      orderBy: { createdAt: "asc" },
      include: { proposePar: { select: { nom: true, username: true } } },
    });

    return NextResponse.json({ items });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

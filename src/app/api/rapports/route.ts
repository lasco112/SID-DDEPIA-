/**
 * GET /api/rapports?periodeId= — état des 6 rapports d'arrondissement pour
 * la période (chefs de section et DD, pour rejet motivé / supervision).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, ROLES_CHEF, ForbiddenError, permissionErrorResponse } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    if (!ROLES_CHEF.includes(user.role) && user.role !== "DD") {
      throw new ForbiddenError("Réservé aux chefs de section et au DD.");
    }

    const { searchParams } = new URL(req.url);
    const periodeId = searchParams.get("periodeId");
    if (!periodeId) return NextResponse.json({ message: "periodeId requis" }, { status: 400 });

    const rapports = await db.rapportArrondissement.findMany({
      where: { periodeId },
      include: { arrondissement: true },
      orderBy: { arrondissement: { ordre: "asc" } },
    });
    return NextResponse.json({ rapports });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

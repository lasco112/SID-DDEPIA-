/**
 * GET /api/notifications — notifications IN_APP du compte connecté (CDC §M9).
 * Les canaux SMS/WHATSAPP ne sont que des places d'attente pour la
 * passerelle réelle (phase 3) : seul IN_APP est affiché ici.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    const notifications = await db.notification.findMany({
      where: { destinataireId: user.id, canal: "IN_APP" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ notifications });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

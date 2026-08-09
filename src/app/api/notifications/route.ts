/**
 * GET   /api/notifications — notifications du compte connecté + nombre de non-lues.
 * PATCH /api/notifications — marque comme lues (toutes, ou une liste d'identifiants).
 *
 * Seul le canal IN_APP est affiché : SMS et WhatsApp restent des places
 * d'attente pour une passerelle payante, non encore souscrite.
 */
import { NextResponse } from "next/server";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    const [notifications, nonLues] = await Promise.all([
      user.db.notification.findMany({
        where: { destinataireId: user.id, canal: "IN_APP" },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { id: true, message: true, declencheur: true, createdAt: true, luLe: true, lien: true },
      }),
      user.db.notification.count({ where: { destinataireId: user.id, canal: "IN_APP", luLe: null } }),
    ]);
    return NextResponse.json({ notifications, nonLues });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const { ids } = (await req.json().catch(() => ({}))) as { ids?: string[] };

    // Le filtre sur destinataireId est indispensable : sans lui, un identifiant
    // deviné permettrait de marquer lue la notification d'un collègue.
    const res = await user.db.notification.updateMany({
      where: {
        destinataireId: user.id,
        luLe: null,
        ...(Array.isArray(ids) && ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { luLe: new Date() },
    });

    return NextResponse.json({ marquees: res.count });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

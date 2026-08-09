/**
 * POST   /api/notifications/abonnement — un appareil autorise les notifications
 *        système et transmet son adresse de réception.
 * DELETE /api/notifications/abonnement — l'appareil se désabonne.
 * GET    /api/notifications/abonnement — clé publique du serveur + disponibilité.
 *
 * La clé publique doit être connue du navigateur pour s'abonner ; elle n'est
 * pas secrète, contrairement à la clé privée qui ne quitte jamais le serveur.
 */
import { NextResponse } from "next/server";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";
import { pushDisponible } from "@/server/notifications/push";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await requireUser();
    return NextResponse.json({
      disponible: pushDisponible(),
      clePublique: process.env.VAPID_PUBLIC_KEY ?? null,
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { endpoint, keys, appareil } = (await req.json()) as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      appareil?: string;
    };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ message: "Abonnement incomplet." }, { status: 400 });
    }

    // Le même appareil peut se réabonner (nouvelle session, autre compte) :
    // l'endpoint est unique, on le réattribue au compte courant.
    await db.abonnementPush.upsert({
      where: { endpoint },
      update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, appareil: appareil ?? null },
      create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, appareil: appareil ?? null },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
    await db.abonnementPush.deleteMany({
      where: { userId: user.id, ...(endpoint ? { endpoint } : {}) },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

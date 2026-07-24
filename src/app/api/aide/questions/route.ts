/**
 * GET/POST /api/aide/questions — aide contextuelle : poser une question
 * depuis le bouton « Aide » (avec la page/tableau exact où l'utilisateur se
 * trouvait), et la consulter côté DD/ADMIN_TECH. Sert de base à une FAQ
 * vivante (voir lib/faq.ts pour la FAQ pré-écrite).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["DD", "ADMIN_TECH"]);

    const demandes = await db.demandeAide.findMany({
      orderBy: [{ traite: "asc" }, { createdAt: "desc" }],
      include: { user: { select: { nom: true, username: true, role: true } } },
      take: 200,
    });
    return NextResponse.json({ demandes });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const { page, tableauCode, message } = (await req.json()) as { page: string; tableauCode?: string | null; message: string };
    if (!message?.trim()) return NextResponse.json({ message: "Question vide." }, { status: 400 });

    await db.demandeAide.create({
      data: { userId: user.id, page: page ?? "", tableauCode: tableauCode ?? null, message: message.trim() },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

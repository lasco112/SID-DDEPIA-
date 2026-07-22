/**
 * GET/POST /api/technique/mode-demo — activation/arrêt de la démonstration
 * GLOBALE par le Super Administrateur (correction n°10, ajout final du DD).
 *
 * Activer ne copie, ne déplace et n'écrase AUCUNE donnée : le drapeau change
 * simplement la base que chaque requête interroge (voir resoudreContexte dans
 * lib/permissions.ts). À la sortie, la production est retrouvée exactement
 * dans l'état où elle était — les saisies faites pendant la démonstration
 * restent, elles, dans la base de démonstration.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { demoDb } from "@/lib/demoDb";
import {
  requireUser,
  assertRole,
  permissionErrorResponse,
  CLE_MODE_DEMO_GLOBAL,
  invaliderCacheModeDemo,
} from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["ADMIN_TECH"]);
    const config = await db.configSysteme.findUnique({ where: { cle: CLE_MODE_DEMO_GLOBAL } });
    return NextResponse.json({
      actif: config?.valeur === "actif",
      disponible: Boolean(demoDb),
      depuis: config?.updatedAt ?? null,
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["ADMIN_TECH"]);

    const { actif } = (await req.json()) as { actif: boolean };
    if (actif && !demoDb) {
      return NextResponse.json(
        { message: "Environnement de démonstration non configuré sur ce serveur (DEMO_DATABASE_URL absente)." },
        { status: 400 }
      );
    }

    const valeur = actif ? "actif" : "inactif";
    await db.configSysteme.upsert({
      where: { cle: CLE_MODE_DEMO_GLOBAL },
      update: { valeur, modifieParId: user.id },
      create: { cle: CLE_MODE_DEMO_GLOBAL, valeur, modifieParId: user.id },
    });
    invaliderCacheModeDemo();

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: actif ? "MODE_DEMO_ACTIVE" : "MODE_DEMO_ARRETE",
        entite: "ConfigSysteme",
        entiteId: CLE_MODE_DEMO_GLOBAL,
      },
    });

    return NextResponse.json({ actif });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

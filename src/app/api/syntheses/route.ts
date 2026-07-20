/**
 * GET/PUT /api/syntheses — synthèse d'analyse rédigée par un chef de section
 * (CDC §M5). Toute nouvelle édition invalide une validation DD antérieure :
 * le DD doit revalider après une modification.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertProprietaireSection, permissionErrorResponse } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const periodeId = searchParams.get("periodeId");
    if (!periodeId || !user.sectionId) {
      return NextResponse.json({ message: "periodeId et section requis" }, { status: 400 });
    }
    const synthese = await db.syntheseSection.findFirst({
      where: { periodeId, sectionId: user.sectionId, blocCode: null },
    });
    return NextResponse.json({ synthese });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const { periodeId, contenuFinal } = (await req.json()) as { periodeId: string; contenuFinal: string };
    if (!user.sectionId) {
      return NextResponse.json({ message: "Compte sans section assignée" }, { status: 400 });
    }
    assertProprietaireSection(user, user.sectionId);

    // Note : blocCode est nullable, or Postgres traite NULL comme distinct de
    // lui-même dans une contrainte unique — un upsert sur la clé composée ne
    // retrouverait donc pas de façon fiable la ligne existante. On cherche
    // explicitement d'abord (une seule synthèse par section/période en MVP,
    // blocCode toujours null).
    const existante = await db.syntheseSection.findFirst({
      where: { periodeId, sectionId: user.sectionId, blocCode: null },
    });
    const synthese = existante
      ? await db.syntheseSection.update({
          where: { id: existante.id },
          data: { contenuFinal, auteurId: user.id, valideDD: false },
        })
      : await db.syntheseSection.create({
          data: { periodeId, sectionId: user.sectionId, contenuFinal, auteurId: user.id },
        });

    await db.auditLog.create({
      data: { userId: user.id, action: "SYNTHESE_EDIT", entite: "SyntheseSection", entiteId: synthese.id },
    });

    return NextResponse.json({ synthese });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

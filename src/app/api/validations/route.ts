/**
 * POST /api/validations — un chef de section valide (ou rejette) le contrôle
 * de sa section pour la période (CDC §5, workflow EN_ATTENTE/EN_CONTROLE →
 * VALIDE/REJETE). Doit intervenir avant le 29 18h (alerte cron sinon).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertProprietaireSection, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { periodeId, statut } = (await req.json()) as {
      periodeId: string;
      statut: "VALIDE" | "REJETE" | "EN_CONTROLE";
    };
    if (!user.sectionId) {
      return NextResponse.json({ message: "Compte sans section assignée" }, { status: 400 });
    }
    assertProprietaireSection(user, user.sectionId);

    const validation = await db.validationSection.upsert({
      where: { periodeId_sectionId: { periodeId, sectionId: user.sectionId } },
      update: {
        statut,
        valideParId: statut === "VALIDE" ? user.id : null,
        dateValidation: statut === "VALIDE" ? new Date() : null,
      },
      create: {
        periodeId,
        sectionId: user.sectionId,
        statut,
        valideParId: statut === "VALIDE" ? user.id : null,
        dateValidation: statut === "VALIDE" ? new Date() : null,
      },
    });

    await db.auditLog.create({
      data: { userId: user.id, action: "VALIDATION_SECTION", entite: "ValidationSection", entiteId: validation.id, details: { statut } },
    });

    return NextResponse.json({ validation });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

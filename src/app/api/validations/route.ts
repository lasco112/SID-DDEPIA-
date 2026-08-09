/**
 * POST /api/validations — un chef de section valide (ou rejette) le contrôle
 * de sa section pour la période (CDC §5, workflow EN_ATTENTE/EN_CONTROLE →
 * VALIDE/REJETE). Doit intervenir avant le 29 18h (alerte cron sinon).
 */
import { NextResponse } from "next/server";
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { notifierEvenement } from "@/server/notifications/evenements";
import type { PrismaClient } from "@prisma/client";
import { requireUser, assertProprietaireSection, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const db = user.db;
    const { periodeId, statut } = (await req.json()) as {
      periodeId: string;
      statut: "VALIDE" | "REJETE" | "EN_CONTROLE";
    };
    if (!user.sectionId) {
      return NextResponse.json({ message: "Compte sans section assignée" }, { status: 400 });
    }
    assertProprietaireSection(user, user.sectionId);
    await assertPeriodeModifiable(db, periodeId); // §13 : mois clôturé = plus de validation

    const validation = await db.validationSection.upsert({
      where: { periodeId_sectionId: { periodeId, sectionId: user.sectionId } },
      update: {
        statut,
        valideParId: statut === "VALIDE" ? user.id : null,
        dateValidation: statut === "VALIDE" ? new Date() : null,
        // Le chef reprend la main : la validation n'est plus une validation
        // exercée par le DD à sa place (§9).
        validationDirecteDD: false,
        motifValidationDD: null,
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

    if (statut === "VALIDE") {
      const section = await db.section.findUnique({ where: { id: user.sectionId } });
      await notifierEvenement(
        db as PrismaClient,
        { roles: ["DD"] },
        {
          declencheur: "VALIDATION_SECTION",
          message: `La section ${section?.nom ?? user.sectionId} a validé ses données pour la période.`,
          lien: "/dd/supervision",
        }
      );
    }

    return NextResponse.json({ validation });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * POST /api/dd/validations — « Valider en tant que DD » (CDC §9).
 *
 * Le circuit normal veut que chaque chef de section valide son domaine. Mais
 * le SID ne doit pas rendre le Délégué Départemental dépendant de l'action
 * informatique d'un subordonné : lorsqu'il a lui-même contrôlé les données, il
 * doit pouvoir valider depuis son compte et poursuivre la production du
 * rapport.
 *
 * Cette validation est marquée `validationDirecteDD` : elle reste distincte
 * d'une validation ordinaire dans l'historique et dans le journal.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { notifierEvenement } from "@/server/notifications/evenements";
import type { PrismaClient } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db;

    const { periodeId, sectionId, motif } = (await req.json()) as {
      periodeId: string;
      sectionId: string;
      motif?: string;
    };
    if (!periodeId || !sectionId) {
      return NextResponse.json({ message: "Période et section requises." }, { status: 400 });
    }

    const [periode, section] = await Promise.all([
      db.periodeReporting.findUnique({ where: { id: periodeId } }),
      db.section.findUnique({ where: { id: sectionId } }),
    ]);
    if (!periode) return NextResponse.json({ message: "Période introuvable." }, { status: 404 });
    if (!section) return NextResponse.json({ message: "Section introuvable." }, { status: 404 });

    // Une période clôturée est figée : la rouvrir est un acte distinct et tracé (§13).
    await assertPeriodeModifiable(db, periodeId);

    const donnees = {
      statut: "VALIDE" as const,
      valideParId: user.id,
      dateValidation: new Date(),
      validationDirecteDD: true,
      motifValidationDD: motif?.trim() || null,
    };

    const validation = await db.validationSection.upsert({
      where: { periodeId_sectionId: { periodeId, sectionId } },
      update: donnees,
      create: { periodeId, sectionId, ...donnees },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "VALIDATION_SECTION",
        entite: "ValidationSection",
        entiteId: validation.id,
        details: {
          statut: "VALIDE",
          parLeDD: true,
          section: section.code,
          periode: `${periode.annee}-${String(periode.mois ?? 0).padStart(2, "0")}`,
          motif: donnees.motifValidationDD,
        },
      },
    });

    await notifierEvenement(
      db as PrismaClient,
      { sectionId, saufUserId: user.id },
      {
        declencheur: "VALIDATION_PAR_DD",
        message: `Le Délégué Départemental a validé la section ${section.nom} à votre place${donnees.motifValidationDD ? ` — motif : ${donnees.motifValidationDD}` : ""}.`,
        lien: "/section/controle",
      }
    );

    return NextResponse.json({ validation });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

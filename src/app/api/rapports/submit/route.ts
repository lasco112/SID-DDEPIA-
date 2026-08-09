/**
 * POST /api/rapports/submit — soumission officielle du rapport DA (CDC §5).
 * Transition EN_SAISIE|REJETE → SOUMIS. Verrouille l'écriture DA : après ce
 * point seules les corrections tracées des chefs de section sont possibles.
 */
import { NextResponse } from "next/server";
import { notifierEvenement } from "@/server/notifications/evenements";
import type { PrismaClient } from "@prisma/client";
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const db = user.db;
    assertRole(user, ["DA"]);
    if (!user.arrondissementId) {
      return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
    }

    const { periodeId } = (await req.json()) as { periodeId: string };
    const periode = await db.periodeReporting.findUnique({ where: { id: periodeId } });
    if (!periode) {
      return NextResponse.json({ message: "Période introuvable" }, { status: 404 });
    }
    await assertPeriodeModifiable(db, periode.id); // §13 : un mois clôturé ne reçoit plus de soumission

    const rapport = await db.rapportArrondissement.findUnique({
      where: { periodeId_arrondissementId: { periodeId, arrondissementId: user.arrondissementId } },
    });
    if (!rapport) {
      return NextResponse.json({ message: "Aucune saisie synchronisée pour cette période" }, { status: 400 });
    }
    if (rapport.statut === "SOUMIS" || rapport.statut === "CLOTURE") {
      return NextResponse.json({ message: "Rapport déjà soumis" }, { status: 423 });
    }
    if (periode.statut === "VERROUILLEE_DA" && !rapport.deverrouillePar) {
      return NextResponse.json(
        { message: "Période verrouillée : demandez un déverrouillage exceptionnel au DD." },
        { status: 423 }
      );
    }

    const updated = await db.rapportArrondissement.update({
      where: { id: rapport.id },
      data: {
        statut: "SOUMIS",
        soumisParId: user.id,
        dateSoumission: new Date(),
        motifRejet: null,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "SOUMISSION",
        entite: "RapportArrondissement",
        entiteId: rapport.id,
      },
    });

    const arr = await db.arrondissement.findUnique({ where: { id: user.arrondissementId } });
    await notifierEvenement(
      db as PrismaClient,
      { roles: ["DD", "CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"] },
      {
        declencheur: "SOUMISSION_DA",
        message: `${arr?.nom ?? "Un arrondissement"} a transmis son rapport mensuel.`,
        lien: "/dd/supervision",
      }
    );

    return NextResponse.json({ rapport: updated });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

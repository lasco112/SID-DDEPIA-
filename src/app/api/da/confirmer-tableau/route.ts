/**
 * POST /api/da/confirmer-tableau — l'agent (ou le DA) confirme en bloc les
 * valeurs d'un tableau reprises du mois précédent.
 *
 * Une valeur reprise n'est pas une donnée du mois tant que quelqu'un ne l'a
 * pas regardée. Ce geste transforme les reprises restantes du tableau en
 * données confirmées, et débloque d'autant la transmission du rapport.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { confirmerTableau, tableauxNonConfirmes } from "@/server/periodes/report";
import { resoudrePeriode } from "@/server/periodes/courante";
import type { PrismaClient } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "AGENT_SAISIE"]);
    const db = user.db;
    if (!user.arrondissementId) {
      return NextResponse.json({ message: "Compte sans arrondissement assigné." }, { status: 400 });
    }

    const { templateCode } = (await req.json()) as { templateCode?: string };
    if (!templateCode) return NextResponse.json({ message: "Tableau non précisé." }, { status: 400 });

    const periode = await resoudrePeriode(db);
    if (!periode) return NextResponse.json({ message: "Aucune période de travail." }, { status: 404 });
    await assertPeriodeModifiable(db, periode.id);

    const rapport = await db.rapportArrondissement.findUnique({
      where: { periodeId_arrondissementId: { periodeId: periode.id, arrondissementId: user.arrondissementId } },
    });
    if (!rapport) return NextResponse.json({ message: "Aucune donnée pour ce mois." }, { status: 404 });

    const confirmees = await confirmerTableau(db as PrismaClient, rapport.id, templateCode);
    const restants = await tableauxNonConfirmes(db as PrismaClient, rapport.id);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "CONFIRMATION_REPORT",
        entite: "RapportArrondissement",
        entiteId: rapport.id,
        details: { templateCode, confirmees },
      },
    });

    return NextResponse.json({ confirmees, tableauxRestants: restants });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * POST /api/dd/periodes/rouvrir — réouverture exceptionnelle d'une période
 * clôturée (§13).
 *
 * Le motif est OBLIGATOIRE : rouvrir un mois administrativement clos doit
 * toujours pouvoir être justifié a posteriori. La réouverture est conservée
 * sur la période elle-même et dans le journal.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { STATUT_CLOTUREE } from "@/server/periodes/gel";
import { notifierEvenement } from "@/server/notifications/evenements";
import type { PrismaClient } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db;

    const { periodeId, motif } = (await req.json()) as { periodeId: string; motif?: string };
    if (!periodeId) return NextResponse.json({ message: "Période non précisée." }, { status: 400 });
    if (!motif || !motif.trim()) {
      return NextResponse.json({ message: "Le motif de la réouverture est obligatoire." }, { status: 400 });
    }

    const periode = await db.periodeReporting.findUnique({ where: { id: periodeId } });
    if (!periode) return NextResponse.json({ message: "Période introuvable." }, { status: 404 });
    if (periode.statut !== STATUT_CLOTUREE) {
      return NextResponse.json({ message: "Cette période n'est pas clôturée." }, { status: 409 });
    }

    const misAJour = await db.periodeReporting.update({
      where: { id: periodeId },
      data: {
        statut: "OUVERTE",
        reouverteLe: new Date(),
        reouvertePar: user.id,
        motifReouverture: motif.trim(),
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "REOUVERTURE_PERIODE",
        entite: "PeriodeReporting",
        entiteId: periodeId,
        details: {
          periode: `${periode.annee}-${String(periode.mois ?? 0).padStart(2, "0")}`,
          motif: motif.trim(),
          clotureeLe: periode.clotureeLe?.toISOString() ?? null,
        },
      },
    });

    await notifierEvenement(
      db as PrismaClient,
      { roles: ["DD", "DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"], saufUserId: user.id },
      {
        declencheur: "REOUVERTURE_PERIODE",
        message: `La période ${String(periode.mois ?? 0).padStart(2, "0")}/${periode.annee} a été rouverte. Motif : ${motif.trim()}`,
        lien: "/dashboard",
      }
    );

    return NextResponse.json({ periode: misAJour });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

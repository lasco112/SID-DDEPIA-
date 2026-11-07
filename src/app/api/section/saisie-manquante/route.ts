/**
 * POST /api/section/saisie-manquante — le chef de section remplit une case
 * laissée vide par le DA dans un tableau de chiffres du mois, une fois le mois
 * transmis, motif obligatoire (décision du Délégué, 6 novembre 2026).
 * Règles : src/server/mensuel/saisieManquanteChef.ts.
 *
 *   { templateCode, periodeId, arrondissementId, fieldCode, valeur, motif }
 */
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";
import { RefusAjout } from "@/server/mensuel/ajoutLigneChef";
import { saisirCaseManquante } from "@/server/mensuel/saisieManquanteChef";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "DD" && !user.role.startsWith("CHEF_")) {
      return NextResponse.json({ message: "Réservé aux chefs de section." }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as {
      templateCode?: string; periodeId?: string; arrondissementId?: string; fieldCode?: string; valeur?: unknown; motif?: string; etablissementId?: string;
    };
    if (!body.templateCode || !body.periodeId || !body.arrondissementId || !body.fieldCode) {
      return NextResponse.json({ message: "Tableau, mois, arrondissement ou ligne non précisé." }, { status: 400 });
    }
    const saisie = await saisirCaseManquante(
      user.db as PrismaClient,
      { id: user.id, role: user.role, username: user.username, sectionId: user.sectionId ?? null },
      { templateCode: body.templateCode, periodeId: body.periodeId, arrondissementId: body.arrondissementId, fieldCode: body.fieldCode, valeur: body.valeur, motif: body.motif, etablissementId: body.etablissementId ?? null }
    );
    return NextResponse.json({ saisie: { id: saisie.id } });
  } catch (e) {
    if (e instanceof RefusAjout) return NextResponse.json({ message: e.message }, { status: e.status });
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

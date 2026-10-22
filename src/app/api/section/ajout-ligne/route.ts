/**
 * POST /api/section/ajout-ligne — le chef de section ajoute au rapport du mois
 * d'un arrondissement une ligne que le DA a oubliée (une vaccination PPCB omise…),
 * pendant la correction directe ouverte par le DD, motif obligatoire.
 * Règles : src/server/mensuel/ajoutLigneChef.ts.
 *
 *   { templateCode, periodeId, arrondissementId, payload, motif }
 */
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";
import { ajouterLigneOubliee, RefusAjout } from "@/server/mensuel/ajoutLigneChef";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "DD" && !user.role.startsWith("CHEF_")) {
      return NextResponse.json({ message: "Réservé aux chefs de section." }, { status: 403 });
    }
    const body = (await req.json()) as {
      templateCode?: string; periodeId?: string; arrondissementId?: string; payload?: Record<string, unknown>; motif?: string;
    };
    if (!body.templateCode || !body.periodeId || !body.arrondissementId) {
      return NextResponse.json({ message: "Tableau, mois ou arrondissement non précisé." }, { status: 400 });
    }
    const ligne = await ajouterLigneOubliee(
      user.db as PrismaClient,
      { id: user.id, role: user.role, username: user.username, sectionId: user.sectionId ?? null },
      { templateCode: body.templateCode, periodeId: body.periodeId, arrondissementId: body.arrondissementId, payload: body.payload ?? {}, motif: body.motif }
    );
    return NextResponse.json({ ligne: { id: ligne.id } });
  } catch (e) {
    if (e instanceof RefusAjout) return NextResponse.json({ message: e.message }, { status: e.status });
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

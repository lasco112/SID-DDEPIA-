/**
 * POST /api/section/etablissement-oublie — le chef de section inscrit au
 * registre un établissement que le DA a oublié et qui n'y figurait pas
 * (décision du Délégué, 7 novembre 2026). Règles :
 * src/server/mensuel/etablissementOublieChef.ts.
 *
 *   { templateCode, periodeId, arrondissementId, nom, centreId?, villageId?,
 *     villageAutre?, localite?, proprietaire?, telephone?, motif }
 */
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";
import { RefusAjout } from "@/server/mensuel/ajoutLigneChef";
import { creerEtablissementOublie } from "@/server/mensuel/etablissementOublieChef";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (user.role !== "DD" && !user.role.startsWith("CHEF_")) {
      return NextResponse.json({ message: "Réservé aux chefs de section." }, { status: 403 });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const templateCode = typeof body.templateCode === "string" ? body.templateCode : "";
    const periodeId = typeof body.periodeId === "string" ? body.periodeId : "";
    const arrondissementId = typeof body.arrondissementId === "string" ? body.arrondissementId : "";
    if (!templateCode || !periodeId || !arrondissementId) {
      return NextResponse.json({ message: "Tableau, mois ou arrondissement non précisé." }, { status: 400 });
    }
    const etablissement = await creerEtablissementOublie(
      user.db as PrismaClient,
      { id: user.id, role: user.role, username: user.username, sectionId: user.sectionId ?? null },
      { ...body, templateCode, periodeId, arrondissementId, nom: body.nom, motif: body.motif }
    );
    return NextResponse.json({ etablissement }, { status: 201 });
  } catch (e) {
    if (e instanceof RefusAjout) return NextResponse.json({ message: e.message }, { status: e.status });
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * GET /api/rapports/mes-saisies?periodeId=&templateCode= — les saisies déjà
 * synchronisées du DA connecté pour un tableau donné. Sert à réhydrater
 * IndexedDB si l'appareil a été changé ou son stockage local vidé (le local
 * reste la source de vérité tant qu'il contient des données).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "AGENT_SAISIE"]);
    if (!user.arrondissementId) {
      return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const periodeId = searchParams.get("periodeId");
    const templateCode = searchParams.get("templateCode");
    if (!periodeId || !templateCode) {
      return NextResponse.json({ message: "periodeId et templateCode requis" }, { status: 400 });
    }

    const rapport = await db.rapportArrondissement.findUnique({
      where: { periodeId_arrondissementId: { periodeId, arrondissementId: user.arrondissementId } },
    });
    if (!rapport) {
      return NextResponse.json({ rapport: null, matrice: [], nominatif: [], evenement: [] });
    }

    const template = await db.formTemplate.findUnique({ where: { code: templateCode } });
    if (!template) return NextResponse.json({ message: "Tableau introuvable" }, { status: 404 });

    const [matrice, nominatif, evenement] = await Promise.all([
      template.type === "MATRICE"
        ? db.saisieMatrice.findMany({ where: { rapportId: rapport.id, field: { templateId: template.id } }, include: { saisiPar: { select: { nom: true, username: true } } } })
        : [],
      template.type === "NOMINATIF"
        ? db.saisieNominative.findMany({ where: { rapportId: rapport.id, templateId: template.id }, include: { saisiPar: { select: { nom: true, username: true } } } })
        : [],
      template.type === "EVENEMENT"
        ? db.saisieEvenement.findMany({ where: { rapportId: rapport.id, templateId: template.id }, include: { saisiPar: { select: { nom: true, username: true } } } })
        : [],
    ]);

    return NextResponse.json({ rapport, matrice, nominatif, evenement });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

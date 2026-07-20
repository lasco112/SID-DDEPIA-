/**
 * GET /api/dd/rapports-thematiques/options — alimente les filtres de l'écran
 * de rapport thématique (espèces, domaines, arrondissements, périodes).
 * Réservé au DD (middleware /api/dd).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { ESPECES_BLOC } from "@/lib/themeMapping";
import { DOMAINES } from "@/server/export/rapport-thematique";

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const [especesReferentiel, arrondissements, periodes] = await Promise.all([
      db.referentielItem.findMany({
        where: { categorie: "ESPECE", actif: true, enAttenteValidationDD: false },
        orderBy: [{ ordre: "asc" }, { libelle: "asc" }],
        select: { code: true, libelle: true },
      }),
      db.arrondissement.findMany({ orderBy: { ordre: "asc" }, select: { code: true, nom: true } }),
      db.periodeReporting.findMany({
        where: { type: "MENSUEL" },
        orderBy: [{ annee: "desc" }, { mois: "desc" }],
        select: { id: true, mois: true, annee: true, statut: true },
      }),
    ]);

    return NextResponse.json({
      especes: [...especesReferentiel, ...ESPECES_BLOC],
      domaines: DOMAINES,
      arrondissements,
      periodes,
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

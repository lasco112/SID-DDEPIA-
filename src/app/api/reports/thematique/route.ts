/**
 * POST /api/reports/thematique — rapport thématique "à la carte" (fonction
 * additionnelle, réservée au DD) : contrairement à /api/reports/generate
 * (jamais modifié par cette route — le rapport mensuel classique reste
 * strictement intact à tous les niveaux), le DD choisit ici les données à
 * extraire (espèce, domaine, arrondissement, période) plutôt que de suivre
 * la structure fixe du canevas.
 * body: { especeCodes: string[], domaines: string[], arrondissementCodes: string[], periodeIds: string[], format: "xlsx"|"docx"|"pdf" }
 * Pas de persistance versionnée (ExportDocument) : contrairement au rapport
 * officiel, une extraction thématique peut couvrir plusieurs périodes à la
 * fois (le modèle ExportDocument suppose une seule periodeId) et est par
 * nature un usage ponctuel/exploratoire — seule une entrée AuditLog trace
 * qui a extrait quoi.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { db } from "@/lib/db";
import { collecterDonneesThematiques, libelleDomaine, type FiltreThematique } from "@/server/export/rapport-thematique";
import { rendreThematiqueXlsx, rendreThematiqueDocx, rendreThematiquePdf } from "@/server/export/rapport-thematique-render";

interface Body {
  especeCodes?: string[];
  domaines?: string[];
  arrondissementCodes?: string[];
  periodeIds?: string[];
  format?: "xlsx" | "docx" | "pdf";
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const body = (await req.json()) as Body;
    const format = body.format;
    if (!format || !["xlsx", "docx", "pdf"].includes(format)) {
      return NextResponse.json({ message: "Format invalide (xlsx, docx ou pdf attendu)." }, { status: 400 });
    }
    const periodeIds = body.periodeIds ?? [];
    if (periodeIds.length === 0) {
      return NextResponse.json({ message: "Sélectionnez au moins une période." }, { status: 400 });
    }

    const filtre: FiltreThematique = {
      especeCodes: body.especeCodes ?? [],
      domaines: body.domaines ?? [],
      arrondissementCodes: body.arrondissementCodes ?? [],
      periodeIds,
    };

    const tableaux = await collecterDonneesThematiques(filtre);
    if (tableaux.length === 0) {
      return NextResponse.json({ message: "Aucune donnée ne correspond à cette combinaison de filtres." }, { status: 404 });
    }

    const titreGeneral = [
      "Rapport thématique — SID DDEPIA-Menoua",
      filtre.domaines.length ? filtre.domaines.map(libelleDomaine).join(", ") : null,
    ]
      .filter(Boolean)
      .join(" — ");

    let buf: Buffer;
    let contentType: string;
    let ext: string;
    if (format === "xlsx") {
      buf = await rendreThematiqueXlsx(tableaux, titreGeneral);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = "xlsx";
    } else if (format === "docx") {
      buf = await rendreThematiqueDocx(tableaux, titreGeneral);
      contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      ext = "docx";
    } else {
      buf = await rendreThematiquePdf(tableaux, titreGeneral);
      contentType = "application/pdf";
      ext = "pdf";
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "EXPORT_THEMATIQUE",
        entite: "RapportThematique",
        details: { ...filtre, format, nbTableaux: tableaux.length },
      },
    });

    const fileName = `Rapport_Thematique_${new Date().toISOString().slice(0, 10)}.${ext}`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

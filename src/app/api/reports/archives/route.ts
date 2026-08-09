/**
 * GET /api/reports/archives?periodeId=... — liste des rapports déjà générés,
 * du plus récent au plus ancien.
 *
 * Le DD voit tous les documents de la période ; un DA (ou son agent de saisie)
 * ne voit que ceux de SON arrondissement. Sert à proposer « relire le dernier
 * rapport transmis » sans le régénérer.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const periodeId = new URL(req.url).searchParams.get("periodeId");
    if (!periodeId) return NextResponse.json({ message: "Période non précisée." }, { status: 400 });

    const documents = await db.exportDocument.findMany({
      where:
        user.role === "DD"
          ? { periodeId }
          : { periodeId, type: "RAPPORT_DA_DOCX", arrondissementId: user.arrondissementId ?? "__aucun__" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        version: true,
        createdAt: true,
        cheminFichier: true,
        arrondissement: { select: { nom: true } },
      },
    });

    // `disponible` distingue un document réellement relisible d'une simple
    // trace d'export antérieure à l'archivage en base (fichier perdu).
    const contenus = await db.exportDocument.findMany({
      where: { id: { in: documents.map((d) => d.id) }, contenu: { not: null } },
      select: { id: true },
    });
    const avecContenu = new Set(contenus.map((c) => c.id));

    return NextResponse.json({
      documents: documents.map((d) => ({
        id: d.id,
        type: d.type,
        version: d.version,
        createdAt: d.createdAt,
        nomFichier: d.cheminFichier,
        arrondissement: d.arrondissement?.nom ?? null,
        disponible: avecContenu.has(d.id),
      })),
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

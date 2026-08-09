/**
 * GET /api/reports/archives/[id] — relit un rapport DÉJÀ GÉNÉRÉ, tel qu'il a
 * été produit et transmis à l'époque.
 *
 * Le document est servi depuis la base (ExportDocument.contenu) et non depuis
 * le disque : celui du conteneur Railway est effacé à chaque redéploiement.
 *
 * Accès : le DD lit tous les rapports du département ; un DA ne lit que ceux
 * de SON arrondissement. Les documents départementaux restent réservés au DD.
 *
 * `?apercu=1` affiche le document dans le navigateur au lieu de le télécharger
 * (« Lire le rapport » plutôt que « Télécharger »).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();

    const doc = await db.exportDocument.findUnique({
      where: { id: params.id },
      select: { cheminFichier: true, contenu: true, type: true, arrondissementId: true, version: true },
    });
    if (!doc) return NextResponse.json({ message: "Document introuvable." }, { status: 404 });

    const estDocumentDA = doc.type === "RAPPORT_DA_DOCX";
    const autorise =
      user.role === "DD" ||
      (estDocumentDA &&
        (user.role === "DA" || user.role === "AGENT_SAISIE") &&
        doc.arrondissementId !== null &&
        doc.arrondissementId === user.arrondissementId);
    if (!autorise) {
      return NextResponse.json({ message: "Vous n'avez pas accès à ce document." }, { status: 403 });
    }

    // Rapports générés avant la conservation en base : leur trace subsiste,
    // mais le fichier a disparu avec le conteneur. On le dit explicitement
    // plutôt que de renvoyer un document vide.
    if (!doc.contenu) {
      return NextResponse.json(
        {
          message:
            "Ce document a été généré avant la mise en place de l'archivage et n'est plus disponible. Régénérez-le pour en obtenir une nouvelle version.",
        },
        { status: 410 }
      );
    }

    const apercu = new URL(req.url).searchParams.get("apercu") === "1";
    return new NextResponse(new Uint8Array(doc.contenu), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `${apercu ? "inline" : "attachment"}; filename="${doc.cheminFichier}"`,
      },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

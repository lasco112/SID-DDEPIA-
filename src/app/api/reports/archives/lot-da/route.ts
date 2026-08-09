/**
 * GET /api/reports/archives/lot-da?periodeId=... — récupère en une seule fois
 * la DERNIÈRE version du rapport de chacun des six arrondissements, dans une
 * archive ZIP. Réservé au DD.
 *
 * Utilise pizzip, déjà présent pour la génération des .docx : inutile
 * d'ajouter une dépendance pour cela.
 */
import { NextResponse } from "next/server";
import PizZip from "pizzip";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const periodeId = new URL(req.url).searchParams.get("periodeId");
    if (!periodeId) return NextResponse.json({ message: "Période non précisée." }, { status: 400 });

    const periode = await db.periodeReporting.findUnique({ where: { id: periodeId } });
    if (!periode || periode.mois == null) {
      return NextResponse.json({ message: "Période mensuelle introuvable." }, { status: 404 });
    }

    // Deux temps volontairement : on repère d'abord la dernière version de
    // chaque arrondissement SANS charger les fichiers, puis on ne lit que
    // celles-là. Lire d'un coup toutes les versions ferait entrer plusieurs
    // dizaines de Mo en mémoire pour n'en garder que six.
    const entetes = await db.exportDocument.findMany({
      where: { periodeId, type: "RAPPORT_DA_DOCX", contenu: { not: null }, arrondissementId: { not: null } },
      orderBy: { version: "desc" },
      select: { id: true, arrondissementId: true },
    });
    const retenus = new Map<string, string>(); // arrondissementId -> documentId
    for (const e of entetes) {
      if (e.arrondissementId && !retenus.has(e.arrondissementId)) retenus.set(e.arrondissementId, e.id);
    }

    const documents = retenus.size
      ? await db.exportDocument.findMany({
          where: { id: { in: Array.from(retenus.values()) } },
          select: { cheminFichier: true, contenu: true },
        })
      : [];

    const zip = new PizZip();
    const dejaPris = new Set<string>();
    for (const d of documents) {
      if (!d.contenu) continue;
      dejaPris.add(d.cheminFichier);
      zip.file(d.cheminFichier, d.contenu);
    }

    if (dejaPris.size === 0) {
      return NextResponse.json(
        { message: "Aucun rapport d'arrondissement disponible pour cette période. Les DA doivent d'abord générer le leur." },
        { status: 404 }
      );
    }

    const buf = zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
    const nom = `Rapports_DA_DDEPIA-Menoua_${periode.annee}-${String(periode.mois).padStart(2, "0")}.zip`;

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "EXPORT",
        entite: "ExportDocument",
        details: { type: "LOT_RAPPORTS_DA", periodeId, nombre: dejaPris.size },
      },
    });

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${nom}"` },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

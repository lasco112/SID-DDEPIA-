/**
 * POST /api/reports/generate — génération du rapport mensuel (.docx).
 * ---------------------------------------------------------------------------
 * body: { periodeId, type: "DD" | "DA" }
 *  - DD : monopole du rôle DD (CDC §A.2), bloqué si le workflow est incomplet
 *    (rapports non soumis, sections non validées).
 *  - DA : chaque DA génère SON rapport, une fois SON rapport soumis.
 * Archivage versionné + hash SHA-256 + audit (CDC §9.1/§13).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { verifierCompletudeDD, genererPayloadDD, genererPayloadDA, rendreDocx } from "@/server/export/rapport-docx";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { periodeId, type } = (await req.json()) as { periodeId: string; type: "DD" | "DA" | "EXACT" };

    const periode = await db.periodeReporting.findUnique({ where: { id: periodeId } });
    if (!periode || periode.type !== "MENSUEL" || periode.mois == null) {
      return NextResponse.json({ message: "Période mensuelle introuvable" }, { status: 404 });
    }

    let buf: Buffer;
    let fileNameBase: string;
    let exportType: "RAPPORT_DD_DOCX" | "RAPPORT_DA_DOCX" | "RAPPORT_EXACT_DOCX";

    if (type === "DD" || type === "EXACT") {
      assertRole(user, ["DD"]);
      const completude = await verifierCompletudeDD(periodeId);
      if (!completude.complet) {
        return NextResponse.json(
          { message: "Génération impossible : workflow incomplet.", ...completude },
          { status: 409 }
        );
      }
      const payload = await genererPayloadDD(periodeId, type !== "EXACT");
      if (type === "DD") {
        buf = await rendreDocx("rapport_mensuel_DD.docx", payload);
        fileNameBase = `Rapport_Mensuel_DDEPIA-Menoua_${periode.annee}-${String(periode.mois).padStart(2, "0")}`;
        exportType = "RAPPORT_DD_DOCX";
      } else {
        buf = await rendreDocx("rapport_mensuel_exact.docx", payload);
        fileNameBase = `Fiche_Collecte_DDEPIA-Menoua_${periode.annee}-${String(periode.mois).padStart(2, "0")}`;
        exportType = "RAPPORT_EXACT_DOCX";
      }
    } else {
      assertRole(user, ["DA"]);
      if (!user.arrondissementId) {
        return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
      }
      const rapport = await db.rapportArrondissement.findUnique({
        where: { periodeId_arrondissementId: { periodeId, arrondissementId: user.arrondissementId } },
        include: { arrondissement: true },
      });
      if (!rapport || (rapport.statut !== "SOUMIS" && rapport.statut !== "CLOTURE")) {
        return NextResponse.json({ message: "Votre rapport doit être soumis avant de générer le document." }, { status: 409 });
      }
      const payload = await genererPayloadDA(periodeId, rapport.arrondissement.code, rapport.arrondissement.nom);
      buf = await rendreDocx("rapport_mensuel_DA.docx", payload);
      fileNameBase = `Rapport_Mensuel_${rapport.arrondissement.nom}_${periode.annee}-${String(periode.mois).padStart(2, "0")}`;
      exportType = "RAPPORT_DA_DOCX";
    }

    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    const version = (await db.exportDocument.count({ where: { periodeId, type: exportType } })) + 1;
    const fileName = `${fileNameBase}_v${version}.docx`;
    const outDir = path.join(process.cwd(), "storage", "exports");
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, fileName);
    await fs.writeFile(outPath, buf);

    await db.$transaction([
      db.exportDocument.create({ data: { type: exportType, periodeId, auteurId: user.id, version, cheminFichier: outPath, hashSha256: hash } }),
      db.auditLog.create({ data: { userId: user.id, action: "EXPORT", entite: "ExportDocument", details: { type: exportType, periodeId, version, hash } } }),
    ]);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * GET /api/exports/drepia?periodeId= — export DREPIA (.xlsx), monopole DD
 * (CDC §A.5). Archivage versionné + hash SHA-256 + audit (CDC §9.1/§13).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { genererExportDrepia } from "@/server/export/drepia-xlsx";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const { searchParams } = new URL(req.url);
    const periodeId = searchParams.get("periodeId");
    if (!periodeId) return NextResponse.json({ message: "periodeId requis" }, { status: 400 });

    const periode = await db.periodeReporting.findUnique({ where: { id: periodeId } });
    if (!periode) return NextResponse.json({ message: "Période introuvable" }, { status: 404 });

    const buf = await genererExportDrepia(periodeId);
    const hash = crypto.createHash("sha256").update(buf).digest("hex");

    const version = (await db.exportDocument.count({ where: { periodeId, type: "EXPORT_DREPIA_XLSX" } })) + 1;
    const fileName = `Export_DREPIA_Menoua_${periode.annee}-${String(periode.mois ?? 0).padStart(2, "0")}_v${version}.xlsx`;
    const outDir = path.join(process.cwd(), "storage", "exports");
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, fileName);
    await fs.writeFile(outPath, buf);

    await db.$transaction([
      db.exportDocument.create({
        data: { type: "EXPORT_DREPIA_XLSX", periodeId, auteurId: user.id, version, cheminFichier: outPath, hashSha256: hash },
      }),
      db.auditLog.create({
        data: { userId: user.id, action: "EXPORT", entite: "ExportDocument", details: { type: "EXPORT_DREPIA_XLSX", periodeId, version, hash } },
      }),
    ]);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

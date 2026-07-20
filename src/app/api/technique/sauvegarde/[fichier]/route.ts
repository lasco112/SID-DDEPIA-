/**
 * GET /api/technique/sauvegarde/[fichier] — télécharge un fichier de
 * sauvegarde existant. Nom de fichier strictement validé (pas de traversée
 * de répertoire).
 */
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

const DOSSIER_BACKUPS = path.join(process.cwd(), "storage", "backups");
const NOM_VALIDE = /^backup_[0-9TZ\-]+\.sql$/;

export async function GET(_req: Request, { params }: { params: { fichier: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["ADMIN_TECH"]);

    if (!NOM_VALIDE.test(params.fichier)) {
      return NextResponse.json({ message: "Nom de fichier invalide" }, { status: 400 });
    }

    const cheminFichier = path.join(DOSSIER_BACKUPS, params.fichier);
    const buf = await fs.readFile(cheminFichier);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/sql",
        "Content-Disposition": `attachment; filename="${params.fichier}"`,
      },
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ message: "Fichier introuvable" }, { status: 404 });
    }
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

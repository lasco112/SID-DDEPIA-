/**
 * GET/POST /api/technique/sauvegarde — déclenchement et suivi des
 * sauvegardes de la base de données (pg_dump), réservé à ADMIN_TECH.
 * Fichiers écrits dans storage/backups/, jamais supprimés automatiquement.
 */
import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { db } from "@/lib/db";

const execFileAsync = promisify(execFile);

// Chemin de pg_dump — à adapter si l'installation PostgreSQL change de version/emplacement.
const PG_DUMP_PATH = process.env.PG_DUMP_PATH || "C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe";
const DOSSIER_BACKUPS = path.join(process.cwd(), "storage", "backups");

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["ADMIN_TECH"]);

    await fs.mkdir(DOSSIER_BACKUPS, { recursive: true });
    const fichiers = await fs.readdir(DOSSIER_BACKUPS);
    const sauvegardes = await Promise.all(
      fichiers
        .filter((f) => f.endsWith(".sql"))
        .map(async (f) => {
          const s = await fs.stat(path.join(DOSSIER_BACKUPS, f));
          return { fichier: f, tailleOctets: s.size, dateCreation: s.mtime.toISOString() };
        })
    );
    sauvegardes.sort((a, b) => b.dateCreation.localeCompare(a.dateCreation));

    return NextResponse.json({ sauvegardes });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST() {
  try {
    const user = await requireUser();
    assertRole(user, ["ADMIN_TECH"]);

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ message: "DATABASE_URL non configurée." }, { status: 500 });
    }

    // Prisma ajoute des paramètres (ex. ?schema=public) que libpq/pg_dump ne
    // comprend pas comme paramètre de requête URI — on l'extrait pour le
    // passer en option -n séparée, et on nettoie l'URL de connexion.
    const url = new URL(process.env.DATABASE_URL);
    const schema = url.searchParams.get("schema") || "public";
    url.search = "";
    const connectionString = url.toString();

    await fs.mkdir(DOSSIER_BACKUPS, { recursive: true });
    const horodatage = new Date().toISOString().replace(/[:.]/g, "-");
    const nomFichier = `backup_${horodatage}.sql`;
    const cheminFichier = path.join(DOSSIER_BACKUPS, nomFichier);

    try {
      await execFileAsync(
        PG_DUMP_PATH,
        [connectionString, "-n", schema, "-f", cheminFichier, "--no-owner", "--no-privileges"],
        { timeout: 120_000 }
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Échec de pg_dump";
      return NextResponse.json({ message: `Échec de la sauvegarde : ${message}` }, { status: 500 });
    }

    const stats = await fs.stat(cheminFichier);
    if (stats.size === 0) {
      return NextResponse.json({ message: "La sauvegarde a produit un fichier vide — vérifiez la configuration." }, { status: 500 });
    }

    await db.auditLog.create({
      data: { userId: user.id, action: "SAUVEGARDE_BASE", entite: "Database", details: { fichier: nomFichier, tailleOctets: stats.size } },
    });

    return NextResponse.json({ fichier: nomFichier, tailleOctets: stats.size, dateCreation: stats.mtime.toISOString() });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

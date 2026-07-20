/**
 * GET /api/technique/sante — indicateur de santé du système, réservé à
 * ADMIN_TECH (CDC §A.2 : outillage technique, aucune donnée métier exposée
 * au-delà de simples compteurs).
 */
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["ADMIN_TECH"]);

    const debut = Date.now();
    let dbOk = true;
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }
    const latenceMs = Date.now() - debut;

    const [utilisateurs, arrondissements, rapports, saisiesMatrice, saisiesNominative, saisiesEvenement, auditLogs] = await Promise.all([
      db.user.count(),
      db.arrondissement.count(),
      db.rapportArrondissement.count(),
      db.saisieMatrice.count(),
      db.saisieNominative.count(),
      db.saisieEvenement.count(),
      db.auditLog.count(),
    ]);

    let dernierBackup: { fichier: string; dateModification: string; tailleOctets: number } | null = null;
    try {
      const dossier = path.join(process.cwd(), "storage", "backups");
      const fichiers = await fs.readdir(dossier);
      const sqlFichiers = fichiers.filter((f) => f.endsWith(".sql"));
      if (sqlFichiers.length > 0) {
        const stats = await Promise.all(
          sqlFichiers.map(async (f) => ({ f, s: await fs.stat(path.join(dossier, f)) }))
        );
        stats.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
        const plusRecent = stats[0];
        dernierBackup = {
          fichier: plusRecent.f,
          dateModification: plusRecent.s.mtime.toISOString(),
          tailleOctets: plusRecent.s.size,
        };
      }
    } catch {
      // dossier pas encore créé — aucune sauvegarde
    }

    return NextResponse.json({
      db: { ok: dbOk, latenceMs },
      compteurs: { utilisateurs, arrondissements, rapports, saisiesMatrice, saisiesNominative, saisiesEvenement, auditLogs },
      dernierBackup,
      serveur: { heureServeur: new Date().toISOString(), nodeVersion: process.version },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * POST /api/etablissements/repertoire — importer un RÉPERTOIRE DES ACTEURS EPIA
 * (fichier Word du canevas régional) dans le registre d'un arrondissement
 * (demande du Délégué, 12 novembre 2026). Règles :
 * src/server/etablissements/importRepertoire.ts.
 *
 *   multipart  { fichier, arrondissementId }            → l'ANALYSE, rien n'est écrit
 *   JSON       { arrondissementId, fichier, lignes[] }  → l'INSCRIPTION des lignes gardées
 *
 * Le DD : un arrondissement de son département (relu dans le département) ;
 * le DA : le sien, quoi qu'il envoie.
 */
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { lireRepertoire } from "@/server/etablissements/lectureRepertoire";
import { analyserRepertoire, inscrireRepertoire } from "@/server/etablissements/importRepertoire";

const TAILLE_MAX = 15 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD"]);
    const db = user.db as PrismaClient;
    const arrondissementDe = (demande: unknown) =>
      user.role === "DD" ? (typeof demande === "string" ? demande : "") : user.arrondissementId ?? "";

    if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      const form = await req.formData();
      const fichier = form.get("fichier");
      if (!(fichier instanceof File)) return NextResponse.json({ message: "Choisissez le fichier Word du répertoire." }, { status: 400 });
      if (fichier.size > TAILLE_MAX) return NextResponse.json({ message: "Fichier trop lourd (15 Mo au plus)." }, { status: 400 });
      if (!/\.docx$/i.test(fichier.name)) return NextResponse.json({ message: "Le répertoire doit être un fichier Word (.docx). Un ancien .doc : ouvrez-le dans Word et « Enregistrer sous » .docx." }, { status: 400 });
      let lecture;
      try {
        lecture = lireRepertoire(Buffer.from(await fichier.arrayBuffer()));
      } catch {
        return NextResponse.json({ message: "Ce fichier Word n'a pas pu être lu." }, { status: 400 });
      }
      const propositions = await analyserRepertoire(db, arrondissementDe(form.get("arrondissementId")), lecture.lignes);
      if (!propositions) return NextResponse.json({ message: "Cet arrondissement n'appartient pas à votre département." }, { status: 403 });
      return NextResponse.json({ fichier: fichier.name, filieres: lecture.filieres, propositions });
    }

    const body = (await req.json().catch(() => ({}))) as { arrondissementId?: unknown; fichier?: unknown; lignes?: unknown };
    const r = await inscrireRepertoire(
      db,
      { id: user.id, username: user.username },
      arrondissementDe(body.arrondissementId),
      body.lignes,
      typeof body.fichier === "string" ? body.fichier : "répertoire"
    );
    if (!r) return NextResponse.json({ message: "Cet arrondissement n'appartient pas à votre département." }, { status: 403 });
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === "Liste illisible.") return NextResponse.json({ message: e.message }, { status: 400 });
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

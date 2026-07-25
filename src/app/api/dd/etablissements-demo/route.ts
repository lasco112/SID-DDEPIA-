/**
 * GET/POST /api/dd/etablissements-demo — suppression EN UNE FOIS de tous les
 * établissements de démonstration, réservée au DD.
 *
 * Pourquoi cette route existe : le registre (/etablissements) n'affiche qu'un
 * seul type ET un seul arrondissement à la fois, soit 4 × 6 = 24 combinaisons
 * à parcourir. Supprimer les jeux de démonstration à la main obligeait donc à
 * penser à chacune ; en pratique un onglet était oublié (typiquement les
 * fermes de ponte, alors que l'onglet ouvert par défaut est « Couvoirs »),
 * et les établissements restants réapparaissaient chez les DA — qui, eux,
 * voient tous les types dans leurs tableaux de saisie.
 *
 * GET renvoie la liste de ce qui serait supprimé (aucune modification), POST
 * exécute la suppression dans une transaction unique + trace un AuditLog.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

/** Les jeux de démonstration sont tous suffixés « (DÉMO) » par prisma/seed-demo.ts. */
const FILTRE_DEMO = {
  OR: [
    { nom: { contains: "DÉMO", mode: "insensitive" as const } },
    { nom: { contains: "DEMO", mode: "insensitive" as const } },
  ],
};

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const etablissements = await db.etablissement.findMany({
      where: FILTRE_DEMO,
      include: { arrondissement: { select: { nom: true } } },
      orderBy: [{ typeCode: "asc" }, { nom: "asc" }],
    });

    const ids = etablissements.map((e) => e.id);
    const saisies = ids.length ? await db.saisieNominative.count({ where: { etablissementId: { in: ids } } }) : 0;

    return NextResponse.json({
      total: etablissements.length,
      saisiesLiees: saisies,
      etablissements: etablissements.map((e) => ({
        id: e.id,
        nom: e.nom,
        typeCode: e.typeCode,
        arrondissement: e.arrondissement.nom,
      })),
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const { confirmation } = (await req.json().catch(() => ({}))) as { confirmation?: string };
    if (confirmation !== "SUPPRIMER") {
      return NextResponse.json({ message: "Confirmation invalide." }, { status: 400 });
    }

    const etablissements = await db.etablissement.findMany({ where: FILTRE_DEMO, select: { id: true, nom: true } });
    const ids = etablissements.map((e) => e.id);
    if (ids.length === 0) return NextResponse.json({ ok: true, supprimes: 0, saisiesSupprimees: 0 });

    const saisies = await db.saisieNominative.count({ where: { etablissementId: { in: ids } } });

    await db.$transaction([
      db.correction.deleteMany({ where: { saisieNominative: { etablissementId: { in: ids } } } }),
      db.saisieNominative.deleteMany({ where: { etablissementId: { in: ids } } }),
      db.etablissement.deleteMany({ where: { id: { in: ids } } }),
    ]);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "SUPPRESSION_ETABLISSEMENTS_DEMO",
        entite: "Etablissement",
        entiteId: "lot-demo",
        details: { supprimes: ids.length, saisiesSupprimees: saisies, noms: etablissements.map((e) => e.nom) },
      },
    });

    return NextResponse.json({ ok: true, supprimes: ids.length, saisiesSupprimees: saisies });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

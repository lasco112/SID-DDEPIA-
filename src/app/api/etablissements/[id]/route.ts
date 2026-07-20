/**
 * PATCH /api/etablissements/[id] — renommer / corriger / (dés)activer un
 * établissement du registre. Jamais de suppression définitive (§A.7 règle 1).
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD"]);

    const etablissement = await db.etablissement.findUnique({ where: { id: params.id } });
    if (!etablissement) return NextResponse.json({ message: "Établissement introuvable" }, { status: 404 });

    if (user.role === "DA" && etablissement.arrondissementId !== user.arrondissementId) {
      return NextResponse.json({ message: "Cet établissement n'est pas dans votre arrondissement." }, { status: 403 });
    }

    const body = (await req.json()) as {
      nom?: string;
      localite?: string;
      proprietaire?: string | null;
      telephone?: string | null;
      actif?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (body.nom !== undefined) {
      if (!body.nom.trim()) return NextResponse.json({ message: "Le nom ne peut pas être vide" }, { status: 400 });
      data.nom = body.nom.trim();
    }
    if (body.localite !== undefined) {
      if (!body.localite.trim()) return NextResponse.json({ message: "La localité ne peut pas être vide" }, { status: 400 });
      data.localite = body.localite.trim();
    }
    if (body.proprietaire !== undefined) data.proprietaire = body.proprietaire?.trim() || null;
    if (body.telephone !== undefined) data.telephone = body.telephone?.trim() || null;
    if (body.actif !== undefined) data.actif = body.actif;

    const mis_a_jour = await db.etablissement.update({ where: { id: params.id }, data });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "MODIFICATION_ETABLISSEMENT",
        entite: "Etablissement",
        entiteId: mis_a_jour.id,
        details: { avant: { nom: etablissement.nom, localite: etablissement.localite, proprietaire: etablissement.proprietaire, telephone: etablissement.telephone, actif: etablissement.actif }, apres: data } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ etablissement: mis_a_jour });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

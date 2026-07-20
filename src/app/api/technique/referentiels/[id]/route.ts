/**
 * PATCH /api/technique/referentiels/[id] — renommer ou (dés)activer un
 * item de référentiel. Jamais de suppression définitive (§A.7 règle 1) : le
 * code reste stable, seul actif/disabledAt change.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["ADMIN_TECH"]);

    const item = await db.referentielItem.findUnique({ where: { id: params.id } });
    if (!item) return NextResponse.json({ message: "Item introuvable" }, { status: 404 });

    const body = (await req.json()) as { libelle?: string; libelleEn?: string | null; actif?: boolean };
    const data: Record<string, unknown> = {};
    if (body.libelle !== undefined) {
      if (!body.libelle.trim()) return NextResponse.json({ message: "Le libellé ne peut pas être vide" }, { status: 400 });
      data.libelle = body.libelle.trim();
    }
    if (body.libelleEn !== undefined) data.libelleEn = body.libelleEn?.trim() || null;
    if (body.actif !== undefined) {
      data.actif = body.actif;
      data.disabledAt = body.actif ? null : new Date();
    }

    const mis_a_jour = await db.referentielItem.update({ where: { id: params.id }, data });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "MODIFICATION_REFERENTIEL",
        entite: "ReferentielItem",
        entiteId: mis_a_jour.id,
        details: { categorie: item.categorie, code: item.code, avant: { libelle: item.libelle, actif: item.actif }, apres: data as any },
      },
    });

    return NextResponse.json({ item: mis_a_jour });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

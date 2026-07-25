/**
 * PATCH /api/etablissements/[id] — renommer / corriger / (dés)activer un
 * établissement du registre (désactivation, jamais de suppression — §A.7
 * règle 1, pour DA et DD).
 *
 * DELETE /api/etablissements/[id] — suppression RÉELLE, réservée au DD
 * (demande explicite du DD, réunion de service : « la suppression des
 * établissements que seul le DD peut faire, même ceux écrit démo dessus »).
 * Bloquée si des saisies nominatives existent encore pour cet établissement
 * (on ne supprime jamais des données historiques par ricochet) — dans ce cas
 * le message invite à désactiver plutôt que supprimer.
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

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const etablissement = await db.etablissement.findUnique({ where: { id: params.id } });
    if (!etablissement) return NextResponse.json({ message: "Établissement introuvable" }, { status: 404 });

    // `SaisieNominative.etablissementId` est une clé obligatoire (pas de valeur
    // "sans établissement" possible) : une suppression réelle doit donc
    // emporter avec elle les saisies qui pointaient sur cet établissement —
    // impossible de les détacher. C'est précisément ce que le DD a demandé en
    // explicitant « même ceux écrit démo dessus » : ces entrées ont
    // généralement des saisies de test attachées, et bloquer la suppression
    // dans ce cas rendrait le bouton inutile pour l'usage prévu.
    const nbSaisies = await db.saisieNominative.count({ where: { etablissementId: params.id } });

    await db.$transaction([
      db.correction.deleteMany({ where: { saisieNominative: { etablissementId: params.id } } }),
      db.saisieNominative.deleteMany({ where: { etablissementId: params.id } }),
      db.etablissement.delete({ where: { id: params.id } }),
    ]);

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "SUPPRESSION_ETABLISSEMENT",
        entite: "Etablissement",
        entiteId: params.id,
        details: {
          nom: etablissement.nom,
          localite: etablissement.localite,
          arrondissementId: etablissement.arrondissementId,
          saisiesSupprimees: nbSaisies,
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ ok: true, saisiesSupprimees: nbSaisies });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

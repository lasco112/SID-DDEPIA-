/**
 * PATCH /api/etablissements/[id] — renommer / corriger / (dés)activer un
 * établissement du registre (désactivation, jamais de suppression — §A.7
 * règle 1, pour DA et DD).
 *
 * DELETE /api/etablissements/[id] — suppression RÉELLE. Ouverte au DD, au DA
 * et à l'agent de saisie (élargissement demandé par le DD : les agents créent
 * eux-mêmes leurs établissements pendant la saisie et doivent pouvoir
 * corriger un doublon ou une erreur sans remonter au DD).
 *
 * CLOISONNEMENT : le DA et l'agent ne peuvent supprimer QUE dans leur propre
 * arrondissement (§A.2) — seul le DD agit sur les six. La suppression emporte
 * les saisies nominatives rattachées, `SaisieNominative.etablissementId` étant
 * une clé obligatoire qu'on ne peut pas détacher.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD", "AGENT_SAISIE"]);

    const etablissement = await db.etablissement.findUnique({ where: { id: params.id } });
    if (!etablissement) return NextResponse.json({ message: "Établissement introuvable" }, { status: 404 });

    if (user.role !== "DD" && etablissement.arrondissementId !== user.arrondissementId) {
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
    assertRole(user, ["DD", "DA", "AGENT_SAISIE"]);

    const etablissement = await db.etablissement.findUnique({ where: { id: params.id } });
    if (!etablissement) return NextResponse.json({ message: "Établissement introuvable" }, { status: 404 });

    // Cloisonnement par arrondissement : contrôle refait ICI, côté serveur, et
    // pas seulement dans l'interface — un appel direct à l'API ne doit jamais
    // permettre à un DA ou à un agent de toucher l'arrondissement d'un autre.
    if (user.role !== "DD" && etablissement.arrondissementId !== user.arrondissementId) {
      return NextResponse.json({ message: "Cet établissement n'est pas dans votre arrondissement." }, { status: 403 });
    }

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

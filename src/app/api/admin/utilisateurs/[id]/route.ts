/**
 * DELETE /api/admin/utilisateurs/[id] — suppression RÉELLE d'un compte,
 * réservée au DD (demande explicite du DD, réunion de service : « la
 * suppression des comptes par le DD »). La désactivation (POST .../statut)
 * reste le chemin recommandé au quotidien ; celle-ci sert au DD pour
 * nettoyer un compte pour de bon (ex : compte de test créé par erreur).
 *
 * Les données STATISTIQUES déjà transmises (saisies, rapports soumis,
 * validations, synthèses) ne sont jamais supprimées : seule la référence
 * « qui l'a saisi/soumis/validé » est détachée (mise à null), puisque ce
 * champ est optionnel dans le schéma. Seules les traces qui n'ont de sens
 * qu'en tant qu'action DE ce compte (corrections qu'il a proposées, exports
 * qu'il a générés, questions d'aide qu'il a posées, attributions qu'il a
 * faites ou reçues) sont supprimées avec lui, car leur clé d'auteur est
 * obligatoire et ne peut pas être mise à null.
 *
 * Toujours interdite : suppression de son propre compte, et suppression du
 * dernier compte DD actif (le système doit toujours garder au moins un DD).
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireUser();
    assertRole(admin, ["DD"]);

    if (params.id === admin.id) {
      return NextResponse.json({ message: "Vous ne pouvez pas supprimer votre propre compte." }, { status: 400 });
    }

    const cible = await admin.db.user.findUnique({ where: { id: params.id } });
    if (!cible) return NextResponse.json({ message: "Compte introuvable." }, { status: 404 });

    if (cible.role === "DD") {
      const nbDD = await admin.db.user.count({ where: { role: "DD", actif: true } });
      if (nbDD <= 1) {
        return NextResponse.json({ message: "Impossible de supprimer le dernier compte Délégué Départemental actif." }, { status: 400 });
      }
    }

    // Une suppression de compte laissée à moitié faite est bien pire qu'une
    // suppression refusée : la forme en tableau n'étant plus atomique une fois
    // le client cloisonné, la séquence passe par la transaction de la session.
    await admin.transaction(async (tx) => {
      // Traces à supprimer (clé d'auteur obligatoire, ne peut pas être détachée)
      await tx.correction.deleteMany({ where: { auteurId: params.id } });
      await tx.exportDocument.deleteMany({ where: { auteurId: params.id } });
      await tx.demandeAide.deleteMany({ where: { userId: params.id } });
      await tx.assignationSaisie.deleteMany({ where: { OR: [{ assignePar: params.id }, { agentId: params.id }] } });
      await tx.notification.deleteMany({ where: { destinataireId: params.id } });
      // Données statistiques conservées, référence d'auteur détachée
      await tx.saisieMatrice.updateMany({ where: { saisiParId: params.id }, data: { saisiParId: null } });
      await tx.saisieNominative.updateMany({ where: { saisiParId: params.id }, data: { saisiParId: null } });
      await tx.saisieEvenement.updateMany({ where: { saisiParId: params.id }, data: { saisiParId: null } });
      await tx.rapportArrondissement.updateMany({ where: { soumisParId: params.id }, data: { soumisParId: null } });
      await tx.validationSection.updateMany({ where: { valideParId: params.id }, data: { valideParId: null } });
      await tx.syntheseSection.updateMany({ where: { auteurId: params.id }, data: { auteurId: null } });
      await tx.referentielItem.updateMany({ where: { proposeParId: params.id }, data: { proposeParId: null } });
      await tx.referentielItem.updateMany({ where: { valideParDDId: params.id }, data: { valideParDDId: null } });
      await tx.configSysteme.updateMany({ where: { modifieParId: params.id }, data: { modifieParId: null } });
      await tx.auditLog.updateMany({ where: { userId: params.id }, data: { userId: null } });
      await tx.user.delete({ where: { id: params.id } });
    });

    await admin.db.auditLog.create({
      data: {
        userId: admin.id,
        action: "SUPPRESSION_COMPTE",
        entite: "User",
        entiteId: params.id,
        details: { nom: cible.nom, username: cible.username, role: cible.role },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

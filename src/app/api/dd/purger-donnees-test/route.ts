/**
 * GET/POST /api/dd/purger-donnees-test — purge des données de test avant
 * mise en production réelle, demandée explicitement par le DD.
 *
 * Portée volontairement limitée aux données TRANSACTIONNELLES de test :
 * saisies, corrections, rapports, validations, synthèses, exports générés,
 * notifications. Ne touche JAMAIS les comptes utilisateurs, arrondissements,
 * sections, tableaux/champs du canevas, établissements ni référentiels — le
 * système reste utilisable immédiatement après, sans reconfiguration.
 *
 * GET renvoie un décompte (pour affichage avant confirmation), POST exécute
 * la suppression dans une seule transaction atomique + trace un AuditLog.
 */
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

// Le client est reçu en paramètre : cette fonction est hors handler, aucune
// session n en est visible. Lui faire importer `db` la laisserait en dehors du
// cloisonnement par département.
async function compter(db: PrismaClient) {
  const [saisiesMatrice, saisiesNominatives, saisiesEvenement, rapports, validations, syntheses, corrections, exports, notifications] =
    await Promise.all([
      db.saisieMatrice.count(),
      db.saisieNominative.count(),
      db.saisieEvenement.count(),
      db.rapportArrondissement.count(),
      db.validationSection.count(),
      db.syntheseSection.count(),
      db.correction.count(),
      db.exportDocument.count(),
      db.notification.count(),
    ]);
  return {
    saisies: saisiesMatrice + saisiesNominatives + saisiesEvenement,
    rapports,
    validations,
    syntheses,
    corrections,
    exports,
    notifications,
  };
}

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    return NextResponse.json(await compter(user.db));
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

    const avant = await compter(user.db);

    // Une purge interrompue au milieu laisserait des saisies orphelines de leur
    // rapport : la séquence doit réussir ou échouer d'un bloc.
    await user.transaction(async (tx) => {
      await tx.correction.deleteMany({});
      await tx.syntheseSection.deleteMany({});
      await tx.validationSection.deleteMany({});
      await tx.exportDocument.deleteMany({});
      await tx.notification.deleteMany({});
      await tx.saisieMatrice.deleteMany({});
      await tx.saisieNominative.deleteMany({});
      await tx.saisieEvenement.deleteMany({});
      await tx.rapportArrondissement.deleteMany({});
    });

    // Marqueur horodaté lu par /api/bootstrap : sans lui, la purge ne vidait
    // que le serveur, et chaque téléphone gardait ses brouillons locaux « en
    // attente de synchronisation » — qui étaient RENVOYÉS au serveur à la
    // reconnexion, recréant les données qu'on venait de purger. Les appareils
    // comparent cette date à la leur et vident leur base locale d'eux-mêmes.
    const purgeLe = new Date().toISOString();
    await user.db.configSysteme.upsert({
      where: { cle: "donnees_purgees_le" },
      create: { cle: "donnees_purgees_le", valeur: purgeLe, modifieParId: user.id },
      update: { valeur: purgeLe, modifieParId: user.id },
    });

    await user.db.auditLog.create({
      data: {
        userId: user.id,
        action: "PURGE_DONNEES_TEST",
        entite: "Systeme",
        entiteId: "global",
        details: avant as any,
      },
    });

    return NextResponse.json({ ok: true, supprime: avant });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

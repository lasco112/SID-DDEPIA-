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
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

async function compter() {
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
    return NextResponse.json(await compter());
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

    const avant = await compter();

    await db.$transaction([
      db.correction.deleteMany({}),
      db.syntheseSection.deleteMany({}),
      db.validationSection.deleteMany({}),
      db.exportDocument.deleteMany({}),
      db.notification.deleteMany({}),
      db.saisieMatrice.deleteMany({}),
      db.saisieNominative.deleteMany({}),
      db.saisieEvenement.deleteMany({}),
      db.rapportArrondissement.deleteMany({}),
    ]);

    // Marqueur horodaté lu par /api/bootstrap : sans lui, la purge ne vidait
    // que le serveur, et chaque téléphone gardait ses brouillons locaux « en
    // attente de synchronisation » — qui étaient RENVOYÉS au serveur à la
    // reconnexion, recréant les données qu'on venait de purger. Les appareils
    // comparent cette date à la leur et vident leur base locale d'eux-mêmes.
    const purgeLe = new Date().toISOString();
    await db.configSysteme.upsert({
      where: { cle: "donnees_purgees_le" },
      create: { cle: "donnees_purgees_le", valeur: purgeLe, modifieParId: user.id },
      update: { valeur: purgeLe, modifieParId: user.id },
    });

    await db.auditLog.create({
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

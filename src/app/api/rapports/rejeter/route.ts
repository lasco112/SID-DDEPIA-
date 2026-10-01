/**
 * POST /api/rapports/rejeter — renvoie le rapport d'un arrondissement au DA
 * pour correction (CDC §A.2). SOUMIS → REJETE → (le DA repasse en EN_SAISIE
 * dès sa prochaine synchronisation).
 *
 * Un chef de section le fait depuis son contrôle ; le DD depuis la
 * Supervision (décision du Délégué, 1er octobre 2026 : un DA dont une
 * correction n'a pas pu partir — rapport déjà transmis — doit pouvoir être
 * débloqué par lui).
 *
 * Seul un rapport TRANSMIS se renvoie, et jamais dans un mois clôturé. Après
 * le 28, le renvoi vaut aussi déverrouillage exceptionnel : sans cela le DA
 * retrouvait un rapport « à corriger » qu'il ne pouvait toujours pas envoyer.
 *
 * Aucune donnée saisie n'est touchée : seul le statut du rapport change.
 */
import { NextResponse } from "next/server";
import { notifierEvenement } from "@/server/notifications/evenements";
import type { PrismaClient } from "@prisma/client";
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { requireUser, assertRole, ROLES_CHEF, permissionErrorResponse } from "@/lib/permissions";

const NOM_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const db = user.db;
    assertRole(user, [...ROLES_CHEF, "DD"]);

    const { rapportId, motif } = (await req.json()) as { rapportId: string; motif: string };
    if (!motif?.trim()) {
      return NextResponse.json({ message: "Le motif de rejet est obligatoire." }, { status: 400 });
    }

    const existant = await db.rapportArrondissement.findUnique({
      where: { id: rapportId },
      include: { periode: { select: { id: true, mois: true, annee: true, statut: true } } },
    });
    if (!existant) {
      return NextResponse.json({ message: "Rapport introuvable." }, { status: 404 });
    }
    if (existant.statut !== "SOUMIS") {
      return NextResponse.json(
        { message: "Seul un rapport transmis peut être renvoyé : celui-ci est déjà entre les mains du DA." },
        { status: 409 }
      );
    }
    await assertPeriodeModifiable(db, existant.periodeId);

    const deverrouiller = existant.periode.statut === "VERROUILLEE_DA" && !existant.deverrouillePar;
    const rapport = await db.rapportArrondissement.update({
      where: { id: rapportId },
      data: {
        statut: "REJETE",
        motifRejet: motif,
        ...(deverrouiller
          ? { deverrouillePar: user.id, motifDeverrouillage: `Renvoi pour correction : ${motif}`, dateDeverrouillage: new Date() }
          : {}),
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "REJET",
        entite: "RapportArrondissement",
        entiteId: rapport.id,
        details: { motif, parLeDD: user.role === "DD", ...(deverrouiller ? { deverrouillage: true } : {}) },
      },
    });

    const mois = existant.periode.mois ? `${NOM_MOIS[existant.periode.mois - 1]} ${existant.periode.annee}` : String(existant.periode.annee);
    await notifierEvenement(
      db as PrismaClient,
      { arrondissementId: rapport.arrondissementId },
      {
        declencheur: "REJET",
        message: `Votre rapport de ${mois} vous a été renvoyé pour correction. Motif : ${motif}`,
        lien: "/da/saisie",
      }
    );

    return NextResponse.json({ rapport });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

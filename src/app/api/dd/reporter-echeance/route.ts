/**
 * PATCH /api/dd/reporter-echeance — le DD repousse la date limite de
 * soumission DA de la période mensuelle en cours (demande explicite du DD,
 * réunion de service : « je veux pouvoir repousser pour tout le monde... la
 * date de soumission des rapports »).
 *
 * Portée : « pour tout le monde » uniquement — la nouvelle date s'applique à
 * tous les arrondissements de la période active. Pour un report ciblé sur un
 * ou quelques arrondissements précis, le mécanisme existant de déverrouillage
 * exceptionnel (/api/periodes/deverrouiller, par rapport) reste la bonne
 * réponse : il permet déjà à un DA précis de soumettre après le verrouillage
 * général sans changer la date pour les autres.
 *
 * Si la période est déjà VERROUILLEE_DA et que la nouvelle date est future,
 * on la rouvre (OUVERTE) : repousser l'échéance doit rendre la saisie/
 * soumission possible à nouveau pour tous les DA qui n'avaient pas encore
 * soumis, sans qu'ils aient besoin d'un déverrouillage individuel.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const { dateLimiteDA } = (await req.json().catch(() => ({}))) as { dateLimiteDA?: string };
    if (!dateLimiteDA) {
      return NextResponse.json({ message: "Nouvelle date limite requise." }, { status: 400 });
    }
    const nouvelleDate = new Date(dateLimiteDA);
    if (Number.isNaN(nouvelleDate.getTime())) {
      return NextResponse.json({ message: "Date invalide." }, { status: 400 });
    }

    const periode = await db.periodeReporting.findFirst({
      where: { type: "MENSUEL" },
      orderBy: [{ annee: "desc" }, { mois: "desc" }],
    });
    if (!periode) return NextResponse.json({ message: "Aucune période active." }, { status: 404 });

    const rouvre = periode.statut === "VERROUILLEE_DA" && nouvelleDate.getTime() > Date.now();

    const mise_a_jour = await db.periodeReporting.update({
      where: { id: periode.id },
      data: {
        dateLimiteDA: nouvelleDate,
        ...(rouvre ? { statut: "OUVERTE" as const } : {}),
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "REPORT_ECHEANCE",
        entite: "PeriodeReporting",
        entiteId: periode.id,
        details: { avant: periode.dateLimiteDA, apres: nouvelleDate, reouverture: rouvre },
      },
    });

    return NextResponse.json({ periode: mise_a_jour, reouverte: rouvre });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

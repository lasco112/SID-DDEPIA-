/**
 * GET /api/dd/periodes/historique?periodeId=… — historique des opérations
 * d'une période mensuelle (CDC §14).
 *
 * Reconstitue le cycle de vie du mois : saisies reçues, corrections,
 * soumissions, validations (dont celles exercées par le DD), générations de
 * rapports, clôture et réouverture éventuelle. Alimenté par `AuditLog`, qui
 * enregistre déjà chacune de ces opérations.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

const LIBELLE_ACTION: Record<string, string> = {
  SYNC: "Envoi de données depuis un appareil",
  SOUMISSION: "Transmission du rapport d'arrondissement",
  CORRECTION: "Correction d'une donnée",
  VALIDATION_SECTION: "Validation d'une section",
  REJET: "Demande de correction",
  EXPORT: "Génération d'un document",
  DEVERROUILLAGE: "Déverrouillage exceptionnel",
  CLOTURE_PERIODE: "Clôture de la période",
  REOUVERTURE_PERIODE: "Réouverture de la période",
  REPORT_ECHEANCE: "Report de l'échéance de soumission",
};

/** Actions qui concernent le cycle du rapport mensuel. Le bruit (connexions, administration des comptes) est écarté. */
const ACTIONS_DU_CYCLE = Object.keys(LIBELLE_ACTION);

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db;

    const periodeId = new URL(req.url).searchParams.get("periodeId");
    if (!periodeId) return NextResponse.json({ message: "periodeId requis" }, { status: 400 });

    const periode = await db.periodeReporting.findUnique({
      where: { id: periodeId },
      include: { clotureePar: { select: { nom: true } } },
    });
    if (!periode) return NextResponse.json({ message: "Période introuvable." }, { status: 404 });

    // Le journal ne porte pas toujours le periodeId : on borne donc à la vie de
    // la période (de son ouverture à sa clôture, ou jusqu'à maintenant) et on
    // retient en plus tout ce qui la désigne explicitement.
    const fin = periode.clotureeLe && periode.statut === "ARCHIVEE" ? periode.clotureeLe : new Date();
    const entrees = await db.auditLog.findMany({
      where: {
        action: { in: ACTIONS_DU_CYCLE },
        OR: [
          { createdAt: { gte: periode.dateOuverture, lte: fin } },
          { entiteId: periodeId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { user: { select: { nom: true, role: true } } },
    });

    return NextResponse.json({
      periode: {
        mois: periode.mois,
        annee: periode.annee,
        statut: periode.statut,
        clotureeLe: periode.clotureeLe,
        clotureePar: periode.clotureePar?.nom ?? null,
        reouverteLe: periode.reouverteLe,
        motifReouverture: periode.motifReouverture,
      },
      evenements: entrees.map((e) => ({
        id: e.id,
        date: e.createdAt,
        action: e.action,
        libelle: LIBELLE_ACTION[e.action] ?? e.action,
        auteur: e.user?.nom ?? "—",
        role: e.user?.role ?? null,
        details: e.details,
      })),
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * POST /api/demo/reinitialiser — « Réinitialiser la démonstration » (§10.9),
 * depuis le bandeau d'une session de démonstration.
 *
 * Réservé au compte administrateur de la démonstration (demo.admin) : la
 * démonstration est partagée par tous les départements en formation, et un
 * participant ne doit pas effacer le travail des autres en pleine séance
 * (15 octobre 2026). Jamais un compte réel, jamais la production.
 *
 * La remise à zéro tourne en arrière-plan (voir server/demo/reinitialisation.ts).
 */
import { NextResponse } from "next/server";
import { requireUser, permissionErrorResponse, ForbiddenError } from "@/lib/permissions";
import { lancerReinitialisation } from "@/server/demo/reinitialisation";

export async function POST() {
  try {
    const user = await requireUser();
    if (!user.isDemo) {
      throw new ForbiddenError("Réinitialisation réservée à l'environnement de démonstration.");
    }
    if (user.role !== "ADMIN_TECH") {
      throw new ForbiddenError("Seul l'administrateur de la démonstration peut la remettre à zéro.");
    }
    if (!lancerReinitialisation()) {
      return NextResponse.json({ message: "Une remise à zéro est déjà en cours." }, { status: 409 });
    }
    return NextResponse.json({ message: "La démonstration se remet à zéro : environ une minute." });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

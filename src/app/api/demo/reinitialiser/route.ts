/**
 * POST /api/demo/reinitialiser — "Réinitialiser la démonstration" (§10.9).
 * ---------------------------------------------------------------------------
 * Réservé aux sessions démo (isDemo=true) : ni un compte réel, ni la
 * production ne peuvent jamais être affectés par cette route — vérifié
 * explicitement ci-dessous en plus du garde-fou déjà posé par le middleware.
 * Ré-exécute exactement le script de seed de démonstration (idempotent),
 * qui restaure le jeu de données initial (comptes, rapports, saisies).
 *
 * Dans le modèle "base démo partagée" retenu pour cette phase (§10.10,
 * solution de repli acceptée si le multi-session est trop complexe), une
 * réinitialisation restaure l'ÉTAT INITIAL POUR TOUT LE MONDE en démo — elle
 * n'affecte jamais les autres utilisateurs de la PRODUCTION, mais efface bien
 * les modifications des autres présentateurs démo en cours. Le bouton en
 * avertit explicitement (voir DemoBanner.tsx).
 */
import { NextResponse } from "next/server";
import { requireUser, permissionErrorResponse, ForbiddenError } from "@/lib/permissions";
import { reinitialiserDonneesDemo } from "../../../../../prisma/seed-demo";

export async function POST() {
  try {
    const user = await requireUser();
    if (!user.isDemo) {
      throw new ForbiddenError("Réinitialisation réservée à l'environnement de démonstration.");
    }
    await reinitialiserDonneesDemo();
    return NextResponse.json({ message: "Démonstration réinitialisée." });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

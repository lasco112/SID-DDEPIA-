/**
 * GET /api/periodes/active — période de travail de l'utilisateur courant.
 *
 * Renvoie la période qu'il a choisie dans le sélecteur (cookie), et à défaut
 * la plus récente encore ouverte. Utilisée par les pages de saisie, de
 * contrôle et de supervision pour connaître le periodeId à manipuler : c'est
 * elle qui garantit qu'une donnée saisie « pour juin » part bien dans juin.
 */
import { NextResponse } from "next/server";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";
import { resoudrePeriode, libellePeriode } from "@/server/periodes/courante";

export async function GET() {
  try {
    const user = await requireUser();
    const periode = await resoudrePeriode(user.db);
    if (!periode) {
      return NextResponse.json({ message: "Aucune période active" }, { status: 404 });
    }
    return NextResponse.json({ periode: { ...periode, libelle: libellePeriode(periode) } });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

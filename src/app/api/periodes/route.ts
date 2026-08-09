/**
 * GET /api/periodes — liste des périodes mensuelles, pour le sélecteur de
 * période de travail (CDC §1). Accessible à tout compte authentifié : chacun
 * doit pouvoir choisir le mois sur lequel il travaille.
 */
import { NextResponse } from "next/server";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";
import { listerPeriodes, libellePeriode, resoudrePeriode } from "@/server/periodes/courante";

export async function GET() {
  try {
    const user = await requireUser();
    const [periodes, courante] = await Promise.all([
      listerPeriodes(user.db),
      resoudrePeriode(user.db),
    ]);

    return NextResponse.json({
      couranteId: courante?.id ?? null,
      periodes: periodes.map((p) => ({
        id: p.id,
        mois: p.mois,
        annee: p.annee,
        libelle: libellePeriode(p),
        statut: p.statut,
        cloturee: p.statut === "ARCHIVEE",
      })),
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

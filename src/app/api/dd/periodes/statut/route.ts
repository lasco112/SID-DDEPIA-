/**
 * POST /api/dd/periodes/statut — ouverture ou fermeture de la saisie sur une
 * période (CDC §2).
 *
 *  - `OUVERTE`        : la saisie est possible pour les DA et leurs agents.
 *  - `VERROUILLEE_DA` : la saisie est fermée ; le DD peut encore déverrouiller
 *                       un arrondissement en particulier (retard justifié).
 *
 * La clôture définitive et la réouverture ont leurs propres routes : ce sont
 * des actes distincts, l'une exigeant que le circuit soit terminé, l'autre un
 * motif.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { STATUT_CLOTUREE } from "@/server/periodes/gel";

const STATUTS_ADMIS = ["OUVERTE", "VERROUILLEE_DA"] as const;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db;

    const { periodeId, statut } = (await req.json()) as {
      periodeId: string;
      statut: (typeof STATUTS_ADMIS)[number];
    };
    if (!periodeId || !STATUTS_ADMIS.includes(statut)) {
      return NextResponse.json({ message: "Période ou statut invalide." }, { status: 400 });
    }

    const periode = await db.periodeReporting.findUnique({ where: { id: periodeId } });
    if (!periode) return NextResponse.json({ message: "Période introuvable." }, { status: 404 });

    if (periode.statut === STATUT_CLOTUREE) {
      return NextResponse.json(
        { message: "Cette période est clôturée. Utilisez « Rouvrir la période » — un motif est alors exigé." },
        { status: 409 }
      );
    }

    const misAJour = await db.periodeReporting.update({ where: { id: periodeId }, data: { statut } });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "STATUT_PERIODE",
        entite: "PeriodeReporting",
        entiteId: periodeId,
        details: {
          periode: `${periode.annee}-${String(periode.mois ?? 0).padStart(2, "0")}`,
          avant: periode.statut,
          apres: statut,
        },
      },
    });

    return NextResponse.json({ periode: misAJour });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

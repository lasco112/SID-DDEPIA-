/**
 * GET /api/da/agents-saisie — supervision des agents de saisie par le DA
 * (demande de la réunion de service) : liste les agents de saisie de SON
 * arrondissement avec, pour la période active, le nombre de valeurs qu'ils
 * ont personnellement saisies (traçabilité déjà en place via `saisiParId`
 * sur SaisieMatrice/SaisieNominative/SaisieEvenement).
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["DA"]);
    const db = user.db;

    if (!user.arrondissementId) {
      return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
    }

    const periode = await db.periodeReporting.findFirst({
      where: { type: "MENSUEL" },
      orderBy: [{ annee: "desc" }, { mois: "desc" }],
    });

    const agents = await db.user.findMany({
      where: { role: "AGENT_SAISIE", arrondissementId: user.arrondissementId },
      orderBy: { nom: "asc" },
    });

    const rapport = periode
      ? await db.rapportArrondissement.findFirst({ where: { periodeId: periode.id, arrondissementId: user.arrondissementId } })
      : null;

    const resultats = await Promise.all(
      agents.map(async (agent) => {
        if (!rapport) return { id: agent.id, nom: agent.nom, username: agent.username, actif: agent.actif, totalSaisies: 0, derniereActivite: null as string | null };
        const [matrice, nominative, evenement] = await Promise.all([
          db.saisieMatrice.findMany({ where: { rapportId: rapport.id, saisiParId: agent.id }, select: { syncedAt: true } }),
          db.saisieNominative.findMany({ where: { rapportId: rapport.id, saisiParId: agent.id }, select: { syncedAt: true } }),
          db.saisieEvenement.findMany({ where: { rapportId: rapport.id, saisiParId: agent.id }, select: { syncedAt: true } }),
        ]);
        const toutes = [...matrice, ...nominative, ...evenement];
        const derniereActivite = toutes.length
          ? toutes.map((s) => s.syncedAt.getTime()).reduce((a, b) => Math.max(a, b)).toString()
          : null;
        return {
          id: agent.id,
          nom: agent.nom,
          username: agent.username,
          actif: agent.actif,
          totalSaisies: toutes.length,
          derniereActivite: derniereActivite ? new Date(Number(derniereActivite)).toISOString() : null,
        };
      })
    );

    return NextResponse.json({ periode: periode ? { id: periode.id, annee: periode.annee, mois: periode.mois } : null, agents: resultats });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * GET /api/da/agents-saisie/[id] — détail des données saisies par un agent
 * de saisie précis (son propre arrondissement uniquement), pour la période
 * active : tableau concerné, indicateur/établissement et valeur.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse, ForbiddenError } from "@/lib/permissions";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA"]);
    const db = user.db;

    const agent = await db.user.findUnique({ where: { id: params.id } });
    if (!agent || agent.role !== "AGENT_SAISIE" || agent.arrondissementId !== user.arrondissementId) {
      throw new ForbiddenError("Cet agent n'appartient pas à votre arrondissement.");
    }

    const periode = await db.periodeReporting.findFirst({
      where: { type: "MENSUEL" },
      orderBy: [{ annee: "desc" }, { mois: "desc" }],
    });
    const rapport = periode
      ? await db.rapportArrondissement.findFirst({ where: { periodeId: periode.id, arrondissementId: user.arrondissementId! } })
      : null;

    if (!rapport) return NextResponse.json({ saisies: [] });

    const [matrice, nominative, evenement] = await Promise.all([
      db.saisieMatrice.findMany({
        where: { rapportId: rapport.id, saisiParId: agent.id },
        include: { field: { include: { template: true } } },
        orderBy: { syncedAt: "desc" },
      }),
      db.saisieNominative.findMany({
        where: { rapportId: rapport.id, saisiParId: agent.id },
        include: { field: true, template: true, etablissement: true },
        orderBy: { syncedAt: "desc" },
      }),
      db.saisieEvenement.findMany({
        where: { rapportId: rapport.id, saisiParId: agent.id },
        include: { template: true },
        orderBy: { syncedAt: "desc" },
      }),
    ]);

    const saisies = [
      ...matrice.map((s) => ({
        tableau: `${s.field.template.numero} ${s.field.template.titre}`,
        libelle: s.field.libelle,
        valeur: s.nonRenseigne ? `N/D (${s.motifNonRenseigne ?? ""})` : s.valeurTexte ?? s.valeur?.toString() ?? "—",
        syncedAt: s.syncedAt.toISOString(),
      })),
      ...nominative.map((s) => ({
        tableau: `${s.template.numero} ${s.template.titre}`,
        libelle: `${s.etablissement.nom} — ${s.field.libelle}`,
        valeur: s.nonRenseigne ? `N/D (${s.motifNonRenseigne ?? ""})` : s.valeurTexte ?? s.valeur?.toString() ?? "—",
        syncedAt: s.syncedAt.toISOString(),
      })),
      ...evenement.map((s) => ({
        tableau: `${s.template.numero} ${s.template.titre}`,
        libelle: "Événement",
        valeur: JSON.stringify(s.payload),
        syncedAt: s.syncedAt.toISOString(),
      })),
    ].sort((a, b) => (a.syncedAt < b.syncedAt ? 1 : -1));

    return NextResponse.json({ agent: { nom: agent.nom, username: agent.username }, saisies });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

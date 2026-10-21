/**
 * Les collectes ponctuelles (21 octobre 2026).
 *
 *   GET  /api/collectes   le DD : toutes, avec leur avancement ;
 *                          un DA ou un agent : celles qui le visent aujourd'hui,
 *                          avec l'avancement de SON arrondissement
 *   POST /api/collectes   le DD lance une collecte
 *        { titre, consigne?, typeCode, arrondissementIds[], roles[], debut, fin, prioritaire? }
 *
 * Par `user.db` : le cloisonnement du département s'applique, la démonstration
 * lit sa base.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { listerArrondissements } from "@/lib/arrondissements";
import { dateAuCameroun } from "@/lib/marches";
import { avancement, collectesPour, etatDe, lancerCollecte, lienDe, nettoyerCollecte, type Collecte } from "@/server/collectes/collectes";

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["DD", "DA", "AGENT_SAISIE"]);
    const aujourdhui = dateAuCameroun();
    if (user.role === "DD") {
      const liste = (await user.db.collecteCampagne.findMany({ orderBy: { createdAt: "desc" }, take: 30 })) as Collecte[];
      const collectes = await Promise.all(
        liste.map(async (c) => ({ ...c, etat: etatDe(c, aujourdhui), lien: lienDe(c), avancement: etatDe(c, aujourdhui) === "a_venir" ? null : await avancement(user.db, c) }))
      );
      return NextResponse.json({ aujourdhui, collectes });
    }
    const miennes = await collectesPour(user.db, { role: user.role, arrondissementId: user.arrondissementId }, aujourdhui);
    const collectes = await Promise.all(
      miennes.map(async (c) => ({ ...c, etat: "en_cours", lien: lienDe(c), avancement: await avancement(user.db, c, user.arrondissementId ?? undefined) }))
    );
    return NextResponse.json({ aujourdhui, collectes });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const body = (await req.json()) as Record<string, unknown>;
    const arrondissements = (await listerArrondissements(user.db)).map((a) => a.id);
    const r = nettoyerCollecte(body, arrondissements);
    if ("erreur" in r) return NextResponse.json({ message: r.erreur }, { status: 400 });
    const { collecte, notifies } = await lancerCollecte(user.db, r.data, user.id);
    await user.db.auditLog.create({
      data: { userId: user.id, action: "COLLECTE_LANCEE", entite: "CollecteCampagne", entiteId: collecte.id, details: { ...r.data, notifies } },
    });
    return NextResponse.json({ collecte, notifies }, { status: 201 });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

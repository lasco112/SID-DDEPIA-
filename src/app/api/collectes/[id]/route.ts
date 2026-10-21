/**
 * Une collecte ponctuelle — le DD seulement (21 octobre 2026).
 *
 *   PATCH /api/collectes/[id]   { action: "relancer" }              tous ceux qui collectent
 *                               { action: "relancerRetardataires" } les arrondissements sans aucune fiche
 *                               { action: "cloturer" }              arrêter la collecte maintenant
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { etatDe, relancerCollecte, type Collecte } from "@/server/collectes/collectes";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const c = (await user.db.collecteCampagne.findUnique({ where: { id: params.id } })) as Collecte | null;
    if (!c) return NextResponse.json({ message: "Collecte introuvable." }, { status: 404 });
    const { action } = (await req.json()) as { action?: string };

    if (action === "cloturer") {
      if (c.clotureeLe) return NextResponse.json({ message: "Cette collecte est déjà clôturée." }, { status: 409 });
      await user.db.collecteCampagne.update({ where: { id: c.id }, data: { clotureeLe: new Date() } });
      await user.db.auditLog.create({ data: { userId: user.id, action: "COLLECTE_CLOTUREE", entite: "CollecteCampagne", entiteId: c.id, details: { titre: c.titre } } });
      return NextResponse.json({ ok: true });
    }
    if (action === "relancer" || action === "relancerRetardataires") {
      if (etatDe(c) !== "en_cours") return NextResponse.json({ message: "Seule une collecte en cours se relance." }, { status: 409 });
      const notifies = await relancerCollecte(user.db, c, action === "relancerRetardataires");
      await user.db.auditLog.create({ data: { userId: user.id, action: "COLLECTE_RELANCEE", entite: "CollecteCampagne", entiteId: c.id, details: { titre: c.titre, retardataires: action === "relancerRetardataires", notifies } } });
      return NextResponse.json({ notifies });
    }
    return NextResponse.json({ message: "Action inconnue." }, { status: 400 });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

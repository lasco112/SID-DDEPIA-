/**
 * POST /api/admin-systeme/departements/[id]/etat — allume ou éteint un
 * département. `confirmation` doit reprendre son nom : allumer un département,
 * c'est ouvrir le SID à tous ses comptes.
 */
import { NextResponse } from "next/server";
import { invaliderCacheDepartements } from "@/lib/permissions";
import { basculerDepartement, departementVise, tracer, ErreurAdministration } from "@/server/administration/systeme";
import { administrateur, reponseErreur } from "../../../garde";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await administrateur();
    const body = (await req.json().catch(() => ({}))) as { actif?: unknown; confirmation?: unknown };
    if (typeof body.actif !== "boolean") throw new ErreurAdministration("Préciser s'il faut allumer ou éteindre le département.");
    const d = await departementVise(params.id);
    if (typeof body.confirmation !== "string" || body.confirmation.trim().toLowerCase() !== d.nom.toLowerCase()) {
      throw new ErreurAdministration(`Pour confirmer, tapez le nom du département : ${d.nom}.`);
    }

    await basculerDepartement(d.id, body.actif, admin.departementId);
    invaliderCacheDepartements();
    await tracer(admin.db, admin.id, body.actif ? "ACTIVATION_DEPARTEMENT" : "EXTINCTION_DEPARTEMENT", d);
    return NextResponse.json({ ok: true, actif: body.actif });
  } catch (e) {
    return reponseErreur(e);
  }
}

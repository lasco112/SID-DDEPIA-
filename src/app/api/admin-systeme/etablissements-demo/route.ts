/**
 * GET/POST /api/admin-systeme/etablissements-demo?departementId=… — retire en
 * une fois les établissements de démonstration d'un département (ceux dont le
 * nom porte « DÉMO »). Rangé dans l'administration du système, avec la purge.
 */
import { NextResponse } from "next/server";
import { departementVise, etablissementsDemo, supprimerEtablissementsDemo, tracer, ErreurAdministration } from "@/server/administration/systeme";
import { administrateur, reponseErreur } from "../garde";

export async function GET(req: Request) {
  try {
    await administrateur();
    const d = await departementVise(new URL(req.url).searchParams.get("departementId"));
    return NextResponse.json(await etablissementsDemo(d.id));
  } catch (e) {
    return reponseErreur(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await administrateur();
    const body = (await req.json().catch(() => ({}))) as { departementId?: unknown; confirmation?: unknown };
    const d = await departementVise(body.departementId);
    if (typeof body.confirmation !== "string" || body.confirmation.trim().toLowerCase() !== d.nom.toLowerCase()) {
      throw new ErreurAdministration(`Pour confirmer, tapez le nom du département : ${d.nom}.`);
    }
    const r = await supprimerEtablissementsDemo(d.id);
    if (r.supprimes) await tracer(admin.db, admin.id, "SUPPRESSION_ETABLISSEMENTS_DEMO", d, r);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return reponseErreur(e);
  }
}

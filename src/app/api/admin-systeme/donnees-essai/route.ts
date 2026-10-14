/**
 * GET/POST /api/admin-systeme/donnees-essai?departementId=… — purge des
 * données d'essai d'UN département, rangée dans l'administration du système
 * (décision du Délégué, 14 octobre 2026 : « je peux le faire par erreur »).
 *
 * GET compte ce qui serait supprimé ; POST supprime, dans une transaction
 * unique, après confirmation par le NOM du département — et une seconde
 * phrase si le département est en service.
 */
import { NextResponse } from "next/server";
import { compterDonnees, departementVise, purgerDonnees, tracer, ErreurAdministration } from "@/server/administration/systeme";
import { PHRASE_EN_SERVICE } from "@/lib/administrationSysteme";
import { administrateur, reponseErreur } from "../garde";

export async function GET(req: Request) {
  try {
    await administrateur();
    const d = await departementVise(new URL(req.url).searchParams.get("departementId"));
    return NextResponse.json({ departement: { id: d.id, nom: d.nom, actif: d.actif }, ...(await compterDonnees(d.id)) });
  } catch (e) {
    return reponseErreur(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await administrateur();
    const body = (await req.json().catch(() => ({}))) as { departementId?: unknown; confirmation?: unknown; enService?: unknown };
    const d = await departementVise(body.departementId);
    if (typeof body.confirmation !== "string" || body.confirmation.trim().toLowerCase() !== d.nom.toLowerCase()) {
      throw new ErreurAdministration(`Pour confirmer, tapez le nom du département : ${d.nom}.`);
    }
    if (d.actif && body.enService !== PHRASE_EN_SERVICE) {
      throw new ErreurAdministration(`Ce département est en service : ses données sont réelles. Pour confirmer quand même, tapez aussi « ${PHRASE_EN_SERVICE} ».`);
    }

    const supprime = await purgerDonnees(d.id, admin.id);
    await tracer(admin.db, admin.id, "PURGE_DONNEES_TEST", d, supprime as unknown as Record<string, unknown>);
    return NextResponse.json({ ok: true, supprime });
  } catch (e) {
    return reponseErreur(e);
  }
}

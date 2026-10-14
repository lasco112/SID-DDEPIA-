/**
 * GET/PUT /api/admin-systeme/textes?departementId=… — les textes permanents
 * d'UN département, écrits par l'administrateur du système pour son compte
 * (décision du Délégué, 14 octobre 2026). Chaque opération se déclare dans le
 * département visé : aucun accès privilégié n'est ouvert.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientCloisonne } from "@/lib/dbCloisonne";
import { departementVise, tracer } from "@/server/administration/systeme";
import { lireEcranTextes, ecrireEcranTextes } from "@/server/trimestre/ecranTextesDepartement";
import { TexteRefuse } from "@/server/trimestre/textesDepartement";
import { administrateur, reponseErreur } from "../garde";

function erreur(e: unknown) {
  if (e instanceof TexteRefuse) return NextResponse.json({ message: e.message }, { status: 400 });
  return reponseErreur(e);
}

export async function GET(req: Request) {
  try {
    await administrateur();
    const url = new URL(req.url);
    const d = await departementVise(url.searchParams.get("departementId"));
    return NextResponse.json(await lireEcranTextes(clientCloisonne(db, d.id), url.searchParams.get("portee") ?? ""));
  } catch (e) {
    return erreur(e);
  }
}

export async function PUT(req: Request) {
  try {
    const admin = await administrateur();
    const corps = (await req.json().catch(() => null)) as { departementId?: unknown; cle?: unknown } | null;
    const d = await departementVise(corps?.departementId);
    const resultat = await ecrireEcranTextes(clientCloisonne(db, d.id), corps, admin.id);
    await tracer(admin.db, admin.id, "TEXTE_DEPARTEMENT", d, { cle: corps?.cle, resultat });
    return NextResponse.json({ ok: true, resultat });
  } catch (e) {
    return erreur(e);
  }
}

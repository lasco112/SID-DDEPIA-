/**
 * GET/PUT /api/dd/textes-departement — les textes permanents du rapport
 * trimestriel de SON département et de ses arrondissements, rédigés par le DD
 * (décision du Délégué, 14 octobre 2026). Le DA n'y a pas accès.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { lireEcranTextes, ecrireEcranTextes } from "@/server/trimestre/ecranTextesDepartement";
import { TexteRefuse } from "@/server/trimestre/textesDepartement";

function erreur(e: unknown) {
  if (e instanceof TexteRefuse) return NextResponse.json({ message: e.message }, { status: 400 });
  const { status, message } = permissionErrorResponse(e);
  return NextResponse.json({ message }, { status });
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    return NextResponse.json(await lireEcranTextes(user.db, new URL(req.url).searchParams.get("portee") ?? ""));
  } catch (e) {
    return erreur(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const resultat = await ecrireEcranTextes(user.db, await req.json().catch(() => null), user.id);
    return NextResponse.json({ ok: true, resultat });
  } catch (e) {
    return erreur(e);
  }
}

/**
 * POST /api/trimestre/reprises — le BAC (ou le DD) CONFIRME son chiffre face à
 * celui d'un arrondissement (tableau des infrastructures) : « mon chiffre est
 * juste ». L'avertissement disparaît tant que les deux chiffres ne changent
 * pas (décision du Délégué, 7 octobre 2026 : c'est au BAC de confirmer ou de
 * modifier, pas à l'arrondissement d'être bloqué). Aucune valeur n'est
 * modifiée ; la confirmation est tracée au journal.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["CHEF_BAC", "DD"]);
    const c = (await req.json().catch(() => ({}))) as {
      annee?: number; trimestre?: number; ligne?: string; arrondissement?: string; ici?: number; la?: number;
    };
    if (!c.annee || !c.trimestre || !c.ligne || !c.arrondissement || typeof c.ici !== "number" || typeof c.la !== "number") {
      return NextResponse.json({ message: "Confirmation incomplète." }, { status: 400 });
    }
    await user.db.auditLog.create({
      data: {
        userId: user.id,
        action: "CONFIRMATION_REPRISE",
        entite: "Trimestre",
        entiteId: `${c.annee}-${c.trimestre}`,
        details: { ligne: c.ligne, arrondissement: c.arrondissement, ici: c.ici, la: c.la },
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

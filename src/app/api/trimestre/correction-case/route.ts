/**
 * Corriger au trimestre une case calculée à partir du mensuel (21 octobre 2026)
 * — le chef de la section, sur ordre du DD. Les règles : corrigerCase.ts.
 *
 *   POST   { annee, trimestre, numeroTableau, ligne, colonne, valeur, motif, source }   corriger (ou confirmer)
 *   DELETE { annee, trimestre, numeroTableau, ligne, colonne, motif }                  annuler la correction
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle } from "@/server/periodes/calendrier";
import { corrigerCase, annulerCorrectionCase, RefusCorrection } from "@/server/trimestre/corrigerCase";
import { CHEFS_SOUS_ORDRE } from "@/server/trimestre/ordresCorrection";

type Corps = { annee?: number; trimestre?: number; numeroTableau?: number; ligne?: string; colonne?: string; valeur?: unknown; motif?: unknown; source?: unknown };

async function traiter(req: Request, faire: "corriger" | "annuler") {
  try {
    const user = await requireUser();
    assertRole(user, [...CHEFS_SOUS_ORDRE] as never[]);
    const b = (await req.json()) as Corps;
    const a = Number(b.annee);
    const t = Number(b.trimestre);
    if (!Number.isInteger(a) || a < 2000 || a > 2100 || ![1, 2, 3, 4].includes(t)) return NextResponse.json({ message: "Période demandée invalide." }, { status: 400 });
    if (!b.numeroTableau || b.ligne == null || !b.colonne) return NextResponse.json({ message: "Case non précisée." }, { status: 400 });
    const periode = trimestrielle(a, t);
    const profil = { role: user.role };
    const cellule = { numero: Number(b.numeroTableau), ligne: b.ligne, colonne: b.colonne };
    if (faire === "corriger") {
      const r = await corrigerCase(user.db, periode, profil, user.id, { ...cellule, valeur: b.valeur, motif: b.motif, source: b.source });
      return NextResponse.json({ enregistre: true, ...r });
    }
    await annulerCorrectionCase(user.db, periode, profil, user.id, { ...cellule, motif: b.motif });
    return NextResponse.json({ annule: true });
  } catch (e) {
    if (e instanceof RefusCorrection) return NextResponse.json({ message: e.message }, { status: e.status });
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export const POST = (req: Request) => traiter(req, "corriger");
export const DELETE = (req: Request) => traiter(req, "annuler");

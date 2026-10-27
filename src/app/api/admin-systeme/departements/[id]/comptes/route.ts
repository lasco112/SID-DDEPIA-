/**
 * /api/admin-systeme/departements/[id]/comptes — les comptes d'un département
 * et la réinitialisation de leurs mots de passe par l'administrateur du système
 * (demande du Délégué, 27 octobre 2026 : un DD d'un autre département qui a
 * oublié son mot de passe n'avait personne pour le lui remettre).
 *
 *   GET  → les comptes, et le mot de passe provisoire du département.
 *   POST { ids: string[] }                           → ces comptes-là.
 *   POST { tous: true, confirmation: "REINITIALISER" } → tous les comptes actifs.
 *   POST { reactiver: id }                           → rouvre un compte désactivé.
 *
 * Le mot de passe provisoire n'est pas écrit dans le journal : seulement les
 * identifiants concernés.
 */
import { NextResponse } from "next/server";
import { comptesDuDepartement, reactiverCompte, reinitialiserMotsDePasse, tracer } from "@/server/administration/systeme";
import { administrateur, reponseErreur } from "../../../garde";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await administrateur();
    return NextResponse.json(await comptesDuDepartement(params.id, admin.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return reponseErreur(e);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await administrateur();
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown; tous?: unknown; confirmation?: unknown; reactiver?: unknown };
    if (body.reactiver !== undefined) {
      const r = await reactiverCompte(params.id, body.reactiver, admin.id);
      await tracer(admin.db, admin.id, "COMPTE_REACTIVE", r.departement, { compte: r.compte });
      return NextResponse.json({ ok: true, reactive: r.compte });
    }
    let cible: { ids: string[] } | { tous: true };
    if (body.tous === true) {
      if (body.confirmation !== "REINITIALISER") {
        return NextResponse.json({ message: "Pour réinitialiser tous les comptes, tapez REINITIALISER." }, { status: 400 });
      }
      cible = { tous: true };
    } else {
      const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
      cible = { ids };
    }
    const r = await reinitialiserMotsDePasse(params.id, cible, admin.id);
    await tracer(admin.db, admin.id, "MOTS_DE_PASSE_REINITIALISES", r.departement, { comptes: r.comptes, tous: "tous" in cible });
    return NextResponse.json({ ok: true, comptes: r.comptes, desactives: r.desactives, motDePasse: r.motDePasse });
  } catch (e) {
    return reponseErreur(e);
  }
}

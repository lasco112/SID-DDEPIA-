/**
 * GET/POST /api/admin-systeme/demonstration — l'état de la démonstration, et sa
 * remise à zéro avant une séance de formation (décisions du Délégué,
 * 14 octobre 2026). Réservé à l'administrateur du système.
 *
 * GET répond aussi quand la base de démonstration n'est PAS branchée sur ce
 * serveur : c'est précisément ce que l'administrateur doit pouvoir constater.
 */
import { NextResponse } from "next/server";
import { demoDb } from "@/lib/demoDb";
import { clientCloisonne } from "@/lib/dbCloisonne";
import { tracer } from "@/server/administration/systeme";
import { reinitialiserDonneesDemo, CLE_DEMO_REINITIALISEE } from "../../../../../prisma/seed-demo";
import { administrateur, reponseErreur } from "../garde";

export async function GET() {
  try {
    await administrateur();
    if (!demoDb) return NextResponse.json({ configuree: false });
    const men = await demoDb.departement.findUnique({ where: { code: "MEN" }, select: { id: true } });
    if (!men) return NextResponse.json({ configuree: true, prete: false, message: "La base de démonstration n'a pas encore reçu ses migrations." });
    const c = clientCloisonne(demoDb, men.id);
    const [comptes, periodes, saisies, marqueur] = await Promise.all([
      c.user.findMany({ where: { actif: true }, select: { username: true, role: true }, orderBy: { username: "asc" } }),
      c.periodeReporting.findMany({ where: { type: "MENSUEL" }, select: { annee: true, mois: true, statut: true }, orderBy: [{ annee: "asc" }, { mois: "asc" }] }),
      c.saisieMatrice.count(),
      demoDb.configSysteme.findUnique({ where: { cle: CLE_DEMO_REINITIALISEE } }),
    ]);
    return NextResponse.json({
      configuree: true,
      prete: comptes.length > 0 && saisies > 0,
      comptes,
      periodes,
      saisies,
      reinitialiseeLe: marqueur?.valeur ?? null,
    });
  } catch (e) {
    return reponseErreur(e);
  }
}

export async function POST() {
  try {
    const admin = await administrateur();
    if (!demoDb) return NextResponse.json({ message: "La base de démonstration n'est pas branchée sur ce serveur." }, { status: 409 });
    const r = await reinitialiserDonneesDemo();
    await tracer(admin.db, admin.id, "DEMONSTRATION_REINITIALISEE", null, r);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return reponseErreur(e);
  }
}

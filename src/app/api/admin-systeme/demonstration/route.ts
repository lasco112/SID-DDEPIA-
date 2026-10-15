/**
 * GET/POST /api/admin-systeme/demonstration — l'état de la démonstration, et sa
 * remise à zéro avant une séance de formation (décisions du Délégué,
 * 14 et 15 octobre 2026). Réservé à l'administrateur du système.
 *
 * GET répond aussi quand la base de démonstration n'est PAS branchée sur ce
 * serveur : c'est précisément ce que l'administrateur doit pouvoir constater.
 * POST lance la remise à zéro en arrière-plan ; GET dit où elle en est.
 */
import { NextResponse } from "next/server";
import { demoDb } from "@/lib/demoDb";
import { clientCloisonne } from "@/lib/dbCloisonne";
import { tracer } from "@/server/administration/systeme";
import { etatReinitialisation, lancerReinitialisation } from "@/server/demo/reinitialisation";
import { CLE_DEMO_REINITIALISEE } from "../../../../../prisma/seed-demo";
import { administrateur, reponseErreur } from "../garde";

export async function GET() {
  try {
    await administrateur();
    if (!demoDb) return NextResponse.json({ configuree: false });
    const base = demoDb;
    const departements = await base.departement.findMany({ orderBy: { nom: "asc" }, select: { id: true, code: true, nom: true } });
    if (departements.length === 0) return NextResponse.json({ configuree: true, prete: false, message: "La base de démonstration n'a pas encore reçu ses migrations." });
    const parDepartement = await Promise.all(
      departements.map(async (d) => {
        const c = clientCloisonne(base, d.id);
        const [comptes, saisies, periodes] = await Promise.all([
          c.user.count({ where: { actif: true, username: { startsWith: "demo." } } }),
          c.saisieMatrice.count(),
          c.periodeReporting.findMany({ where: { type: "MENSUEL" }, select: { annee: true, mois: true, statut: true }, orderBy: [{ annee: "asc" }, { mois: "asc" }] }),
        ]);
        return { code: d.code, nom: d.nom, comptes, saisies, periodes };
      })
    );
    const marqueur = await base.configSysteme.findUnique({ where: { cle: CLE_DEMO_REINITIALISEE } });
    return NextResponse.json({
      configuree: true,
      prete: parDepartement.some((d) => d.comptes > 0 && d.saisies > 0),
      departements: parDepartement,
      reinitialiseeLe: marqueur?.valeur ?? null,
      reinitialisation: etatReinitialisation(),
    });
  } catch (e) {
    return reponseErreur(e);
  }
}

export async function POST() {
  try {
    const admin = await administrateur();
    if (!demoDb) return NextResponse.json({ message: "La base de démonstration n'est pas branchée sur ce serveur." }, { status: 409 });
    if (!lancerReinitialisation()) return NextResponse.json({ message: "Une remise à zéro est déjà en cours." }, { status: 409 });
    await tracer(admin.db, admin.id, "DEMONSTRATION_REINITIALISEE", null, {});
    return NextResponse.json({ ok: true, enCours: true });
  } catch (e) {
    return reponseErreur(e);
  }
}

/**
 * GET /api/demo/comptes — de quoi choisir son entrée dans la démonstration :
 * le département, puis la fonction, puis l'arrondissement (demande du Délégué,
 * 15 octobre 2026).
 *
 * Publique : elle ne lit que la base de DÉMONSTRATION, et n'en rend que des
 * identifiants fictifs (« demo.… ») et des noms de territoires. Jamais un mot
 * de passe, jamais une donnée de la production.
 */
import { NextResponse } from "next/server";
import { demoDb } from "@/lib/demoDb";
import { clientCloisonne } from "@/lib/dbCloisonne";
import { composerIdentite } from "@/lib/departement";

export const dynamic = "force-dynamic";

const SITUATIONS: Record<string, string> = {
  SOUMIS: "Rapport d'octobre transmis",
  EN_SAISIE: "Octobre encore en saisie",
  REJETE: "Octobre renvoyé par le DD",
  CLOTURE: "Octobre validé",
};

export async function GET() {
  if (!demoDb) return NextResponse.json({ disponible: false, departements: [] });
  const base = demoDb;
  try {
    const departements = (await base.departement.findMany({ orderBy: { nom: "asc" } })).sort(
      (a, b) => Number(b.code === "MEN") - Number(a.code === "MEN")
    );
    const sortie = [];
    for (const d of departements) {
      const c = clientCloisonne(base, d.id);
      const [comptes, arrondissements, octobre] = await Promise.all([
        c.user.findMany({
          where: { actif: true, username: { startsWith: "demo." } },
          select: { username: true, role: true, arrondissementId: true },
        }),
        c.arrondissement.findMany({ orderBy: { ordre: "asc" }, select: { id: true, nom: true } }),
        c.periodeReporting.findFirst({ where: { type: "MENSUEL", statut: "OUVERTE" }, orderBy: [{ annee: "desc" }, { mois: "desc" }], select: { id: true } }),
      ]);
      const statuts = octobre
        ? new Map((await c.rapportArrondissement.findMany({ where: { periodeId: octobre.id }, select: { arrondissementId: true, statut: true } })).map((r) => [r.arrondissementId, r.statut]))
        : new Map<string, string>();
      const dd = comptes.find((u) => u.role === "DD");
      if (!dd) continue; // département pas encore rempli : rien à proposer
      const chef = (role: string) => comptes.find((u) => u.role === role)?.username ?? null;
      sortie.push({
        code: d.code,
        nom: d.nom,
        nomAvecArticle: composerIdentite(d).nomAvecArticle,
        dd: dd.username,
        chefs: { PSA: chef("CHEF_PSA"), SSV: chef("CHEF_SSV"), SPAIH: chef("CHEF_SPAIH"), BAC: chef("CHEF_BAC") },
        arrondissements: arrondissements.map((a) => ({
          nom: a.nom,
          da: comptes.find((u) => u.role === "DA" && u.arrondissementId === a.id)?.username ?? null,
          agent: comptes.find((u) => u.role === "AGENT_SAISIE" && u.arrondissementId === a.id)?.username ?? null,
          situation: SITUATIONS[statuts.get(a.id) ?? ""] ?? null,
        })),
      });
    }
    return NextResponse.json({ disponible: sortie.length > 0, departements: sortie });
  } catch {
    return NextResponse.json({ disponible: false, departements: [] });
  }
}

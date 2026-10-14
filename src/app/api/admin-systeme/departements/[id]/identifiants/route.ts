/**
 * POST /api/admin-systeme/departements/[id]/identifiants — donne un mot de
 * passe provisoire aux comptes du département qui ne se sont jamais connectés
 * et rend leurs fiches de remise, en PDF, une page par personne.
 *
 * Les mots de passe n'existent en clair que dans ce PDF : le journal ne garde
 * que les identifiants concernés.
 */
import { departementVise, genererIdentifiants, tracer } from "@/server/administration/systeme";
import { rendreFichesIdentifiants } from "@/server/administration/fichesIdentifiants";
import { composerIdentite } from "@/lib/departement";
import { administrateur, reponseErreur } from "../../../garde";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await administrateur();
    const d = await departementVise(params.id);
    const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
    const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : undefined;

    const identifiants = await genererIdentifiants(d.id, ids);
    const identite = composerIdentite(d);
    const pdf = await rendreFichesIdentifiants(identifiants, {
      departement: d.nom,
      nomAvecArticle: identite.nomAvecArticle,
      adresse: process.env.NEXTAUTH_URL?.replace(/\/$/, "") || new URL(req.url).origin,
      eteint: !d.actif,
    });
    await tracer(admin.db, admin.id, "IDENTIFIANTS_GENERES", d, { comptes: identifiants.map((i) => i.username) });

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="identifiants-${d.code.toLowerCase()}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return reponseErreur(e);
  }
}

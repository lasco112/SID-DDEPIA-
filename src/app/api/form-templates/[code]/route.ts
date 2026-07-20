/**
 * GET /api/form-templates/[code] — détail d'un tableau, tout ce qu'il faut
 * pour le rendre côté client sans rien coder en dur :
 *  - MATRICE   : la liste ordonnée des FormField.
 *  - NOMINATIF : idem + les établissements actifs du type concerné, scopés à
 *                l'arrondissement du DA connecté.
 *  - EVENEMENT : le schemaEvenement + les ReferentielItem des catégories
 *                référencées (maladie, espèce, vaccin...).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";
import { NOMINATIF_ETABLISSEMENT_TYPE } from "@/lib/nominatifTypes";

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  try {
    const user = await requireUser();

    const template = await db.formTemplate.findUnique({
      where: { code: params.code },
      include: { fields: { where: { actif: true }, orderBy: { ordre: "asc" } }, section: true },
    });
    if (!template) {
      return NextResponse.json({ message: "Tableau introuvable" }, { status: 404 });
    }

    const unites = await db.referentielItem.findMany({ where: { categorie: "UNITE" } });
    const uniteLibelleParCode = new Map(unites.map((u) => [u.code, u.libelle]));
    const templateAvecUnites = {
      ...template,
      fields: template.fields.map((f) => ({
        ...f,
        uniteLibelle: f.uniteCode ? uniteLibelleParCode.get(f.uniteCode) ?? f.uniteCode : "",
      })),
    };

    let etablissements: unknown[] = [];
    if (template.type === "NOMINATIF") {
      const typeCode = NOMINATIF_ETABLISSEMENT_TYPE[template.code];
      etablissements = await db.etablissement.findMany({
        where: {
          typeCode,
          actif: true,
          ...(user.arrondissementId ? { arrondissementId: user.arrondissementId } : {}),
        },
        orderBy: { nom: "asc" },
      });
    }

    let referentiels: Record<string, unknown[]> = {};
    if (template.type === "EVENEMENT" && Array.isArray(template.schemaEvenement)) {
      const categories = Array.from(
        new Set(
          (template.schemaEvenement as Array<{ ref?: string }>)
            .map((c) => c.ref)
            .filter((r): r is string => Boolean(r))
        )
      );
      for (const categorie of categories) {
        referentiels[categorie] = await db.referentielItem.findMany({
          where: { categorie: categorie as any, actif: true },
          orderBy: { ordre: "asc" },
        });
      }
    }

    return NextResponse.json({ template: templateAvecUnites, etablissements, referentiels });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

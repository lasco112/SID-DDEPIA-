/**
 * GET /api/section/vue-croisee/[templateCode]?periodeId=... — vue croisée
 * des 6 arrondissements pour un tableau (CDC §M4). Restreint aux chefs de
 * la section responsable du tableau (ou au DD, en lecture, pour supervision).
 * Signale les variations fortes vs mois précédent (seuil ±30 %, CDC §M4).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, ROLES_CHEF, permissionErrorResponse, ForbiddenError, peutConsulterTableauSection } from "@/lib/permissions";

const SEUIL_VARIATION = 0.3;

export async function GET(req: Request, { params }: { params: { templateCode: string } }) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(req.url);
    const periodeId = searchParams.get("periodeId");
    if (!periodeId) return NextResponse.json({ message: "periodeId requis" }, { status: 400 });

    const template = await db.formTemplate.findUnique({
      where: { code: params.templateCode },
      include: { fields: { where: { actif: true }, orderBy: { ordre: "asc" } } },
    });
    if (!template) return NextResponse.json({ message: "Tableau introuvable" }, { status: 404 });

    const estChefAutorise = ROLES_CHEF.includes(user.role) && peutConsulterTableauSection(user, template);
    if (!estChefAutorise && user.role !== "DD") {
      throw new ForbiddenError("Cette section n'est pas la vôtre.");
    }

    const arrondissements = await db.arrondissement.findMany({ orderBy: { ordre: "asc" } });
    const periode = await db.periodeReporting.findUniqueOrThrow({ where: { id: periodeId } });
    const moisPrecedent = await db.periodeReporting.findFirst({
      where: {
        type: "MENSUEL",
        annee: periode.mois === 1 ? periode.annee - 1 : periode.annee,
        mois: periode.mois === 1 ? 12 : (periode.mois ?? 1) - 1,
      },
    });

    if (template.type === "MATRICE") {
      const saisies = await db.saisieMatrice.findMany({
        where: { field: { templateId: template.id }, rapport: { periodeId } },
        include: { rapport: { include: { arrondissement: true } } },
      });
      const saisiesPrec = moisPrecedent
        ? await db.saisieMatrice.findMany({
            where: { field: { templateId: template.id }, rapport: { periodeId: moisPrecedent.id } },
          })
        : [];

      const cells: Record<string, Record<string, { id: string; valeur: number | null; nonRenseigne: boolean }>> = {};
      const totaux: Record<string, number> = {};
      const totauxPrec: Record<string, number> = {};

      for (const f of template.fields) {
        cells[f.code] = {};
        totaux[f.code] = 0;
      }
      for (const s of saisies) {
        cells[s.fieldCode] ??= {};
        cells[s.fieldCode][s.rapport.arrondissement.code] = {
          id: s.id,
          valeur: s.valeur == null ? null : Number(s.valeur),
          nonRenseigne: s.nonRenseigne,
        };
        if (!s.nonRenseigne && s.valeur != null) totaux[s.fieldCode] = (totaux[s.fieldCode] ?? 0) + Number(s.valeur);
      }
      for (const s of saisiesPrec) {
        if (!s.nonRenseigne && s.valeur != null) totauxPrec[s.fieldCode] = (totauxPrec[s.fieldCode] ?? 0) + Number(s.valeur);
      }

      const variationForte: Record<string, boolean> = {};
      for (const f of template.fields) {
        const av = totauxPrec[f.code];
        const ap = totaux[f.code];
        variationForte[f.code] = av ? Math.abs((ap - av) / av) > SEUIL_VARIATION : false;
      }

      return NextResponse.json({
        template,
        arrondissements,
        cells,
        totaux,
        totauxPrecedent: totauxPrec,
        variationForte,
      });
    }

    if (template.type === "NOMINATIF") {
      const saisies = await db.saisieNominative.findMany({
        where: { templateId: template.id, rapport: { periodeId } },
        include: { etablissement: true, rapport: { include: { arrondissement: true } } },
        orderBy: [{ etablissement: { arrondissementId: "asc" } }, { etablissement: { nom: "asc" } }],
      });
      return NextResponse.json({ template, arrondissements, saisiesNominatives: saisies });
    }

    // EVENEMENT
    const evenements = await db.saisieEvenement.findMany({
      where: { templateId: template.id, rapport: { periodeId } },
      include: { rapport: { include: { arrondissement: true } } },
      orderBy: { syncedAt: "desc" },
    });

    // Résolution des codes de référentiel (maladie, espèce, vaccin...) en libellés lisibles —
    // le chef de section ne doit jamais avoir à déchiffrer des codes bruts (CDC lisibilité §M4).
    const schema = (template.schemaEvenement as Array<{ key: string; label: string; type: string; ref?: string }> | null) ?? [];
    const refCategories = Array.from(new Set(schema.filter((c) => c.ref).map((c) => c.ref!)));
    const refItems = refCategories.length
      ? await db.referentielItem.findMany({ where: { categorie: { in: refCategories as any } } })
      : [];
    const refLibelle: Record<string, string> = {};
    for (const r of refItems) refLibelle[`${r.categorie}:${r.code}`] = r.libelle;

    return NextResponse.json({ template, arrondissements, evenements, refLibelle });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

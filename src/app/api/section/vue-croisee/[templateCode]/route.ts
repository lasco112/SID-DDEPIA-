/**
 * GET /api/section/vue-croisee/[templateCode]?periodeId=... — vue croisée
 * des 6 arrondissements pour un tableau (CDC §M4). Restreint aux chefs de
 * la section responsable du tableau (ou au DD, en lecture, pour supervision).
 * Signale les variations fortes vs mois précédent (seuil ±30 %, CDC §M4).
 */
import { NextResponse } from "next/server";
import { requireUser, ROLES_CHEF, permissionErrorResponse, ForbiddenError, peutConsulterTableauSection } from "@/lib/permissions";
import type { PrismaClient } from "@prisma/client";
import { observationsDes } from "@/server/observations";
import { refusAjoutLigne } from "@/server/mensuel/ajoutLigneChef";
import { STATUT_CLOTUREE } from "@/server/periodes/gel";

/** Les observations déjà faites sur ce tableau ce mois-ci, par donnée : le chef voit où il en est. */
async function observationsDuTableau(db: PrismaClient, periodeId: string, templateCode: string) {
  const rapports = await db.rapportArrondissement.findMany({ where: { periodeId }, select: { id: true } });
  const obs = (await observationsDes(db, rapports.map((r) => r.id))).filter((o) => o.templateCode === templateCode && !o.close);
  const parSaisie: Record<string, { texte: string; etat: "en_attente" | "repondue" | "corrigee"; reponse: string | null }> = {};
  for (const o of obs) {
    parSaisie[o.saisieId] = { texte: o.texte, etat: o.corrigee ? "corrigee" : o.reponse ? "repondue" : "en_attente", reponse: o.reponse?.texte ?? null };
  }
  return parSaisie;
}

const SEUIL_VARIATION = 0.3;

export async function GET(req: Request, { params }: { params: { templateCode: string } }) {
  try {
    const user = await requireUser();
    const db = user.db;
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
        observations: await observationsDuTableau(db as PrismaClient, periodeId, template.code),
      });
    }

    if (template.type === "NOMINATIF") {
      const saisies = await db.saisieNominative.findMany({
        where: { templateId: template.id, rapport: { periodeId } },
        include: { etablissement: true, rapport: { include: { arrondissement: true } } },
        orderBy: [{ etablissement: { arrondissementId: "asc" } }, { etablissement: { nom: "asc" } }],
      });
      return NextResponse.json({ template, arrondissements, saisiesNominatives: saisies, observations: await observationsDuTableau(db as PrismaClient, periodeId, template.code) });
    }

    // EVENEMENT
    const evenements = await db.saisieEvenement.findMany({
      where: { templateId: template.id, rapport: { periodeId } },
      // `saisiPar` : une ligne ajoutée par un chef (ligne oubliée par le DA) se voit comme telle.
      include: { rapport: { include: { arrondissement: true } }, saisiPar: { select: { role: true } } },
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

    // Ajouter une ligne oubliée par le DA : possible ou non, et pourquoi — dit
    // AVANT que le chef ne remplisse (22 octobre 2026, ajoutLigneChef.ts).
    const raisonAjout = await refusAjoutLigne(db as PrismaClient, { id: user.id, role: user.role, username: user.username, sectionId: user.sectionId ?? null }, template, periode);
    const clos = periode.statut === STATUT_CLOTUREE;
    // Les rapports du mois : un arrondissement sans ligne doit pouvoir en recevoir une.
    const rapports = await db.rapportArrondissement.findMany({ where: { periodeId }, select: { arrondissementId: true, statut: true } });

    return NextResponse.json({
      template, arrondissements, evenements, refLibelle,
      observations: await observationsDuTableau(db as PrismaClient, periodeId, template.code),
      ajout: {
        possible: !raisonAjout && !clos,
        raison: raisonAjout ?? (clos ? "Ce mois est clôturé : le Délégué départemental doit le rouvrir (« Ouvrir et clôturer les mois ») avant qu'une ligne y soit ajoutée." : null),
        arrondissementsAvecRapport: rapports.map((r) => r.arrondissementId),
      },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

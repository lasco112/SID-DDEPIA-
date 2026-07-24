/**
 * GET /api/bootstrap — téléchargement initial unique pour le hors-ligne
 * (spécification hors-ligne : "internet requis uniquement pour la 1ère
 * connexion et la synchronisation").
 *
 * Renvoie en un seul appel tout ce qu'il faut pour que l'application puisse
 * ensuite s'ouvrir, naviguer et remplir n'importe quel tableau sans réseau :
 * les 28 tableaux + leurs champs, les établissements du périmètre de
 * l'utilisateur, les référentiels actifs (toutes catégories), la période de
 * reporting active et les infos de session nécessaires à l'affichage
 * (rôle, arrondissement, section). C'est la contrepartie serveur de
 * lib/dexie.ts (tables meta/tableaux/etablissements/referentiels/periodes).
 */
import { NextResponse } from "next/server";
import { requireUser, permissionErrorResponse } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    const db = user.db;

    const [moi, arrondissement, templates, etablissements, referentiels, periode] = await Promise.all([
      db.user.findUnique({ where: { id: user.id }, select: { nom: true } }),
      user.arrondissementId ? db.arrondissement.findUnique({ where: { id: user.arrondissementId } }) : null,
      db.formTemplate.findMany({
        where: { actif: true },
        include: { fields: { where: { actif: true }, orderBy: { ordre: "asc" } }, section: true },
        orderBy: { ordre: "asc" },
      }),
      db.etablissement.findMany({
        where: {
          actif: true,
          ...(user.arrondissementId ? { arrondissementId: user.arrondissementId } : {}),
        },
        orderBy: { nom: "asc" },
      }),
      db.referentielItem.findMany({ where: { actif: true }, orderBy: { ordre: "asc" } }),
      db.periodeReporting.findFirst({ where: { type: "MENSUEL" }, orderBy: [{ annee: "desc" }, { mois: "desc" }] }),
    ]);

    const uniteLibelleParCode = new Map(
      referentiels.filter((r) => r.categorie === "UNITE").map((u) => [u.code, u.libelle])
    );

    // Type d'établissement concerné par chaque tableau NOMINATIF — dupliqué ici
    // (plutôt qu'importé depuis lib/nominatifTypes) pour que le payload porte
    // directement l'info dont Dexie a besoin, sans recoder ce mapping côté client.
    const NOMINATIF_ETABLISSEMENT_TYPE: Record<string, string> = {
      T13: "ETAB_COUVOIR",
      T14: "ETAB_FERME_PONTE",
      T15: "ETAB_FERME_CHAIR",
      T23: "ETAB_PROVENDERIE",
    };

    return NextResponse.json({
      meta: {
        username: user.username,
        nom: moi?.nom ?? user.username,
        role: user.role,
        arrondissementId: user.arrondissementId,
        arrondissementNom: arrondissement?.nom ?? null,
        sectionId: user.sectionId,
        periodeActiveId: periode?.id ?? null,
        telechargeLe: new Date().toISOString(),
      },
      tableaux: templates.map((t) => ({
        code: t.code,
        numero: t.numero,
        titre: t.titre,
        type: t.type,
        ordre: t.ordre,
        sectionCode: t.section.code,
        schemaEvenement: t.schemaEvenement ?? null,
        etablissementTypeCode: NOMINATIF_ETABLISSEMENT_TYPE[t.code] ?? null,
        fields: t.fields.map((f) => ({
          code: f.code,
          libelle: f.libelle,
          uniteCode: f.uniteCode,
          uniteLibelle: f.uniteCode ? uniteLibelleParCode.get(f.uniteCode) ?? f.uniteCode : "",
          typeValeur: f.typeValeur,
          ordre: f.ordre,
        })),
      })),
      etablissements: etablissements.map((e) => ({
        id: e.id,
        typeCode: e.typeCode,
        nom: e.nom,
        localite: e.localite,
        arrondissementId: e.arrondissementId,
        actif: e.actif,
      })),
      referentiels: referentiels.map((r) => ({
        id: `${r.categorie}:${r.code}`,
        categorie: r.categorie,
        code: r.code,
        libelle: r.libelle,
        ordre: r.ordre,
      })),
      periode: periode
        ? {
            id: periode.id,
            type: periode.type,
            annee: periode.annee,
            mois: periode.mois,
            statut: periode.statut,
            dateLimiteDA: periode.dateLimiteDA?.toISOString() ?? null,
            dateLimiteDD: periode.dateLimiteDD?.toISOString() ?? null,
          }
        : null,
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

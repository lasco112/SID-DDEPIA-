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

    const [moi, arrondissement, templates, etablissements, referentiels, periode, marqueurPurge] = await Promise.all([
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
      db.configSysteme.findUnique({ where: { cle: "donnees_purgees_le" } }),
    ]);

    // LES SAISIES DÉJÀ ENREGISTRÉES SUR LE SERVEUR.
    // Sans elles, les écrans de saisie n'affichaient que ce qui avait été tapé
    // sur CET appareil par CE compte : un DA changeant de téléphone, ou dont la
    // base locale avait été recréée, voyait ses tableaux vides alors que le
    // rapport généré (qui lit le serveur) les montrait remplis. Les chefs de
    // section risquaient de rejeter des rapports pourtant complets.
    const rapport =
      periode && user.arrondissementId
        ? await db.rapportArrondissement.findUnique({
            where: { periodeId_arrondissementId: { periodeId: periode.id, arrondissementId: user.arrondissementId } },
            select: { id: true },
          })
        : null;

    const [saisiesMatrice, saisiesNominatives, saisiesEvenement] = rapport
      ? await Promise.all([
          db.saisieMatrice.findMany({
            where: { rapportId: rapport.id },
            select: { clientId: true, fieldCode: true, valeur: true, valeurTexte: true, nonRenseigne: true, motifNonRenseigne: true, modifieLe: true, syncedAt: true, field: { select: { template: { select: { code: true } } } } },
          }),
          db.saisieNominative.findMany({
            where: { rapportId: rapport.id },
            select: { clientId: true, fieldCode: true, etablissementId: true, valeur: true, valeurTexte: true, nonRenseigne: true, motifNonRenseigne: true, modifieLe: true, syncedAt: true, template: { select: { code: true } } },
          }),
          db.saisieEvenement.findMany({
            where: { rapportId: rapport.id },
            select: { clientId: true, payload: true, modifieLe: true, syncedAt: true, template: { select: { code: true } } },
          }),
        ])
      : [[], [], []];

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
        // Date de la dernière purge des données décidée par le DD : l'appareil
        // compare avec la sienne et vide ses brouillons locaux si elle a changé
        // (voir lib/offlineStore.ts).
        donneesPurgeesLe: marqueurPurge?.valeur ?? null,
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
      // Mises au format exact de SaisieOffline (lib/dexie.ts) pour être
      // fusionnées telles quelles dans la base locale. `updatedAt` reprend la
      // date de modification sur l'appareil d'origine quand elle est connue,
      // sinon la date d'arrivée au serveur : c'est elle qui départage une
      // saisie locale non encore envoyée d'une version venue du serveur.
      saisies: [
        ...saisiesMatrice.map((s) => ({
          clientId: s.clientId,
          templateCode: s.field.template.code,
          famille: "MATRICE" as const,
          fieldCode: s.fieldCode,
          valeur: s.valeur === null ? null : Number(s.valeur),
          valeurTexte: s.valeurTexte,
          nonRenseigne: s.nonRenseigne,
          motifNonRenseigne: s.motifNonRenseigne,
          updatedAt: (s.modifieLe ?? s.syncedAt).toISOString(),
        })),
        ...saisiesNominatives.map((s) => ({
          clientId: s.clientId,
          templateCode: s.template.code,
          famille: "NOMINATIF" as const,
          fieldCode: s.fieldCode,
          etablissementId: s.etablissementId,
          valeur: s.valeur === null ? null : Number(s.valeur),
          valeurTexte: s.valeurTexte,
          nonRenseigne: s.nonRenseigne,
          motifNonRenseigne: s.motifNonRenseigne,
          updatedAt: (s.modifieLe ?? s.syncedAt).toISOString(),
        })),
        ...saisiesEvenement.map((s) => ({
          clientId: s.clientId,
          templateCode: s.template.code,
          famille: "EVENEMENT" as const,
          payload: s.payload,
          nonRenseigne: false,
          updatedAt: (s.modifieLe ?? s.syncedAt).toISOString(),
        })),
      ],
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

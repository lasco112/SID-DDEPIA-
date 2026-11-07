/**
 * L'ÉTABLISSEMENT ABSENT DU REGISTRE, CRÉÉ PAR LE CHEF DE SECTION (décision du
 * Délégué, 7 novembre 2026 : « OUI LE CHEF PEUT CREER LA FERME »).
 *
 * Le DA a oublié une ferme qui n'est même pas dans le registre : le chef de la
 * section du tableau (1.3 couvoirs, 1.4 fermes de ponte, 1.5 fermes de chair,
 * 2.3 provenderies) l'y inscrit, puis remplit ses cases vides comme pour toute
 * ferme oubliée (saisieManquanteChef.ts).
 *
 * Mêmes règles que la case vide :
 *  - le chef de la section du tableau (le DD : tous les tableaux) ;
 *  - un arrondissement de SON département (lu par le client cloisonné), dont
 *    le DA a transmis le mois — sinon c'est au DA de l'ajouter lui-même ;
 *  - motif obligatoire ; mois non clôturé ;
 *  - le type d'établissement est celui du tableau, jamais choisi à la main ;
 *  - pas de doublon : un établissement du même nom, du même type, dans le
 *    même arrondissement, existe déjà → refus en clair.
 *
 * La trace : le journal (motif), le DA et le DD prévenus. L'établissement
 * descend ensuite sur les téléphones du DA comme les autres (/api/bootstrap).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { notifierEvenement } from "@/server/notifications/evenements";
import { NOMINATIF_ETABLISSEMENT_TYPE } from "@/lib/nominatifTypes";
import { preparerLocalisation } from "@/server/etablissements/localisation";
import { SELECTION_ETABLISSEMENT, versClient } from "@/server/etablissements/donnees";
import { RefusAjout, refusAuteur, refusRapportNonTransmis, type Auteur } from "./ajoutLigneChef";

/** Ce que le tableau appelle un établissement, pour les messages. */
export const NOM_ETABLISSEMENT: Record<string, string> = {
  T13: "un couvoir",
  T14: "une ferme de ponte",
  T15: "une ferme de poulets de chair",
  T23: "une provenderie",
};

const texte = (x: unknown) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "");
const cle = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export async function creerEtablissementOublie(
  db: PrismaClient,
  auteur: Auteur,
  demande: {
    templateCode: string;
    periodeId: string;
    arrondissementId: string;
    nom: unknown;
    localite?: unknown;
    centreId?: unknown;
    villageId?: unknown;
    villageAutre?: unknown;
    proprietaire?: unknown;
    telephone?: unknown;
    motif: unknown;
  }
) {
  const template = await db.formTemplate.findUnique({ where: { code: demande.templateCode } });
  if (!template) throw new RefusAjout("Tableau introuvable.", 404);
  const typeCode = NOMINATIF_ETABLISSEMENT_TYPE[template.code];
  if (template.type !== "NOMINATIF" || !typeCode) throw new RefusAjout("Ce tableau ne tient pas de registre d'établissements.", 400);
  const refus = refusAuteur(auteur, template, "inscrit un établissement oublié par le DA");
  if (refus) throw new RefusAjout(refus, 403);

  const periode = await db.periodeReporting.findUnique({ where: { id: demande.periodeId } });
  if (!periode || periode.type !== "MENSUEL" || !periode.mois) throw new RefusAjout("Mois introuvable.", 404);
  await assertPeriodeModifiable(db, periode.id);

  // Étanchéité : l'arrondissement est relu DANS le département de la session.
  const arrondissement = await db.arrondissement.findUnique({ where: { id: demande.arrondissementId }, select: { id: true, nom: true } });
  if (!arrondissement) throw new RefusAjout("Cet arrondissement n'appartient pas à votre département.", 403);
  const rapport = await db.rapportArrondissement.findFirst({ where: { periodeId: periode.id, arrondissementId: arrondissement.id }, select: { statut: true, arrondissement: { select: { nom: true } } } });
  if (!rapport) throw new RefusAjout("Cet arrondissement n'a pas de rapport pour ce mois : rien à compléter.", 409);
  const nonTransmis = refusRapportNonTransmis(rapport);
  if (nonTransmis) throw new RefusAjout(nonTransmis, 409);

  const motif = texte(demande.motif);
  if (motif.length < 5) throw new RefusAjout("Le motif est obligatoire : d'où vient cet établissement (ex. : rapport papier du CZV, appel au DA…).", 400);
  const nom = texte(demande.nom);
  if (nom.length < 2) throw new RefusAjout("Le nom de l'établissement est obligatoire.", 400);

  const lieu = await preparerLocalisation(db, demande as unknown as Record<string, unknown>, arrondissement.id);
  if ("erreur" in lieu) throw new RefusAjout(lieu.erreur, 400);
  const localite = lieu.data.localite ?? texte(demande.localite);
  if (!localite) throw new RefusAjout("Indiquez le village (ou la localité) de l'établissement.", 400);

  const memes = await db.etablissement.findMany({ where: { typeCode, arrondissementId: arrondissement.id }, select: { nom: true, actif: true } });
  const double = memes.find((e) => cle(e.nom) === cle(nom));
  if (double) {
    throw new RefusAjout(
      double.actif
        ? `« ${double.nom} » est déjà au registre de ${arrondissement.nom} : remplissez ses cases dans le tableau.`
        : `« ${double.nom} » est au registre de ${arrondissement.nom}, mais désactivé : demandez au DA ou au DD de le réactiver.`,
      409
    );
  }

  const etablissement = await db.etablissement.create({
    data: {
      ...lieu.data,
      typeCode,
      nom,
      localite,
      arrondissementId: arrondissement.id,
      proprietaire: texte(demande.proprietaire) || null,
      telephone: texte(demande.telephone) || null,
    } as Prisma.EtablissementUncheckedCreateInput,
    select: SELECTION_ETABLISSEMENT,
  });

  const genre = NOM_ETABLISSEMENT[template.code] ?? "un établissement";
  const qui = auteur.role === "DD" ? "Le Délégué départemental" : `Le chef ${auteur.role.replace("CHEF_", "")}`;
  await db.auditLog.create({
    data: {
      userId: auteur.id,
      action: "CREATION_ETABLISSEMENT",
      entite: "Etablissement",
      entiteId: etablissement.id,
      details: { nom, typeCode, arrondissement: arrondissement.nom, par: "CHEF_SECTION", tableau: template.numero, motif } as Prisma.InputJsonValue,
    },
  });
  await notifierEvenement(db, { arrondissementId: arrondissement.id, saufUserId: auteur.id }, {
    declencheur: "ETABLISSEMENT_AJOUTE_CHEF",
    message: `${qui} a inscrit au registre de ${arrondissement.nom} ${genre} que votre rapport ne mentionnait pas : « ${nom} » (${localite}). Motif : ${motif}.`,
    lien: "/etablissements",
  });
  if (auteur.role !== "DD") {
    await notifierEvenement(db, { roles: ["DD"], saufUserId: auteur.id }, {
      declencheur: "ETABLISSEMENT_AJOUTE_CHEF",
      message: `${arrondissement.nom} — ${qui.toLowerCase()} a inscrit au registre ${genre} : « ${nom} » (${localite}), absente du rapport du DA. Motif : ${motif}`,
      lien: `/section/controle?tableau=${template.code}`,
    });
  }
  return versClient(etablissement);
}

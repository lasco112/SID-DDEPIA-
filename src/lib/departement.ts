/**
 * departement.ts — l'identité du département vient de la BASE, jamais du code.
 *
 * Pourquoi ce module
 * ------------------
 * « Menoua » était écrit en dur dans une trentaine d'endroits : en-têtes de
 * documents officiels, messages de relance envoyés sur les téléphones, noms des
 * fichiers produits, métadonnées des exports, titre de l'application. Un second
 * département aurait reçu des rapports intitulés « DÉLÉGATION DÉPARTEMENTALE …
 * DE LA MENOUA » et des SMS signés « MINEPIA DDEPIA-Menoua ».
 *
 * Le français résiste
 * -------------------
 * On ne compose pas « de la Menoua » à partir de « Menoua » par une règle : ce
 * serait « DE NOUN » pour le Noun, « DE BAMBOUTOS » pour les Bamboutos. L'article
 * est donc porté par la donnée (`Departement.nomAvecArticle`), comme le nom.
 * À défaut — colonne non renseignée — on se rabat sur « de <nom> », qui est
 * juste pour une majorité de noms et jamais silencieux : il se voit.
 *
 * Les intitulés composés ici reproduisent au caractère près ceux qui étaient
 * écrits en dur. C'est l'objet d'un test, pas d'une confiance : remplacer un
 * libellé écrit à la main par une composition n'est légitime que si la
 * composition redonne exactement le même texte.
 */
import type { PrismaClient } from "@prisma/client";
import { departementDeClient } from "./dbCloisonne";

export interface IdentiteDepartement {
  id: string;
  /** « MEN ». */
  code: string;
  /** « Menoua ». */
  nom: string;
  /** « de la Menoua » — tel que cela s'écrit dans une phrase. */
  nomAvecArticle: string;
  /** « DDEPIA-Menoua ». */
  sigle: string;
  /** « SID DDEPIA-Menoua » — le nom de l'application, affiché et en métadonnée. */
  application: string;
  /** « MINEPIA DDEPIA-Menoua » — l'expéditeur des relances. */
  expediteur: string;
  /** L'intitulé long, en capitales, tel que l'imprime l'en-tête du canevas. */
  intituleOfficiel: string;
  /** « Délégation Départementale de la Menoua ». */
  intituleCourt: string;
  /** « MENOUA » — la graphie du canevas. */
  nomCanevas: string;
  /** « TOTAL MENOUA » — l'en-tête de la colonne de total des exports. */
  colonneTotal: string;
}

/**
 * Compose l'identité à partir des seules données du département.
 *
 * Séparée de la lecture en base pour être vérifiable sans base — et pour que le
 * test puisse figer les intitulés historiques.
 */
export function composerIdentite(d: {
  id: string;
  code: string;
  nom: string;
  nomAvecArticle: string | null;
}): IdentiteDepartement {
  const nomAvecArticle = d.nomAvecArticle?.trim() || `de ${d.nom}`;
  const sigle = `DDEPIA-${d.nom}`;

  return {
    id: d.id,
    code: d.code,
    nom: d.nom,
    nomAvecArticle,
    sigle,
    application: `SID ${sigle}`,
    expediteur: `MINEPIA ${sigle}`,
    // L'apostrophe typographique de « L’ÉLEVAGE » est celle du document
    // officiel : ne pas la remplacer par une apostrophe droite.
    intituleOfficiel:
      "DÉLÉGATION DÉPARTEMENTALE DE L’ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES " +
      nomAvecArticle.toUpperCase(),
    intituleCourt: `Délégation Départementale ${nomAvecArticle}`,
    nomCanevas: d.nom.toUpperCase(),
    colonneTotal: `TOTAL ${d.nom.toUpperCase()}`,
  };
}

/**
 * L'identité du département de l'appelant.
 *
 * `Departement` n'est pas une table cloisonnée — c'est l'unité de cloisonnement
 * elle-même — mais on la retrouve par les arrondissements que `db` laisse voir,
 * ce qui garantit qu'on nomme bien le département de CETTE session et non le
 * premier venu.
 */
export async function identiteDepartement(db: PrismaClient): Promise<IdentiteDepartement> {
  /*
   * On demande son département au CLIENT, qui le connaît — et non aux lignes
   * qu'il laisse voir. Le déduire des arrondissements paraissait plus élégant,
   * mais échouait pour un département qui n'en a pas encore : ses relances
   * tombaient alors en erreur au lieu de ne rien faire.
   *
   * `Departement` n'est pas une table cloisonnée ; la lire par SON identifiant
   * est donc à la fois possible et exact.
   */
  const departementId = departementDeClient(db);
  if (!departementId) {
    throw new Error(
      "Département introuvable pour cette session : impossible de nommer le service " +
        "dans un document officiel. L'appelant doit passer par un client cloisonné."
    );
  }

  const d = await db.departement.findUnique({
    where: { id: departementId },
    select: { id: true, code: true, nom: true, nomAvecArticle: true },
  });
  if (!d) {
    throw new Error(`Département « ${departementId} » déclaré mais absent de la base.`);
  }
  return composerIdentite(d);
}

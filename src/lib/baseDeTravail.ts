/**
 * baseDeTravail.ts — le client des tests, des scripts et des contrôles.
 *
 * Depuis que les politiques de sécurité par ligne sont posées, une connexion
 * qui ne déclare aucun département ne voit AUCUNE ligne. C'est voulu : un
 * chemin non cloisonné ne doit rien voir plutôt que tout voir.
 *
 * Conséquence pratique : un test ou un script qui ouvre un `new PrismaClient()`
 * et lit des données trouve une base vide, et ses assertions passent au vert
 * pour de mauvaises raisons — « aucune ligne » ressemble à « aucune anomalie ».
 * Ils doivent donc se comporter comme l'application : déclarer leur département.
 *
 * Ce module donne ce client, une fois pour toutes, plutôt que de laisser
 * chaque fichier fabriquer le sien et oublier le cloisonnement.
 */
import { PrismaClient } from "@prisma/client";
import { clientCloisonne, transactionCloisonnee } from "./dbCloisonne";

/**
 * Le département sur lequel portent les tests et les scripts.
 *
 * Cette valeur n'est pas choisie ici : c'est celle que la migration du
 * cloisonnement a posée en DEFAULT sur les 19 tables, et à laquelle les 14 787
 * lignes existantes ont été rattachées. La coder en dur est donc exact, et non
 * une commodité.
 */
export const DEPARTEMENT_DE_TRAVAIL = "dep_menoua";

/** Le client SANS cloisonnement : pour inspecter la base elle-même — rôles,
 *  colonnes, politiques — et non les données d'un département. */
export const baseBrute = new PrismaClient({ log: ["error"] });

/** Le client cloisonné, celui qui voit les données comme une session les voit. */
export const base = clientCloisonne(baseBrute, DEPARTEMENT_DE_TRAVAIL);

/** Une vraie transaction cloisonnée, équivalente au `user.transaction` d'une session. */
export const transaction = <T>(travail: (tx: PrismaClient) => Promise<T>) =>
  transactionCloisonnee(baseBrute, DEPARTEMENT_DE_TRAVAIL, travail);

/**
 * Vérifie que le département de travail existe vraiment.
 *
 * Sans ce contrôle, un identifiant devenu faux rendrait toutes les lectures
 * vides — et un test « 0 anomalie sur 0 ligne » passerait au vert.
 */
export async function exigerDepartementDeTravail(): Promise<void> {
  const d = await baseBrute.departement.findUnique({ where: { id: DEPARTEMENT_DE_TRAVAIL } });
  if (!d) {
    throw new Error(
      `Le département de travail « ${DEPARTEMENT_DE_TRAVAIL} » n'existe pas dans cette base. ` +
        "Toutes les lectures seraient vides et les contrôles ne prouveraient rien."
    );
  }
}

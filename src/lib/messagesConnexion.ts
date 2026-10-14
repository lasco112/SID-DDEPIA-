/**
 * Messages de connexion partagés entre le serveur (qui refuse) et la page de
 * connexion (qui les affiche). Module sans dépendance serveur : la page, qui
 * est un composant client, l'importe sans tirer la base derrière elle.
 */

/** Un département préparé mais pas encore lancé par l'administrateur du système. */
export const MESSAGE_DEPARTEMENT_ETEINT =
  "Votre département n'est pas encore ouvert dans le SID EPIA-O. La date de lancement vous sera communiquée par la Délégation.";

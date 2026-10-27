/**
 * La longueur minimale du mot de passe personnel, choisi à la première
 * connexion. Abaissée de 8 à 5 caractères à la demande du Délégué
 * (27 octobre 2026) : le personnel n'y arrivait pas facilement au téléphone.
 * Utilisée par l'écran ET par le serveur : ne la changer qu'ici.
 */
export const LONGUEUR_MIN_MOT_DE_PASSE = 5;

export const MESSAGE_LONGUEUR_MOT_DE_PASSE = `Le mot de passe doit contenir au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`;

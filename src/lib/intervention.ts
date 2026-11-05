/**
 * L'INTERVENTION À DISTANCE de l'administrateur du système (demande du
 * Délégué, 4 novembre 2026) : depuis l'administration du système, il entre
 * dans un autre département pour y dépanner un collègue, avec TOUS les écrans
 * de son DD — comptes, rapports, périodes, trimestre, journal.
 *
 * Comment : un cookie (posé seulement par l'administrateur, relu à chaque
 * requête par `resoudreContexte`) fait agir la session SOUS L'IDENTITÉ DU DD
 * de ce département, dans son cloisonnement. Agir sous l'identité d'un compte
 * DU département (et non sous la sienne) est voulu : plusieurs tables ont un
 * auteur obligatoire (corrections, rapports exportés…), lu par les écrans du
 * département ; un auteur venu d'ailleurs y serait invisible et ferait échouer
 * ces écrans.
 *
 * Rien n'est caché pour autant : chaque ligne du journal écrite pendant
 * l'intervention porte `details.intervention` (« fait par l'administrateur
 * dd.menoua »), le DD du département est prévenu au début, et un bandeau
 * orange rappelle en permanence où l'on se trouve.
 */
export const COOKIE_INTERVENTION = "sid_intervention";

/** Huit heures : une intervention oubliée se termine d'elle-même. */
export const DUREE_INTERVENTION_S = 8 * 3600;

export interface Intervention {
  /** Le département où l'administrateur intervient. */
  departementId: string;
  /** « des Bamboutos ». */
  departementNomAvecArticle: string;
  /** Le compte de l'administrateur (son vrai compte). */
  administrateurId: string;
  administrateur: string;
  /** Son département d'origine, où il revient. */
  domicileId: string | null;
  domicileNom: string;
}

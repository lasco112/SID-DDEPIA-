/**
 * La remise à zéro de la démonstration, EN ARRIÈRE-PLAN.
 *
 * Depuis que chaque département de l'Ouest a sa démonstration (15 octobre
 * 2026), la remise à zéro écrit plus de 120 000 saisies : une trentaine de
 * secondes sur un poste, davantage sur le serveur — trop pour attendre la
 * réponse d'une page. Elle est donc lancée, et l'écran demande où elle en est.
 *
 * Un seul processus sert le SID : l'état tient en mémoire. Une seconde
 * demande pendant la première est refusée, jamais doublée.
 */
import { reinitialiserDonneesDemo } from "../../../prisma/seed-demo";

export interface EtatReinitialisation {
  enCours: boolean;
  debut?: string;
  fin?: string;
  resultat?: { departements: number; mois: number; saisies: number; duree: number };
  erreur?: string;
}

let etat: EtatReinitialisation = { enCours: false };

export function etatReinitialisation(): EtatReinitialisation {
  return etat;
}

/** Lance la remise à zéro ; `false` si une autre est déjà en cours. */
export function lancerReinitialisation(): boolean {
  if (etat.enCours) return false;
  const debut = new Date().toISOString();
  etat = { enCours: true, debut };
  reinitialiserDonneesDemo()
    .then((resultat) => {
      etat = { enCours: false, debut, fin: new Date().toISOString(), resultat };
    })
    .catch((e: unknown) => {
      console.error("Remise à zéro de la démonstration :", e);
      etat = { enCours: false, debut, fin: new Date().toISOString(), erreur: e instanceof Error ? e.message : "échec" };
    });
  return true;
}

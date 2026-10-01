"use client";

/**
 * Qui est connecté, pour les composants qui en ont besoin sans le recevoir en
 * paramètre (les visites guidées, retenues par compte sur le téléphone).
 * Fourni par AppShellClient.
 */
import { createContext, useContext } from "react";

export interface Utilisateur {
  username: string;
  role: string;
}

const Contexte = createContext<Utilisateur | null>(null);

export const FournisseurUtilisateur = Contexte.Provider;

export function useUtilisateur(): Utilisateur | null {
  return useContext(Contexte);
}

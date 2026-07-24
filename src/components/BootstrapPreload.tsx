"use client";

/**
 * BootstrapPreload.tsx — déclenche le téléchargement initial hors-ligne
 * (voir lib/offlineStore.ts) au montage de l'application.
 *
 * - Première connexion sur cet appareil (aucune donnée locale) : overlay
 *   bloquant le temps du téléchargement, puis message de confirmation exigé
 *   par la spécification hors-ligne : « Application prête pour une
 *   utilisation hors ligne. »
 * - Ouvertures suivantes : rafraîchissement silencieux en arrière-plan si le
 *   réseau est là ; sinon on continue avec les données déjà en local, sans
 *   jamais bloquer ni afficher d'erreur.
 */

import { useEffect, useState } from "react";
import { bootstrapPresent, telechargerBootstrap, precacherPagesRole } from "@/lib/offlineStore";
import { offlineDB } from "@/lib/dexie";

type Etat = "verification" | "telechargement" | "pret_confirmation" | "silencieux" | "erreur_premiere_fois";

export default function BootstrapPreload() {
  const [etat, setEtat] = useState<Etat>("verification");

  useEffect(() => {
    let annule = false;

    async function executer() {
      const dejaPresent = await bootstrapPresent();

      if (dejaPresent) {
        setEtat("silencieux");
        if (navigator.onLine) {
          telechargerBootstrap()
            .then(async () => {
              const meta = await offlineDB.meta.get("bootstrap");
              if (meta) await precacherPagesRole(meta.role);
            })
            .catch(() => {
              // Rafraîchissement de fond échoué (hors ligne ou réseau instable) :
              // les données déjà en local restent valables, aucune interruption.
            });
        }
        return;
      }

      // Aucune donnée locale : c'est la toute première connexion sur cet
      // appareil, le téléchargement est indispensable avant de continuer.
      if (!navigator.onLine) {
        if (!annule) setEtat("erreur_premiere_fois");
        return;
      }
      if (!annule) setEtat("telechargement");
      try {
        await telechargerBootstrap();
        const meta = await offlineDB.meta.get("bootstrap");
        if (meta) await precacherPagesRole(meta.role);
        if (!annule) {
          setEtat("pret_confirmation");
          setTimeout(() => {
            if (!annule) setEtat("silencieux");
          }, 2200);
        }
      } catch {
        if (!annule) setEtat("erreur_premiere_fois");
      }
    }

    executer();
    return () => {
      annule = true;
    };
  }, []);

  if (etat === "silencieux" || etat === "verification") return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
        {etat === "telechargement" && (
          <>
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-primary-light border-t-primary" />
            <p className="text-sm font-semibold text-gray-800">Préparation de l'utilisation hors ligne…</p>
            <p className="mt-1 text-xs text-gray-500">Téléchargement des tableaux, établissements et référentiels.</p>
          </>
        )}
        {etat === "pret_confirmation" && (
          <>
            <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700">✓</div>
            <p className="text-sm font-semibold text-green-800">Application prête pour une utilisation hors ligne.</p>
          </>
        )}
        {etat === "erreur_premiere_fois" && (
          <>
            <p className="text-sm font-semibold text-red-800">Connexion internet requise pour la première utilisation.</p>
            <p className="mt-1 text-xs text-gray-500">
              Connectez-vous à internet une première fois pour télécharger les données de l'application ; ensuite elle
              fonctionnera hors ligne.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
            >
              Réessayer
            </button>
          </>
        )}
      </div>
    </div>
  );
}

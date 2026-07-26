"use client";

/**
 * BootstrapPreload.tsx — déclenche le téléchargement initial hors-ligne
 * (voir lib/offlineStore.ts) au montage de l'application.
 *
 * - Première connexion sur cet appareil (aucune donnée locale) : overlay
 *   bloquant le temps du téléchargement, puis message de confirmation exigé
 *   par la spécification hors-ligne : « Application prête pour une
 *   utilisation hors ligne. »
 * - Ouvertures suivantes : rafraîchissement en arrière-plan si le réseau est
 *   là, signalé par un bandeau DISCRET et non bloquant ; sinon on continue
 *   avec les données déjà en local, sans jamais bloquer ni afficher d'erreur.
 *
 * Dans les deux cas une barre de progression indique où en est le
 * téléchargement des tableaux : sans elle, l'agent ne savait pas s'il pouvait
 * déjà couper le réseau, et risquait de partir en tournée avec une partie
 * seulement des 28 tableaux disponibles.
 */

import { useEffect, useState } from "react";
import { bootstrapPresent, telechargerBootstrap, precacherPagesRole } from "@/lib/offlineStore";
import { offlineDB } from "@/lib/dexie";

type Etat = "verification" | "telechargement" | "pret_confirmation" | "silencieux" | "erreur_premiere_fois";
type Progression = { faits: number; total: number } | null;

export default function BootstrapPreload() {
  const [etat, setEtat] = useState<Etat>("verification");
  const [progression, setProgression] = useState<Progression>(null);

  useEffect(() => {
    let annule = false;
    const suivre = (faits: number, total: number) => {
      if (!annule) setProgression({ faits, total });
    };

    async function executer() {
      const dejaPresent = await bootstrapPresent();

      if (dejaPresent) {
        setEtat("silencieux");
        if (navigator.onLine) {
          telechargerBootstrap()
            .then(async () => {
              const meta = await offlineDB.meta.get("bootstrap");
              if (meta) await precacherPagesRole(meta.role, suivre);
              if (!annule) setTimeout(() => !annule && setProgression(null), 1500);
            })
            .catch(() => {
              // Rafraîchissement de fond échoué (hors ligne ou réseau instable) :
              // les données déjà en local restent valables, aucune interruption.
              if (!annule) setProgression(null);
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
        if (meta) await precacherPagesRole(meta.role, suivre);
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

  const pourcentage =
    progression && progression.total > 0 ? Math.round((progression.faits / progression.total) * 100) : 0;
  const termine = progression !== null && progression.faits >= progression.total;

  // Ouvertures suivantes : bandeau discret en bas, qui n'empêche pas de
  // travailler pendant que les tableaux se mettent à jour.
  if (etat === "silencieux" || etat === "verification") {
    if (!progression) return null;
    return (
      <div className="fixed inset-x-3 bottom-3 z-[180] mx-auto max-w-sm rounded-lg border border-line bg-surface px-4 py-3 shadow-card">
        <p className="text-xs font-semibold text-ink">
          {termine
            ? "Tableaux disponibles hors ligne ✓"
            : `Téléchargement des tableaux… ${progression.faits}/${progression.total}`}
        </p>
        <BarreProgression pourcentage={termine ? 100 : pourcentage} />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
        {etat === "telechargement" && (
          <>
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-primary-light border-t-primary" />
            <p className="text-sm font-semibold text-gray-800">Préparation de l'utilisation hors ligne…</p>
            <p className="mt-1 text-xs text-gray-500">Téléchargement des tableaux, établissements et référentiels.</p>
            {progression && (
              <div className="mt-4">
                <BarreProgression pourcentage={pourcentage} />
                <p className="mt-1.5 text-xs font-semibold text-primary">
                  {progression.faits} / {progression.total} pages téléchargées
                </p>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-500">
              Ne coupez pas la connexion avant la fin : c'est ce téléchargement qui permettra de travailler sans réseau.
            </p>
          </>
        )}
        {etat === "pret_confirmation" && (
          <>
            <div className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-700">✓</div>
            <p className="text-sm font-semibold text-green-800">Application prête pour une utilisation hors ligne.</p>
            <p className="mt-1 text-xs text-gray-500">Vous pouvez maintenant couper la connexion sans rien perdre.</p>
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

/** Barre de progression du téléchargement des tableaux. */
function BarreProgression({ pourcentage }: { pourcentage: number }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-primary-light"
      role="progressbar"
      aria-valuenow={pourcentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Téléchargement des tableaux pour l'utilisation hors ligne"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, pourcentage))}%` }}
      />
    </div>
  );
}

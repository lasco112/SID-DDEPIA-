"use client";

/**
 * error.tsx — écran de secours affiché quand une page plante côté navigateur.
 *
 * Remplace le message technique en anglais « Application error: a client-side
 * exception has occurred », incompréhensible pour les agents de terrain.
 *
 * Cause la plus fréquente : un changement de page tenté sans réseau. Dans ce
 * cas on tente UNE FOIS un rechargement complet, qui est servi depuis le cache
 * du service worker et rétablit la page tout seul. Le drapeau en sessionStorage
 * empêche toute boucle de rechargement si le problème vient d'ailleurs.
 */

import { useEffect, useState } from "react";

const CLE_TENTATIVE = "sid-ddepia-reprise-erreur";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [horsLigne, setHorsLigne] = useState(false);

  useEffect(() => {
    const sansReseau = typeof navigator !== "undefined" && !navigator.onLine;
    setHorsLigne(sansReseau);

    if (!sansReseau) return;
    let dejaTente = false;
    try {
      dejaTente = sessionStorage.getItem(CLE_TENTATIVE) === "1";
      sessionStorage.setItem(CLE_TENTATIVE, "1");
    } catch {
      // stockage indisponible : on s'abstient de recharger, l'utilisateur a le bouton
      dejaTente = true;
    }
    if (!dejaTente) window.location.reload();
  }, []);

  useEffect(() => {
    // Une page qui s'affiche correctement remet le compteur à zéro : la
    // prochaine coupure aura droit à sa tentative de reprise automatique.
    const t = setTimeout(() => {
      try {
        sessionStorage.removeItem(CLE_TENTATIVE);
      } catch {
        /* sans conséquence */
      }
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-appbg p-6">
      <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 text-center shadow-card">
        <h1 className="text-lg font-bold text-primary-dark">
          {horsLigne ? "Page indisponible sans connexion" : "Une erreur est survenue"}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {horsLigne
            ? "Cette page n'a pas encore été téléchargée sur cet appareil. Vos saisies déjà effectuées sont bien conservées : elles partiront dès le retour du réseau."
            : "L'affichage de cette page a échoué. Vos saisies déjà effectuées sont conservées sur cet appareil."}
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            Réessayer
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/dashboard")}
            className="rounded-btn border border-line px-4 py-2 text-sm font-semibold text-ink-muted"
          >
            Revenir au tableau de bord
          </button>
        </div>
      </div>
    </div>
  );
}

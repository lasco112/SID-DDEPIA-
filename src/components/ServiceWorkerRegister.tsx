"use client";

/**
 * ServiceWorkerRegister.tsx — enregistre public/sw.js et affiche le message
 * exigé par la spécification hors-ligne quand une nouvelle version est prête
 * ("Une nouvelle version est disponible. Actualiser maintenant.") : le
 * service worker installé reste en ATTENTE (voir sw.js, pas de skipWaiting
 * automatique) jusqu'à ce que l'utilisateur clique — jamais de bascule
 * imposée en pleine saisie. Les saisies non synchronisées vivent dans
 * IndexedDB (lib/dexie.ts), une ressource de stockage totalement distincte
 * du cache du service worker : l'actualisation ne les touche jamais.
 */

import { useEffect, useState } from "react";

export default function ServiceWorkerRegister() {
  const [misAJourDisponible, setMisAJourDisponible] = useState(false);
  const [enAttente, setEnAttente] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let rechargementEnCours = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (rechargementEnCours) return;
      rechargementEnCours = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          setEnAttente(reg.waiting);
          setMisAJourDisponible(true);
        }
        reg.addEventListener("updatefound", () => {
          const nouveau = reg.installing;
          if (!nouveau) return;
          nouveau.addEventListener("statechange", () => {
            if (nouveau.state === "installed" && navigator.serviceWorker.controller) {
              setEnAttente(nouveau);
              setMisAJourDisponible(true);
            }
          });
        });
      })
      .catch(() => {
        // Échec silencieux : l'appli reste utilisable en ligne normalement.
      });
  }, []);

  function actualiser() {
    enAttente?.postMessage({ type: "SKIP_WAITING" });
  }

  if (!misAJourDisponible) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[190] mx-auto max-w-md rounded-lg border border-primary-light bg-white p-4 shadow-xl">
      <p className="text-sm font-semibold text-gray-800">Une nouvelle version est disponible.</p>
      <p className="mt-1 text-xs text-gray-500">Vos saisies non encore synchronisées sont conservées.</p>
      <button
        type="button"
        onClick={actualiser}
        className="mt-3 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-dark"
      >
        Actualiser maintenant
      </button>
    </div>
  );
}

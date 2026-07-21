"use client";

/**
 * ServiceWorkerRegister.tsx — enregistre public/sw.js au chargement, pour
 * permettre l'installation de l'appli (téléphone/ordinateur) et son
 * fonctionnement hors ligne (page déjà visitée + saisies via Dexie).
 */

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Échec silencieux : l'appli reste utilisable en ligne normalement.
      });
    }
  }, []);

  return null;
}

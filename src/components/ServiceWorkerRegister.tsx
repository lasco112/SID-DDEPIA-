"use client";

/**
 * ServiceWorkerRegister.tsx — enregistre public/sw.js. Les mises à jour
 * s'appliquent automatiquement, sans aucune action de l'utilisateur (demande
 * explicite du DD : son équipe de terrain n'a pas le niveau technique pour
 * gérer une bannière "Actualiser maintenant" — un geste manuel oublié
 * revenait à voir des données périmées indéfiniment). Sans risque de perte :
 * chaque saisie est écrite dans IndexedDB (lib/dexie.ts) à chaque frappe, pas
 * seulement à la soumission, donc un rechargement automatique ne perd jamais
 * plus que la lettre en cours de frappe.
 *
 * Un petit message discret et auto-disparaissant s'affiche juste après le
 * rechargement, pour que personne ne s'inquiète en voyant l'écran clignoter —
 * mais il ne demande jamais de clic.
 */

import { useEffect, useState } from "react";

const CLE_MAJ_APPLIQUEE = "sid-ddepia-maj-appliquee";

export default function ServiceWorkerRegister() {
  const [majAppliquee, setMajAppliquee] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLE_MAJ_APPLIQUEE)) {
        sessionStorage.removeItem(CLE_MAJ_APPLIQUEE);
        setMajAppliquee(true);
        const t = setTimeout(() => setMajAppliquee(false), 2500);
        return () => clearTimeout(t);
      }
    } catch {
      // stockage indisponible : tant pis pour le message, l'actualisation reste automatique
    }
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let rechargementEnCours = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (rechargementEnCours) return;
      rechargementEnCours = true;
      try {
        sessionStorage.setItem(CLE_MAJ_APPLIQUEE, "1");
      } catch {
        // pas grave, le rechargement a lieu quand même
      }
      window.location.reload();
    });

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Échec silencieux : l'appli reste utilisable en ligne normalement.
    });
  }, []);

  if (!majAppliquee) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-[190] mx-auto max-w-md rounded-lg border border-primary-light bg-white px-4 py-2.5 shadow-xl">
      <p className="text-xs font-semibold text-gray-600">Application mise à jour.</p>
    </div>
  );
}

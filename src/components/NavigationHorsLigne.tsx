"use client";

/**
 * NavigationHorsLigne.tsx — rend la navigation possible sans réseau.
 *
 * Par défaut, cliquer un lien dans l'application ne recharge PAS la page :
 * Next.js demande au serveur un fragment (en-tête « RSC ») et remplace le
 * contenu. Sans réseau cette requête échoue et l'écran affiche
 * « Application error: a client-side exception has occurred » — c'est ce que
 * voyaient les agents dès qu'ils changeaient de page hors connexion.
 *
 * On intercepte donc les clics quand l'appareil est hors ligne pour forcer un
 * rechargement complet de la page : celui-ci passe par le service worker, qui
 * le sert depuis le cache (toutes les pages du rôle y sont préchargées, voir
 * offlineStore.precacherPagesRole). L'utilisateur ne voit aucune différence,
 * sinon que ça fonctionne.
 *
 * Interception en phase de CAPTURE pour passer avant le routeur de Next.js.
 */

import { useEffect } from "react";

export default function NavigationHorsLigne() {
  useEffect(() => {
    function interception(e: MouseEvent) {
      if (navigator.onLine) return;
      // Laisse passer les clics enrichis (nouvel onglet, téléchargement…) :
      // le navigateur les gère lui-même, sans passer par le routeur.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const lien = (e.target as HTMLElement | null)?.closest?.("a");
      if (!lien) return;

      const href = lien.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (lien.target && lien.target !== "_self") return;
      if (lien.hasAttribute("download")) return;

      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // La déconnexion doit atteindre le serveur : inutile hors ligne, et un
      // rechargement forcé n'y changerait rien.
      if (url.pathname.startsWith("/api/")) return;

      e.preventDefault();
      window.location.assign(url.href);
    }

    document.addEventListener("click", interception, true);
    return () => document.removeEventListener("click", interception, true);
  }, []);

  return null;
}

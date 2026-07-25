/**
 * sw.js — Service worker minimal, écrit à la main (pas de bibliothèque tierce,
 * pour éviter d'introduire des dépendances non maintenues juste pour ça).
 * ---------------------------------------------------------------------------
 * Stratégie volontairement simple et sûre :
 *  - jamais d'interception des appels /api/* : le réseau + Dexie (déjà en
 *    place, voir src/lib/dexie.ts) gèrent seuls la saisie hors-ligne réelle ;
 *    mettre en cache des réponses API serait risqué (données par utilisateur).
 *  - pages (navigation) : réseau d'abord, mise en cache de la réponse au
 *    passage, secours sur le cache si le réseau échoue, secours final sur
 *    /offline.html si la page n'a jamais été visitée en ligne.
 *  - fichiers statiques Next.js (/_next/static/*), manifeste, icônes : cache
 *    d'abord (immuables, noms de fichiers déjà versionnés par Next.js).
 */

// À INCRÉMENTER à chaque fois qu'un fichier servi "cache d'abord" change
// (logo, manifeste). Le handler `activate` supprime tous les caches dont le
// nom diffère : c'est le seul mécanisme qui purge réellement l'ancien contenu
// sur les appareils déjà installés. Doit rester identique à CACHE_NAME dans
// src/lib/offlineStore.ts.
const CACHE_NAME = "sid-ddepia-v3";
const OFFLINE_URL = "/offline.html";
const PRECACHE = ["/", OFFLINE_URL, "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  // skipWaiting() systématique : les agents de terrain n'ont pas à cliquer un
  // bouton "Actualiser" pour recevoir chaque mise à jour (demande explicite du
  // DD — équipe peu à l'aise avec l'informatique, ce geste manuel oublié =
  // données périmées vues indéfiniment). Sans risque de perte : chaque saisie
  // est écrite dans IndexedDB à chaque frappe (voir lib/dexie.ts), pas
  // seulement à la soumission — un rechargement en plein milieu ne perd donc
  // jamais plus que la lettre en cours de frappe.
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Fichiers réellement immuables : Next.js versionne leur nom à chaque build,
  // une URL donnée ne change donc jamais de contenu — cache d'abord sans risque.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          })
      )
    );
    return;
  }

  // Logo et manifeste : noms de fichiers FIXES dont le contenu, lui, change
  // (nouveau logo). Un simple "cache d'abord" servait l'ancien logo pour
  // toujours — c'est ce qui laissait l'ancienne icône dans l'onglet et sur
  // l'écran d'accueil des téléphones. On sert donc le cache immédiatement
  // (donc toujours disponible hors ligne, sans attente) TOUT EN rafraîchissant
  // en arrière-plan : la version suivante est à jour, sans aucune action.
  if (url.pathname.startsWith("/icon-") || url.pathname === "/manifest.json") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const reseau = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || reseau;
      })
    );
  }
});

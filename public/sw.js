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

const CACHE_NAME = "sid-ddepia-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = ["/", OFFLINE_URL, "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
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

  const estStatiqueImmuable =
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon-") || url.pathname === "/manifest.json";
  if (estStatiqueImmuable) {
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
  }
});

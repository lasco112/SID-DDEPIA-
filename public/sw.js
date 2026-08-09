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
const CACHE_NAME = "sid-ddepia-v6";
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

  // ignoreVary est INDISPENSABLE : Next.js renvoie sur chaque page
  // « Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch, Accept-Encoding ».
  // Sans cette option, une page pourtant présente dans le cache n'était pas
  // retrouvée dès que l'un de ces en-têtes différait d'une requête à l'autre
  // (l'encodage accepté change couramment) — d'où des pages « indisponibles
  // hors ligne » alors qu'elles avaient bien été téléchargées.
  const OPTIONS_CACHE = { ignoreVary: true };

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(
          async () =>
            (await caches.match(request, OPTIONS_CACHE)) ||
            (await caches.match(url.pathname, OPTIONS_CACHE)) ||
            (await caches.match(OFFLINE_URL, OPTIONS_CACHE))
        )
    );
    return;
  }

  // Navigation INTERNE à l'application (clic sur un lien) : Next.js ne recharge
  // pas la page, il demande au serveur un fragment via l'en-tête « RSC ».
  // Ces requêtes n'étaient pas interceptées ici : hors ligne elles échouaient
  // et faisaient planter l'écran avec « Application error ». On ne peut pas y
  // répondre depuis le cache (un fragment RSC n'est pas du HTML), mais on
  // renvoie une erreur propre 503 que la page sait rattraper en effectuant un
  // rechargement complet, lequel EST servi depuis le cache (voir
  // NavigationHorsLigne.tsx et app/error.tsx).
  const estFragmentRSC = request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (estFragmentRSC) {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response("", {
            status: 503,
            statusText: "Hors ligne",
            headers: { "X-Hors-Ligne": "1" },
          })
      )
    );
    return;
  }

  // Fichiers réellement immuables : Next.js versionne leur nom à chaque build,
  // une URL donnée ne change donc jamais de contenu — cache d'abord sans risque.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request, OPTIONS_CACHE).then(
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
      caches.match(request, OPTIONS_CACHE).then((cached) => {
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

// ---------------------------------------------------------------------------
// NOTIFICATIONS SYSTÈME (Web Push)
// ---------------------------------------------------------------------------
// Reçues même application fermée, tant que l'appareil a du réseau et que
// l'agent a accepté l'autorisation une fois. Sur iPhone, l'application doit
// avoir été installée sur l'écran d'accueil : c'est une limite d'iOS, pas du
// SID.

self.addEventListener("push", (event) => {
  let donnees = { titre: "SID DDEPIA-Menoua", corps: "Vous avez une nouvelle notification.", lien: "/dashboard" };
  try {
    if (event.data) donnees = { ...donnees, ...event.data.json() };
  } catch {
    // charge utile illisible : on affiche le message générique plutôt que rien
  }

  event.waitUntil(
    self.registration.showNotification(donnees.titre, {
      body: donnees.corps,
      icon: "/icon-512.png?v=2",
      badge: "/icon-512.png?v=2",
      lang: "fr",
      data: { lien: donnees.lien },
      // Regroupe les notifications successives au lieu d'empiler dix bandeaux
      // sur le téléphone d'un agent qui reçoit plusieurs corrections d'affilée.
      tag: "sid-ddepia",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const lien = event.notification.data?.lien || "/dashboard";

  // Si l'application est déjà ouverte quelque part, on y va au lieu d'ouvrir
  // un second onglet — sur téléphone, deux onglets du SID prêtent à confusion.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if ("focus" in f) {
          f.navigate(lien);
          return f.focus();
        }
      }
      return self.clients.openWindow(lien);
    })
  );
});

---
name: sid-offline-first
description: Fonctionnement hors ligne du SID DDEPIA — service worker écrit à la main, cache des pages et des fragments Next, base locale Dexie/IndexedDB, file de synchronisation et arbitrage des conflits. À charger avant de toucher public/sw.js, offlineStore.ts, dexie.ts, synchronisation.ts, la route /api/sync, /api/bootstrap, ou toute page de saisie devant fonctionner sans réseau.
---

# Hors ligne dans le SID DDEPIA

Les agents saisissent sur le terrain, sans réseau, parfois plusieurs jours.
L'application doit fonctionner **sans qu'ils aient rien à faire** : pas de
bouton « Actualiser », pas de vidage de cache, pas de réinstallation. Toute
solution qui exige une manipulation technique de leur part est refusée.

## Les pièges du service worker

`public/sw.js` est écrit à la main. Quatre erreurs déjà commises :

**1. `CACHE_NAME` non incrémenté.** Le nom du cache doit être identique dans
`public/sw.js` et `src/lib/offlineStore.ts`, et **changé** dès qu'un actif
statique change. Sans cela, les appareils gardent l'ancienne version
indéfiniment — c'est ainsi qu'un ancien logo est resté affiché alors que le
serveur servait déjà le bon fichier.

**2. `Vary` casse la correspondance de cache.** Les pages Next renvoient
`Vary: RSC, Next-Router-State-Tree, Next-Router-Prefetch, Accept-Encoding`.
`caches.match()` échoue silencieusement si l'on n'utilise pas
`{ ignoreVary: true }`.

**3. Les requêtes RSC ne sont pas des navigations.** La navigation côté client
de Next demande des fragments avec l'en-tête `RSC: 1`. Ce ne sont **pas** des
requêtes `mode === "navigate"` : non interceptées, elles produisent
« Application error » dès que le réseau tombe. Il leur faut une branche
dédiée, renvoyant un 503 propre que le client sait interpréter.

**4. Mettre en cache le HTML ne suffit pas.** Une page dont le fragment
`/_next/static/chunks/app/…/page.js` manque s'ouvre blanche. `offlineStore.ts`
analyse donc le HTML de chaque page pour en extraire et précacher les URL
`/_next/static`.

Complément : `src/components/NavigationHorsLigne.tsx` intercepte les clics en
phase de capture pour forcer des navigations complètes quand
`!navigator.onLine`, et `src/app/error.tsx` propose un rechargement unique
(protégé par `sessionStorage`) plutôt qu'un écran d'erreur en anglais.

## Base locale

Dexie / IndexedDB, base `SID_DDEPIA_MENOUA`. Les index composés sont **scopés
par `username`** : plusieurs comptes peuvent se succéder sur le même appareil
sans mélanger leurs données. Ne jamais écrire une requête locale qui oublie ce
scope.

Attention : effacer l'historique du navigateur **n'efface pas forcément
IndexedDB**. Un utilisateur peut désinstaller, réinstaller, et retrouver ses
données locales intactes. Ne jamais en déduire qu'une purge côté serveur a
atteint les appareils — c'est à cela que sert le marqueur
`ConfigSysteme.donnees_purgees_le`, propagé par `/api/bootstrap`.

## Synchronisation

`src/lib/synchronisation.ts` (client) et `src/app/api/sync/route.ts` (serveur).

**Idempotence par clés naturelles.** L'`upsert` se fait sur
`@@unique([rapportId, fieldCode])` et
`@@unique([rapportId, etablissementId, fieldCode])` — **jamais sur `clientId`**.
Un upsert sur `clientId` échoue avec
`Unique constraint failed on the fields: (rapportId, fieldCode)` dès que deux
appareils touchent la même cellule, et bloque toute la file de l'utilisateur.

**Arbitrage des conflits par `modifieLe`.** `syncedAt` est la date d'arrivée au
serveur, `modifieLe` la date de modification sur l'appareil. C'est la
modification la plus récente qui gagne : une correction faite par le DA ne doit
pas être écrasée par un agent qui se reconnecte après une semaine hors ligne.
Les dates futures sont bornées côté serveur (horloges d'appareil déréglées).

**Isolation ligne à ligne.** Une ligne en erreur ne doit pas faire échouer le
lot. Les lignes refusées repartent dans `echecs` et sont marquées
`ERREUR_SYNCHRO` localement.

**Ne jamais confirmer un échec.** Placer une ligne échouée dans `confirmedIds`
fait vider la file de l'appareil alors que le serveur n'a rien écrit : la
donnée est perdue définitivement, sans trace. C'est le pire bug possible dans
ce système.

**Préserver le travail local plus récent.** À la fusion des saisies du serveur,
une saisie locale non synchronisée et plus récente n'est jamais écrasée.

## Diagnostic quand un utilisateur dit « mes données ne remontent pas »

Dans l'ordre :

1. Le journal d'activité : combien de cellules les entrées `SYNC` de ce compte
   totalisent-elles réellement ?
2. Existe-t-il des entrées `SYNC_PARTIEL` ? Si non, **aucune ligne n'a été
   refusée** : le serveur a stocké exactement ce qu'il a reçu, et le problème
   est sur l'appareil, en amont de l'envoi.
3. Le taux de remplissage en Supervision, comparé aux autres arrondissements.
   Si les autres sont normaux, le système fonctionne et le cas est
   spécifique à l'appareil.
4. Demander la sauvegarde locale (« Exporter une sauvegarde »,
   `BackupLocalButton`) : c'est le seul moyen de savoir combien de cellules
   existent réellement sur l'appareil et dans quel `statutLocal`.

Ne jamais conclure « les données sont perdues » ni « le serveur a un bug » sans
avoir fait ces quatre vérifications.

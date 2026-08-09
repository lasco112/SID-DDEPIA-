# SID DDEPIA-Menoua — règles permanentes du projet

Système d'information de la Délégation Départementale de l'Élevage, des Pêches
et des Industries Animales de la Menoua (MINEPIA, Cameroun). Il produit le
**rapport mensuel départemental** à partir des saisies des six arrondissements :
Dschang, Fokoué, Fongo-Tongo, Nkong-Ni, Penka-Michel, Santchou.

Les utilisateurs sont des agents de terrain dont la maîtrise technologique est
faible et la connexion intermittente. Toute solution qui exige d'eux une
manipulation technique (vider un cache, cliquer un bouton « Actualiser »,
réinstaller) est une solution refusée.

---

## 1. Règles absolues

**Ne jamais pousser sur GitHub ou Railway sans un ordre explicite de l'utilisateur.**
Même quand le travail est fini, testé et vert. On attend l'autorisation.

**Le canevas officiel papier fait autorité.** La structure des tableaux, les
libellés et les rubriques répliquent le formulaire administratif du MINEPIA.
Ne jamais simplifier, fusionner ni « rationaliser » un tableau parce que la
structure paraît redondante : elle est imposée par l'administration.

**Ne jamais conclure qu'une fonction marche sans l'avoir exercée.** Lire le code
ne prouve rien. Voir plus bas comment tester pour de vrai.

---

## 2. Deux bases de données, à ne jamais confondre

| Environnement | `DATABASE_URL` |
|---|---|
| Local (`.env`) | `localhost:5432/sid_menoua` |
| Production | `postgis.railway.internal` (Railway) |

Un test local ne dit **rien** sur l'état de la production. Quand l'utilisateur
signale un problème vécu par un collègue, ce problème est en production : il
faut le reproduire ou l'instrumenter là où il se produit, pas en local.

`DEMO_DATABASE_URL` est une troisième base, distincte, pour les comptes de
démonstration. Une session démo ne doit jamais atteindre une route qui
interroge la base réelle : voir `CHEMINS_SURS_DEMO` dans `src/middleware.ts`.

---

## 3. Pièges d'architecture déjà payés cher

Chacun de ces points a causé un bug réel en production.

**Le disque de Railway est éphémère.** Le conteneur est recréé à chaque
déploiement : tout fichier écrit dans `process.cwd()/storage/` disparaît. Aucun
volume n'est configuré. Un document à conserver se stocke **en base**
(`ExportDocument.contenu`, type `Bytes`), jamais sur disque.

**Idempotence de la synchronisation : clés naturelles, pas `clientId`.** Un
`upsert` sur `clientId` produit `Unique constraint failed on the fields:
(rapportId, fieldCode)` dès que deux appareils touchent la même cellule. Les
clés qui font foi sont `@@unique([rapportId, fieldCode])` et
`@@unique([rapportId, etablissementId, fieldCode])`.

**Arbitrage des conflits par `modifieLe`, pas par `syncedAt`.** `syncedAt` est
la date d'arrivée au serveur, `modifieLe` la date de modification sur
l'appareil. C'est la modification la plus récente qui gagne — une correction
faite par le DA ne doit pas être écrasée par un agent qui se reconnecte après
une semaine hors ligne.

**Ne jamais confirmer une ligne qui a échoué.** Si la route de synchronisation
renvoie une ligne dans `confirmedIds` alors qu'elle n'a pas été écrite,
l'appareil vide sa file et la donnée est perdue définitivement. Les échecs
partent dans `echecs`.

**Middleware : la règle spécifique doit précéder la règle générale.**
`PROTECTED_PREFIXES` est parcouru avec `Array.find` : la première
correspondance gagne. `/technique/aide` doit donc être déclaré avant
`/technique`.

**Cache et hors-ligne.** Le service worker est écrit à la main
(`public/sw.js`). Trois pièges :
- `CACHE_NAME` doit être identique dans `public/sw.js` et
  `src/lib/offlineStore.ts`, et **incrémenté** à chaque changement d'actif
  statique, sinon les appareils gardent l'ancienne version ;
- les pages Next renvoient `Vary: RSC, Next-Router-State-Tree, …`, donc
  `caches.match()` exige `{ ignoreVary: true }` ;
- la navigation client de Next demande des fragments avec l'en-tête `RSC: 1` :
  ce ne sont pas des requêtes `mode === "navigate"`, il faut les intercepter
  séparément sous peine d'« Application error » hors ligne ;
- mettre en cache le HTML d'une page ne suffit pas : il faut aussi ses
  fragments `/_next/static`, sinon la page s'ouvre blanche.

**Référentiels.** Tout code se terminant par `_AUTRE` déclenche
automatiquement un champ « Veuillez préciser », rendu `libellé (précision)`
dans les rapports. Les catégories `CATEGORIES_STRUCTURELLES` (ESPECE,
VOLAILLE, ESPECE_HALIEUTIQUE) créent automatiquement des colonnes MATRICE à la
validation du DD — sauf pour le tableau T11, dont les colonnes sont codées en
dur dans `canevasLayout.ts`.

---

## 4. Rôles

`DD` (Délégué Départemental), `DA` (Délégué d'Arrondissement), `AGENT_SAISIE`,
les quatre chefs de section (`CHEF_BAC`, `CHEF_SSV`, `CHEF_PSA`,
`CHEF_SPAIH`), `ADMIN_TECH`.

Deux principes qui reviennent constamment :

- **L'ADMIN_TECH n'a aucun droit métier.** Pas de gestion de comptes, pas
  d'accès aux données de rapport.
- **Le DD est le supérieur hiérarchique, pas un utilisateur parmi d'autres.**
  Il n'a pas de section propre : tout contrôle d'accès fondé sur `sectionId`
  le bloque sur l'intégralité du système. Il peut corriger les données de
  n'importe quel arrondissement et valider à la place d'un chef de section —
  à condition que ce soit tracé.

Le contrôle d'accès se fait à **deux niveaux** : `src/middleware.ts` filtre par
rôle, puis chaque route refait le contrôle fin (arrondissement, section) via
`src/lib/permissions.ts`. Ne jamais supprimer l'un en s'appuyant sur l'autre.

---

## 5. Traçabilité

Toute modification d'une donnée déjà saisie passe par le modèle `Correction` :
`valeurAvant`, `valeurApres`, **motif obligatoire**, auteur, horodatage. Plus
une entrée `AuditLog`. C'est une exigence administrative, pas une commodité de
développement : aucune correction silencieuse.

---

## 6. Comment tester pour de vrai

L'utilisateur a déjà eu à signaler que des vérifications ne prouvaient rien.
Une fonction n'est vérifiée que lorsqu'elle a été **exercée**, avec le rôle
concerné, et que le résultat a été constaté en base.

`npx tsc --noEmit` et `npx next build` sont un préalable, pas une preuve.

Méthode qui fonctionne ici, sans jamais saisir de mot de passe : forger un
jeton de session avec `encode` de `next-auth/jwt` et `NEXTAUTH_SECRET`, le
poser dans le cookie `next-auth.session-token`, puis appeler les routes avec
`fetch`. Cela permet de vérifier en quelques secondes qu'un DA ne peut pas
lire les données d'un autre arrondissement, qu'un motif vide est refusé, ou
qu'une valeur a réellement changé en base.

Toujours tester **le refus** autant que le succès : un contrôle d'accès qui
laisse passer est un bug silencieux.

Toujours **remettre en état** les données touchées par un test (valeur
d'origine restaurée, traces de test supprimées) : la base locale sert aussi aux
démonstrations.

Le serveur de développement tourne sur le port 3000 et **l'utilisateur s'en
sert lui-même** : ne pas l'arrêter après une vérification, sinon il voit
l'application tomber et croit à une panne.

Deux pièges pendant la vérification :

- **`next build` pendant que `npm run dev` tourne écrase `.next`** et casse le
  serveur de développement (feuilles de style en 404, `Cannot find module
  './XXXX.js'`). Faire le build avant, ou redémarrer le serveur après.
- **Après une migration, le serveur de développement garde l'ancien client
  Prisma** : un champ tout juste ajouté produit `Unknown argument`. Relancer
  `npx prisma generate` **puis redémarrer le serveur**.

---

## 7. Commandes

```bash
npm run dev          # serveur de développement, port 3000
npx tsc --noEmit     # vérification des types
npx next build       # build de production
npm run seed         # jeu de données de référence
```

Migrations : `npx prisma migrate dev --name <nom>` en local. En production,
elles sont appliquées au démarrage du conteneur —
`"start": "prisma migrate deploy && next start"`. Une migration poussée est
donc appliquée automatiquement au déploiement suivant : elle doit être
réversible ou non destructive.

Dépôt : `https://github.com/lasco112/SID-DDEPIA-.git`, branche `main`.

---

## 8. Langue et style

Toute l'interface, tous les messages d'erreur et tous les commentaires de code
sont **en français**. Les messages destinés aux utilisateurs s'adressent à des
agents administratifs, pas à des développeurs : « Votre rapport doit être
soumis avant de générer le document. », jamais « Error 409: workflow
incomplete ».

Les réponses à l'utilisateur sont en français. Ses messages en majuscules
signalent une exigence ferme, pas de l'agacement.

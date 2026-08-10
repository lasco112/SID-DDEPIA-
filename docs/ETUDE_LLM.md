# Étude — faut-il intégrer un modèle de langage dans le SID ?

Demande du Délégué Départemental du 11 août 2026. **Session d'analyse : aucun
code n'a été écrit ni modifié.**

Ce document est l'arbitrage que `docs/ANALYSE_ET_VALIDATION.md` § 1 réservait
au DD. Quelle que soit la décision, c'est là qu'elle devra être reportée.

Méthode : le code a été relu, pas supposé. Chaque constat porte sa référence
`fichier:ligne`, un chiffre mesuré, ou la mention **NON VÉRIFIÉ**. Deux
constats ont été vérifiés en exerçant réellement le système contre le serveur
de développement et la base locale.

---

# 1. État actuel du SID — architecture réellement constatée

## 1.1 Ordres de grandeur

| Mesure | Valeur constatée |
|---|---|
| Fichiers TypeScript / TSX dans `src/` | 178 |
| Lignes de code dans `src/` | 18 593 |
| Routes API (`route.ts`) | 63 |
| Modèles Prisma | 28, plus 9 énumérations |
| Migrations appliquées | 17 |
| Tableaux du canevas actifs | 28 |
| Champs actifs | 413, dont 393 en tableaux MATRICE |
| Comptes en base locale | 14 (1 DD, 7 DA, 4 chefs, 1 agent, 1 ADMIN_TECH) |
| Utilisateurs réels attendus | de l'ordre de 20 à 30 |
| Rapports produits par an | 12 mensuels + 4 trimestriels à venir |

**Ce dernier chiffre commande tout le reste de l'étude.** Le SID n'est pas une
application à fort trafic. C'est un outil administratif à faible volume et à
forte exigence d'exactitude. Toute la suite en découle.

## 1.2 Frontend

Next.js 14, App Router, React 18, Tailwind. Pas de framework d'état, pas de
bibliothèque de composants tierce. Deux natures de pages coexistent :

- des **Server Components** qui interrogent Prisma directement dans
  `page.tsx` (ex. `src/app/dd/supervision/page.tsx`) ;
- des **composants client** (`"use client"`) qui lisent Dexie et appellent les
  routes API.

Il n'y a pas de couche « service » entre les pages et la base. Une page serveur
et une route API qui répondent à la même question réimplémentent chacune sa
requête. **C'est le point d'architecture le plus important pour la question
posée** : voir § 7.2.

## 1.3 Backend

Il n'y a pas de backend séparé. Les 63 routes API de Next.js *sont* le backend.
Un seul processus Node sert les pages, les API, la génération des documents et
— depuis `src/instrumentation.ts` — le planificateur des relances.

## 1.4 Base de données

PostgreSQL, accédé par Prisma 5. Trois bases distinctes :

| Base | Rôle | Accessible depuis un poste de développement |
|---|---|---|
| locale | développement | oui |
| production (Railway) | les six arrondissements | **non** (réseau interne Railway) |
| démonstration (`DEMO_DATABASE_URL`) | formation et démonstration | oui |

## 1.5 Authentification

NextAuth v4, stratégie **JWT** (`src/lib/auth.ts:143`), durée 30 jours. Deux
fournisseurs `credentials` : production et démonstration, sur deux bases
séparées — un compte réel ne peut pas s'authentifier sur le second et
réciproquement (`auth.ts:44-46`).

Deux mécanismes valent d'être notés, parce qu'une couche IA devrait s'y plier :

- **la révocation d'appareil est vérifiée à chaque résolution de session**, pas
  seulement à la connexion (`auth.ts:108-117`) : un jeton émis avant
  `sessionRevoqueeLe` est invalidé ;
- **le jeton n'est jamais la source de vérité** : `requireUser()` relit
  l'utilisateur en base à chaque requête (`permissions.ts:102`).

## 1.6 Rôles et permissions

Huit rôles : `DD`, `DA`, `AGENT_SAISIE`, `CHEF_BAC`, `CHEF_SSV`, `CHEF_PSA`,
`CHEF_SPAIH`, `ADMIN_TECH`.

Le contrôle se fait à **deux niveaux, et deux seulement** :

1. `src/middleware.ts` — 23 règles de préfixe d'URL, résolues par
   `Array.find` : **la première règle qui correspond gagne**
   (`middleware.ts:95`). Ne connaît que le rôle.
2. `src/lib/permissions.ts` — dans chaque handler :
   `assertRole`, `assertProprietaireArrondissement` (`:167`),
   `assertProprietaireSection` (`:173`), `peutConsulterTableauSection`
   (`:162`).

**Le filtrage territorial n'est centralisé nulle part.** Il n'existe aucune
fonction du type « donne-moi les données que cet utilisateur a le droit de
voir ». Chaque route reconstruit son `where` Prisma à la main. C'est le
principal obstacle technique à l'exigence du DD : *« je veux que les mêmes
permissions s'appliquent aux boutons, aux API et à l'IA »*. Voir § 7.2.

## 1.7 Stockage

- **Les documents Word sont conservés en base**, dans
  `ExportDocument.contenu Bytes?` (`prisma/schema.prisma:595`). Le commentaire
  du schéma dit pourquoi : le disque du conteneur Railway est effacé à chaque
  redéploiement. Versionnés par arrondissement, empreinte SHA-256.
- `storage/backups` et `storage/exports` existent sur disque — donc éphémères
  en production. NON VÉRIFIÉ : ce qu'ils contiennent réellement en production.
- 3 gabarits `.docx` dans `templates/`, plus le canevas officiel de référence.

## 1.8 Fonctionnement hors ligne / PWA

- Dexie / IndexedDB, base `SID_DDEPIA_MENOUA`, **schéma version 5**
  (`src/lib/dexie.ts:208`).
- Service worker **écrit à la main** (`public/sw.js`), `CACHE_NAME =
  "sid-ddepia-v6"` — valeur **dupliquée** dans `src/lib/offlineStore.ts:190`,
  à tenir synchronisée manuellement.
- `precacherPagesRole` (`offlineStore.ts:205`) précharge non seulement les
  pages du rôle mais **les fichiers JS et CSS qu'elles référencent**
  (`:252`) — sans quoi une page retrouvée hors ligne s'affichait vide.
- `/api/bootstrap` redescend tableaux, référentiels, établissements, période et
  **les saisies déjà enregistrées côté serveur**, fusionnées sans jamais
  écraser un travail local plus récent (`offlineStore.ts:58-100`).

## 1.9 Synchronisation

`POST /api/sync` (`src/app/api/sync/route.ts:66`). Les propriétés durement
acquises, à ne casser sous aucun prétexte :

- écriture par **clé naturelle** (`rapportId` + `fieldCode` [+
  `etablissementId`]), jamais par `clientId` (`:172-199`) ;
- arbitrage des conflits par `modifieLe`, **plafonné à l'heure du serveur**
  pour qu'une horloge d'appareil déréglée ne donne pas le dernier mot
  permanent (`:42-47`) ;
- **une ligne en échec n'est jamais confirmée** (`:260-273`) — le commentaire
  cite le cas réel de Fokoué où l'inverse avait fait perdre des saisies
  silencieusement ;
- une ligne fautive n'emporte pas le lot ;
- recalcul systématique des champs dérivés à chaque envoi, **tracé** comme
  correction (`:294`).

## 1.10 Workflow de saisie, soumission, validation

Trois états parallèles, à ne pas confondre :

| Niveau | Champ | « validé » signifie |
|---|---|---|
| Arrondissement | `RapportArrondissement.statut` (`:343`) | `SOUMIS` ou `CLOTURE` |
| Section | `ValidationSection.statut` (`:375`) | `VALIDE` |
| Période | `PeriodeReporting.statut` (`:273`) | `ARCHIVEE` = figée |

`verifierCompletudeDD` (`rapport-docx.ts:279`) exige les six arrondissements
soumis **et** toutes les sections validées — **sauf le BAC en mensuel**
(`:299`).

## 1.11 Génération actuelle des rapports

`src/server/export/rapport-docx.ts`, 508 lignes. `docxtemplater` + `pizzip`,
`nullGetter: () => "—"` (`:494`). Les gabarits `.docx` ne sont pas dessinés à
la main : ils sont **générés** par `prisma/seed-lib/buildReportTemplates.ts` à
partir de `canevasLayout.ts`.

Quatre types de production : `DD`, `EXACT`, `DA`, `APERCU` (BROUILLON,
seul à échapper au contrôle de complétude).

## 1.12 Mécanismes de calcul existants — et ce qui n'existe pas

Ce qui existe :

- **somme** inter-arrondissements, champ par champ (`sommeMatrice:61`,
  `sommeNominatif:87`, `sommeEvenementNumerique:101`) ;
- totaux de colonnes et de lignes du canevas (`ajouterTotauxColonnes:334`) ;
- **comparaison au mois précédent uniquement** (`resolvePeriodeMois:51`) ;
- champs dérivés 1.4/1.5 → 1.2, calculés à la fois sur l'appareil
  (`src/lib/derivationLocale.ts`) et sur le serveur
  (`src/server/derivation/champsDerives.ts`).

Ce qui **n'existe pas** :

- aucune **moyenne**, aucun **taux**, aucun **pourcentage d'évolution** ;
- aucune agrégation **multi-mois**. Le commentaire d'en-tête le dit
  explicitement (`rapport-docx.ts:5-9`) : *« La distinction STOCK/SOMME ne joue
  que sur les périodes multi-mois (trimestre/semestre/année, phase 3) »* ;
- aucune comparaison **N-1** (même mois de l'année précédente) ;
- aucune comparaison **entre arrondissements** autre que leur juxtaposition.

`src/lib/aggregationRules.ts` lit bien une règle `STOCK | SOMME | MOYENNE` par
champ depuis le dictionnaire — mais **aucun appelant ne l'utilise aujourd'hui**
pour agréger quoi que ce soit.

`MappingRapport` (`schema.prisma:551`) et `TypeAggregation` (`:544`) sont
déclarés et **référencés nulle part** dans `src/`. Intention de conception
restée lettre morte.

## 1.13 Mécanismes de contrôle des données existants

- contrôle de **complétude** (`verifierCompletudeDD`) ;
- contrôle d'**état** (période gelée, rapport soumis, période verrouillée) —
  `src/server/periodes/gel.ts` ;
- **motif obligatoire** sur `nonRenseigne`, sur toute `Correction`, sur toute
  réouverture de période ;
- **taux de remplissage par arrondissement**
  (`src/server/supervision/tauxRemplissage.ts`).

Il n'existe **aucun moteur de contrôle croisé** (cohérence entre tableaux,
plausibilité d'une valeur, détection de rupture). C'est E2/E4 du plan
trimestriel, pas encore écrit.

## 1.14 Hébergement Railway

- **Un seul service applicatif** + une base PostgreSQL. Pas de `Dockerfile`,
  pas de `railway.json`, pas de `nixpacks.toml` : la construction est
  automatique.
- Démarrage : `prisma migrate deploy && node scripts/migrations-demo.mjs &&
  next start` (`package.json:9`). **Pousser sur `main` déploie et migre.**
- Le planificateur de relances tourne **dans le processus web**
  (`src/instrumentation.ts`). Correct avec une instance ; produirait des
  doublons de relances avec deux.
- Variables d'environnement en usage : `DATABASE_URL`, `DEMO_DATABASE_URL`,
  `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`.

## 1.15 Dépendances

20 dépendances d'exécution. Les structurantes : `next`, `react`,
`@prisma/client`, `next-auth`, `dexie`, `docxtemplater` + `pizzip`, `docx`,
`exceljs` + `xlsx`, `pdfkit`, `web-push`, `node-cron`, `bcryptjs`.

Trois d'entre elles (`pdfkit`, `web-push`, `node-cron`) ont dû être déclarées
**externes à l'empaquetage** dans `next.config.mjs:17` et `:28` parce qu'elles
tirent des modules Node que Webpack refuse. **Toute bibliothèque d'inférence ou
de client IA rencontrera très probablement le même obstacle.**

---

# 2. Dette technique et fragilités — ce qu'il serait dangereux d'augmenter

## 2.1 Défaut actif et bloquant : la chaîne d'analyse du SID est morte

**Vérifié en exerçant réellement le système**, session DD forgée contre le
serveur de développement :

```
témoin  GET  /api/dd/periodes        -> 200
cible   POST /api/syntheses/valider  -> 403 {"message":"Rôle non autorisé pour cette route."}
```

Cause : `middleware.ts:39` déclare `{ prefix: "/api/syntheses", roles:
CHEF_ROLES }` et **aucune règle plus spécifique** ne précède pour
`/api/syntheses/valider`. `Array.find` prend la première correspondance : le DD
est barré avant d'atteindre le handler — lequel commence pourtant par
`assertRole(user, ["DD"])`.

Conséquences en chaîne, toutes vérifiées :

1. `src/components/SyntheseValidationRow.tsx:23` appelle cette route ; le
   composant est rendu sur `src/app/dd/supervision/page.tsx:225`. **Le bouton
   existe à l'écran du DD et échoue systématiquement.**
2. C'est le **seul** chemin d'écriture vers `valideDD = true` dans tout le code
   (vérifié : seules trois écritures de `valideDD` existent, deux à `false`).
3. `rapport-docx.ts:445` conditionne le texte d'analyse à `s.valideDD` :

   ```ts
   payload[`ANALYSE_${code}`] = s?.contenuFinal && s.valideDD ? s.contenuFinal : "Synthèse non disponible.";
   ```

   **Donc les quatre rubriques d'analyse `ANALYSE_BAC`, `ANALYSE_PSA`,
   `ANALYSE_SSV`, `ANALYSE_SPAIH` de tout rapport mensuel produit à ce jour
   portent la mention « Synthèse non disponible. »** — quel que soit le travail
   fourni par les chefs de section.
4. Base locale, à l'instant de l'audit : `syntheseSection` → **0 ligne, 0
   validée**. NON VÉRIFIÉ en production (base inaccessible depuis un poste de
   développement), mais le code étant identique, le résultat ne peut pas
   différer.

**C'est le constat central de cette étude.** La question posée est : faut-il
ajouter un modèle de langage pour produire le texte d'analyse ? Or le circuit
qui reçoit ce texte, le fait valider et l'insère dans le document **ne
fonctionne pas**. Brancher une intelligence artificielle sur un tuyau bouché ne
produit rien de plus qu'aujourd'hui, mais coûte beaucoup plus cher.

## 2.2 Génération du rapport : 2 744 requêtes séquentielles

`genererPayloadDD` boucle sur 392 champs numériques × 6 arrondissements, plus
un appel par champ pour le mois précédent : **≈ 2 744 allers-retours vers la
base pour un seul rapport** (compté sur le schéma réel).

Mesuré : **4,5 s** sur base locale quasi vide, pour 3 323 valeurs produites.
Sur une base réellement remplie et à travers le réseau interne Railway, ce sera
plus. Et un rapport **trimestriel** qui compare M1/M2/M3 et N-1 multiplierait
ce nombre par 4 à 8 si on gardait la même approche.

Ce n'est pas urgent aujourd'hui. Ce le devient au moment précis où l'on
construit le trimestriel. À corriger **avant** le trimestriel, pas après.

## 2.3 Les autres fragilités

| # | Fragilité | Pourquoi l'IA l'aggraverait |
|---|---|---|
| 1 | Aucun filtrage territorial centralisé (§ 1.6) | Une couche IA devrait réimplémenter le cloisonnement une 64ᵉ fois, avec une chance sur deux de se tromper |
| 2 | Mode démonstration : toute route absente de `CHEMINS_SURS_DEMO` (`middleware.ts:55`) laisse une session démo atteindre **la production** | Une route IA oubliée dans cette liste = fuite de données réelles pendant une démonstration publique |
| 3 | `CACHE_NAME` dupliqué (`sw.js:21` / `offlineStore.ts:190`), à synchroniser à la main | Chaque livraison supplémentaire est une occasion d'oubli |
| 4 | Aucun test hors le golden master mensuel ; **zéro test sur les permissions** | Un texte produit par un modèle **ne peut pas** avoir de golden master (§ 13.5) |
| 5 | Le golden master ne couvre **qu'un seul mois** (07/2026, seule période en base) | Filet de sécurité plus étroit qu'il n'y paraît |
| 6 | L'état `NA` (non applicable) n'existe pas en base | Un moteur d'analyse confondra « zéro », « non renseigné » et « sans objet » |
| 7 | `MappingRapport` / `TypeAggregation` déclarés et inutilisés | Fausse piste pour quiconque reprend le code |
| 8 | Correspondance champ → balise **codée en dur** dans `canevasLayout.ts` | Ajouter un tableau reste une opération de développeur |
| 9 | Le planificateur tourne dans le processus web | Une seconde instance produirait des relances en double |
| 10 | `console.error` déjà présent sur des chemins portant des données (`push.ts:82`, `rapport-docx.ts:504`) | Les journaux d'une couche IA en porteraient bien davantage (§ 7.6) |

---

# 3. Verdict

## 3.1 Réponse directe

**Non. Pas maintenant. Et pas pour la raison à laquelle on pense.**

La raison n'est pas que l'idée soit mauvaise. Elle est que, dans l'état actuel
du SID :

1. **Le circuit qui recevrait le texte est cassé** (§ 2.1). Aucune synthèse ne
   peut être validée, aucune n'apparaît dans un rapport. Priorité absolue.
2. **La matière première du LLM n'existe pas.** Le SID ne sait calculer ni un
   taux, ni une moyenne, ni une évolution, ni une agrégation multi-mois
   (§ 1.12). Il n'y a donc **aucune « donnée analytique structurée »** à lui
   donner. La boîte du milieu du schéma du DD est vide.
3. **Ce qui est vide est précisément ce qui a le plus de valeur.** Construire
   cette base de faits apporte 80 % du bénéfice attendu — commenter, comparer,
   signaler — sans un centime, sans un serveur, et **hors connexion**.
4. **L'auto-hébergement ne répond pas à l'objection du supérieur
   hiérarchique.** Un modèle ouvert hallucine exactement comme un modèle
   fermé. La défiance ne se soigne pas par le lieu d'hébergement, elle se
   soigne par la **traçabilité du calcul**. Le moteur de règles la donne
   totalement ; aucun modèle ne la donnera jamais.

## 3.2 Ce que « pas maintenant » ne veut pas dire

Cela ne veut pas dire « jamais ». Il existe **deux ou trois usages réels** où un
modèle de langage apporte quelque chose qu'aucune règle ne remplacera
(§ 5). Ils ne concernent pas les chiffres.

Cela ne veut pas dire non plus « ne rien préparer ». Une décision d'architecture
prise maintenant, et qui ne coûte presque rien, garde la porte ouverte :
**faire de la base de faits un contrat de données stable et persisté**. Que la
dernière étape soit un gabarit de phrase ou un modèle de langage devient alors
une décision remplaçable, prise dans six mois, sur des faits.

## 3.3 Réponse à la question du 11 août sur le LLM open source

> *« que penses-tu de joindre un LLM open source spécialisé, espace dédié,
> sécurité, avantages, en lien avec le niveau de littératie numérique »*

Point par point, honnêtement :

- **« Spécialisé dans l'analyse et la production de texte »** — cela n'existe
  pas au sens où on l'espère. Il n'y a pas de modèle ouvert entraîné sur le
  reporting administratif camerounais de l'élevage. Il y a des modèles
  généralistes qui écrivent bien le français et suivent bien des consignes. La
  spécialisation viendrait de **nous** : du contexte qu'on lui donne et des
  contraintes qu'on lui impose. Or ce contexte, c'est la base de faits — qui
  n'existe pas encore. **La spécialisation se construit avant le modèle, pas
  avec lui.**
- **« Espace dédié »** — techniquement oui : un second service Railway, réseau
  privé, jeton partagé. Mais un service dédié qui héberge un modèle de 7
  milliards de paramètres, c'est ~6 Go de mémoire vive réservés en permanence
  pour produire **quelques centaines de textes par an** (§ 10). Le rapport
  entre le coût et l'usage est mauvais d'un facteur considérable.
- **« Sécurité »** — l'auto-hébergement supprime *un* risque (la donnée ne
  quitte pas l'infrastructure) et en **ajoute plusieurs** : un serveur
  d'inférence est une surface d'attaque nouvelle, souvent livrée sans
  authentification par défaut ; les dépendances à maintenir doublent ; les
  journaux se remplissent de données. Détail en § 7.
- **« Avantages »** — le seul avantage réel et non contestable de
  l'auto-hébergement est la **souveraineté** : aucune donnée du MINEPIA ne
  sort. C'est un argument sérieux, mais il faut voir ce qui sortirait
  réellement : dans les usages recommandés (§ 5), le modèle ne reçoit **que
  des faits déjà agrégés** et **du texte que le DD a lui-même tapé**. Ni noms
  d'éleveurs, ni registre nominatif, ni identifiants. La souveraineté coûte
  ici très cher pour protéger des statistiques d'élevage agrégées.
- **« Littératie numérique »** — c'est l'argument le plus fort, et il va dans
  le sens **inverse** de celui qu'on attend. Un agent qui utilise trois
  applications sur un téléphone d'entrée de gamme **ne tapera pas une question
  en français dans une zone de texte**. La zone de dialogue est l'interface la
  plus hostile qui soit pour cet utilisateur. Ce qui l'aide, ce sont des
  **boutons** — et un bouton peut appeler une règle aussi bien qu'un modèle.
  Le besoin d'accessibilité ne justifie donc pas le modèle ; il justifie
  l'ergonomie (§ 12).
- **« Autres points auxquels je n'ai pas pensé »** — § 13. Le plus important
  n'est ni technique ni financier : c'est le **risque de contamination de
  crédibilité** (§ 13.1).

---

# 4. Position du LLM dans l'architecture

Ni fonctionnalité isolée, ni couche transversale.

**Microservice séparé, optionnel, remplaçable, et jamais sur le chemin
critique.**

Trois exigences non négociables :

1. **Derrière une seule porte.** Une unique interface `PasserelleIA` dans le
   code. Une seule implémentation à la fois. Changer d'API externe ou passer à
   l'auto-hébergement = remplacer un fichier.
2. **Toujours dégradable.** Chaque fonction qui s'appuie sur le modèle doit
   produire un résultat utile **sans lui**. Modèle absent, lent ou en panne →
   le texte du moteur de règles s'affiche, et l'utilisateur n'est pas bloqué.
   Le SID sait déjà faire cela : `pushDisponible()` (`push.ts:41`) désactive
   proprement les notifications système sans que rien ne tombe. **Même
   patron.**
3. **Interrupteur global.** Une clé dans `ConfigSysteme`, sur le modèle éprouvé
   de `MODE_DEMO_GLOBAL` (`permissions.ts:48`). Le DD coupe l'IA en une
   seconde, sans redéploiement, si la hiérarchie l'exige.

L'idée de « couche d'intelligence commune » est séduisante et **je la
déconseille au sens où elle est formulée**. Ce qui doit être commun, ce n'est
pas le modèle : c'est **la base de faits et le registre d'outils autorisés**.
Ceux-là servent aux écrans, aux rapports, aux alertes et aux exports —
c'est-à-dire à 100 % du SID. Le modèle, lui, ne sert qu'à la mise en forme
finale de quelques textes, et ne doit jamais devenir un passage obligé.

---

# 5. Les cinq fonctions IA qui créeraient le plus de valeur

Classées par (valeur ÷ risque), pas par séduction technique.

## 5.1 Mise en forme administrative des rubriques narratives du DD

Le DD tape cinq puces télégraphiques ; le SID rend un paragraphe de registre
administratif. Rubriques concernées : *faits marquants*, *difficultés*,
*recommandations*, *synthèse exécutive*.

- **Pourquoi c'est le meilleur usage :** aucun chiffre officiel n'est en jeu ;
  le contenu vient entièrement de l'humain ; le modèle ne fournit que la forme ;
  le DD relit et signe. Une erreur est visible immédiatement et sans
  conséquence.
- Valeur **élevée** — c'est le travail que le DD fait réellement à la main
  aujourd'hui. Risque **faible**. Hors connexion : sans objet (le DD travaille
  au bureau).

## 5.2 Regroupement des difficultés récurrentes

`Correction.motif` est **obligatoire** (`schema.prisma:503`) et libre. Idem
pour `motifNonRenseigne`, `motifRejet`, les observations libres des tableaux
nominatifs, et les questions de `/api/aide/questions`.

Sur douze mois et six arrondissements, cela fait plusieurs centaines de courts
textes libres que personne ne relira jamais. Les regrouper par thème est
exactement ce qu'un modèle de langage fait mieux qu'une règle — et impossible à
faire avec un `if`.

- Sortie : une note de travail pour le DD, jamais un document officiel.
- Valeur **élevée** (capitalisation institutionnelle réelle, aujourd'hui
  perdue). Risque **très faible**. Ne devient intéressant qu'après ~6 mois de
  données accumulées.

## 5.3 Reformulation des phrases du moteur de règles

Le moteur produit du texte **exact mais répétitif** (`ANALYSE_ET_VALIDATION.md`
§ 8 le reconnaît). Le modèle le reformule — **sans jamais toucher aux
chiffres**, grâce à la substitution par jetons (§ 6.3).

- Valeur **moyenne** : le texte réglé est déjà acceptable. C'est du confort.
- Risque **moyen** : c'est le seul usage où le modèle touche à un document
  officiel. À n'ouvrir qu'après avoir vécu au moins un trimestre complet avec
  le texte réglé, et jamais sans validation humaine.

## 5.4 Note de brief départemental à partir des six rapports d'arrondissement

Le DD reçoit six rapports et doit en tirer une lecture. Le moteur de règles
produit les écarts chiffrés ; le modèle en tire trois paragraphes de brief
interne (réunion, note au supérieur).

- Valeur **moyenne à élevée**. Risque **faible** : document interne, jamais
  transmis en l'état.

## 5.5 Explication en français simple d'un contrôle qui échoue

*« Pourquoi cette valeur est-elle refusée ? »*, *« Que dois-je encore
compléter ? »*

**Attention — c'est un piège.** La bonne réponse est presque toujours
d'**améliorer le message de la règle**, pas d'ajouter un modèle. Un message
d'erreur bien écrit est plus fiable, instantané, gratuit et fonctionne hors
connexion.

Cette fonction ne se justifie que si, **après** avoir réécrit tous les messages
en français simple, on constate que les agents ne comprennent toujours pas. À
mesurer, pas à supposer.

- Valeur **conditionnelle**. Risque **faible**. À reconsidérer dans un an.

---

# 6. Les rapports mensuels et trimestriels — architecture détaillée

## 6.1 Le schéma proposé par le DD, corrigé

Le schéma du DD :

```
Données validées → moteur de calcul SID → moteur de contrôle
   → données analytiques structurées → LLM → commentaire
   → template Word → rapport
```

Il est **juste dans son principe** — la séparation calcul / rédaction est la
bonne décision, et c'est elle qui rend le reste défendable. Cinq corrections :

**(1) Le LLM n'est pas sur la chaîne, il est en dérivation.**

```
                          ┌─► MOTEUR DE TEXTE (règles)  ─┐   ← défaut, hors ligne
FAITS ANALYTIQUES PERSISTÉS                              ├─► TEXTE PROPOSÉ
                          └─► PASSERELLE IA (optionnel) ─┘   ← enrichissement
```

Si la branche IA disparaît, tout continue de fonctionner. L'inverse n'est pas
vrai — et c'est pourquoi la branche règles doit être écrite **en premier**.

**(2) Les faits doivent être *persistés*, pas recalculés à l'affichage.**
Sans cela, impossible de montrer « voir le calcul » six mois plus tard, et
impossible de figer un texte validé contre les faits qui l'ont justifié.
Le schéma du DD n'a pas de boîte de stockage entre le calcul et le texte. Il en
faut une.

**(3) La validation humaine doit être un *état en base*, pas une étape
d'écran.** Le DD l'a écrit dans son schéma cible (§ 22), pas dans celui-ci.
C'est la version § 22 qui a raison. Rien ne va au gabarit Word sans être passé
par `VALIDE_EMETTEUR` ou `VALIDE_DD`.

**(4) Le moteur de contrôle est *en amont et en parallèle*, pas en série.**
Un contrôle qui échoue ne doit pas interrompre la production des faits : il
**devient un fait** (le détecteur `COHERENCE` de
`ANALYSE_ET_VALIDATION.md` § 2.1). Ainsi une incohérence apparaît dans
l'analyse au lieu de bloquer le rapport.

**(5) Il manque la substitution par jetons** — § 6.3, le point le plus
important de toute cette étude.

## 6.2 Le schéma corrigé

```
     SAISIES VALIDÉES  (SOUMIS / CLOTURE, sections VALIDE)
              │
              ├──────────────────────┐
              ▼                      ▼
     MOTEUR D'AGRÉGATION      MOTEUR DE CONTRÔLE
     somme · moyenne          complétude · cohérence
     dernière valeur          contrôles croisés
     comptage · pondérée              │
              │                       │
              └──────────┬────────────┘
                         ▼
              ╔═══════════════════════╗
              ║  FAITS PERSISTÉS      ║   ← LE LIVRABLE CENTRAL
              ║  table FaitAnalytique ║      valeurs · formule · sources
              ╚═══════════════════════╝      reproductible, traçable
                         │
              ┌──────────┴───────────┐
              ▼                      ▼
     MOTEUR DE TEXTE          PASSERELLE IA (option)
     gabarits de phrases      reformulation à jetons
     hors ligne, gratuit      en ligne, coupable
              │                      │
              └──────────┬───────────┘
                         ▼
                 TEXTE PROPOSÉ  (avec ses factIds)
                         │
                         ▼
              VALIDATION PAR L'ÉMETTEUR   ← état en base, signé, daté
                         │
              ┌──────────┴───────────┐
              ▼                      ▼
          ÉCRAN                 GABARIT WORD
     (+ « voir le calcul »)     (docxtemplater)
```

## 6.3 Le garde-fou décisif : le modèle ne voit jamais un chiffre qu'il puisse réécrire

Le principe posé par le DD au § 2 de sa demande — *« le LLM ne doit pas devenir
la calculatrice officielle »* — est **nécessaire mais insuffisant**. Il repose
sur une consigne, et une consigne se contourne par accident.

Le rendre **structurellement impossible** :

1. Le modèle reçoit les faits avec des **jetons** à la place des nombres :

   > `Fait F12 : production d'œufs, {{F12.valeur}} unités, évolution
   > {{F12.evolution}} sur un an. Fait F13 : {{F13.arrondissement}} représente
   > {{F13.part}} du total.`

2. Le modèle renvoie du texte **contenant les jetons** :

   > *« La production d'œufs de table s'établit à {{F12.valeur}} unités, en
   > progression de {{F12.evolution}} sur un an, {{F13.arrondissement}}
   > assurant {{F13.part}} du volume départemental. »*

3. **Le SID substitue les valeurs** depuis la base de faits.

4. **Contrôle de sortie déterministe** : si la réponse du modèle contient un
   chiffre qui n'est pas issu d'une substitution, elle est **rejetée** et le
   texte du moteur de règles est utilisé à la place. Une simple expression
   régulière suffit.

Conséquence : **il devient mécaniquement impossible qu'un faux chiffre entre
dans un rapport officiel.** Ce n'est plus une promesse, c'est une propriété.
C'est l'argument à présenter au supérieur hiérarchique — et il tient sans avoir
à lui demander de faire confiance à quoi que ce soit.

## 6.4 Les autres garde-fous, au-delà du principe du DD

Le principe posé laisse passer quatre choses :

| Faille | Exemple | Parade |
|---|---|---|
| **Faux qualitatif sans chiffre** | « la situation sanitaire s'est dégradée » — affirmation officielle, aucun chiffre | Lexique fermé en phase 1 : le modèle ne dispose que d'un vocabulaire d'appréciation autorisé |
| **Omission** | une synthèse qui passe sous silence le seul tableau alarmant | **Contrôle de couverture** : tout fait d'importance ≥ seuil doit apparaître dans le texte, sinon le SID l'ajoute lui-même |
| **Mauvaise attribution** | bon chiffre, mauvais arrondissement ou mauvais mois | Réglé par la substitution à jetons (§ 6.3) : le libellé aussi est un jeton |
| **Cadrage par l'ordre** | l'ordre des phrases oriente la lecture | L'ordre est imposé par le SID, pas par le modèle |

**L'omission est le risque le plus sous-estimé.** Un texte qui ne contient
aucune erreur mais qui tait l'essentiel est administrativement plus dangereux
qu'un texte visiblement faux — parce qu'il est indétectable.

## 6.5 Éviter un prompt codé en dur par tableau

Le DD a raison d'y penser d'avance, et sa structure proposée est la bonne :

```
Définition d'indicateur
  ├─ Règle d'agrégation     (SOMME | DERNIERE_VALEUR | MOYENNE | MOYENNE_PONDEREE | COMPTAGE_DISTINCT)
  ├─ Règle d'analyse        (quels détecteurs s'appliquent, quels seuils)
  ├─ Gabarit de phrase      (le modèle de phrase du moteur de règles)
  └─ Schéma de sortie       (la forme JSON attendue)
```

Deux précisions issues du code :

- **La source doit être `referentiel_tableaux_v1.json`** (72 tableaux, déjà
  typés `STOCK` / `FLUX` / `SNAPSHOT` / `COMPUTED` / `EVENT` / `BUDGET` /
  `REFERENCE`, avec `aggregation`, `regle_metier`, `comparaison_n1`,
  `controle_croise`). Il porte déjà l'essentiel de ce que le DD décrit.
- **Ne pas ressusciter `MappingRapport`** (§ 1.12) sans décision explicite : ce
  modèle porte une conception différente, jamais éprouvée.

Il n'y a alors **pas un prompt par tableau, mais un prompt par *type* de
tableau** — sept types au maximum, et probablement trois en pratique (stock,
flux, événement). Ajouter un tableau = ajouter une ligne au référentiel.

## 6.6 `docxtpl` ou l'existant ?

**Conserver l'existant. Ne pas introduire `docxtpl`.**

- `docxtpl` est une bibliothèque **Python**. Le SID est entièrement en
  TypeScript, sur un service Node unique. L'adopter obligerait à faire
  cohabiter deux exécutions dans le même conteneur ou à créer un second
  service — pour un gain nul.
- `docxtemplater` (déjà en place, `rapport-docx.ts:28`) fait **exactement la
  même chose** : balises `{{ }}`, boucles, préservation de la mise en page
  officielle.
- Surtout, le SID a un atout que `docxtpl` ne remplacerait pas : les gabarits
  ne sont **pas dessinés à la main**, ils sont **générés** par
  `buildReportTemplates.ts` depuis `canevasLayout.ts`. Cette propriété est
  précieuse et coûteuse à reconstruire.
- Les balises souhaitées par le DD (`{{ analyse_sante_animale }}`,
  `{{ faits_marquants }}`…) **existent déjà sous une autre graphie** :
  `ANALYSE_BAC`, `ANALYSE_PSA`, `ANALYSE_SSV`, `ANALYSE_SPAIH`
  (`rapport-docx.ts:443`). Il faut les **débloquer** (§ 2.1) et les
  **étendre**, pas changer de moteur.

## 6.7 Le trimestriel

Le moteur d'agrégation doit savoir faire, par indicateur :

| Opération | Type de tableau concerné | Existe aujourd'hui |
|---|---|---|
| Somme des trois mois | FLUX | non |
| Dernière valeur du trimestre | STOCK, SNAPSHOT | non |
| Recalcul depuis les composants | COMPUTED | non |
| Moyenne simple | quelques indicateurs | non |
| Moyenne pondérée | prix, rendements | non |
| Comptage d'événements distincts | EVENT | non |
| Comparaison M1 / M2 / M3 | tous | non |
| Comparaison N-1 | 53 des 72 tableaux | non |

**Aucune de ces huit opérations n'existe.** C'est l'étape E4 du plan
trimestriel, et c'est le vrai chantier — infiniment plus déterminant pour la
qualité du rapport que le choix d'un modèle de langage.

Une fois qu'elles existent, ce que le DD attend du modèle — *ce qui augmente,
ce qui baisse, quel mois explique l'évolution, quel arrondissement explique
l'écart* — **est produit par les détecteurs, pas par le modèle**. Ce sont des
opérations arithmétiques :

- « quel mois explique l'évolution » = contribution de chaque mois à l'écart
  total, tri décroissant, on nomme le premier ;
- « quel arrondissement explique l'écart » = même calcul sur l'axe territorial.

Le modèle ne saurait pas mieux, et surtout il ne saurait pas **de façon
reproductible**. Ces deux calculs sont à ajouter au § 2.1 de
`ANALYSE_ET_VALIDATION.md` : détecteurs `CONTRIBUTION_TEMPORELLE` et
`CONTRIBUTION_TERRITORIALE`.

---

# 7. Sécurité

## 7.1 Le risque n° 1 : la question-réponse libre sur les données

L'architecture proposée par le DD est la bonne :

```
Utilisateur → authentification → rôle + territoire + permissions
  → interprétation de la demande → fonctions SID autorisées
  → requête déterministe → données filtrées → LLM → réponse
```

Deux corrections **impératives** :

1. **Le modèle ne choisit jamais une requête, il choisit une intention dans une
   liste fermée.** Il ne produit pas de SQL, pas de Prisma, pas de filtre. Il
   renvoie `{ intention: "TOTAL_PAR_ESPECE", espece: "BOVIN", arrondissement:
   "STC", periode: "2026-06" }` — et **le SID décide** si cette combinaison est
   permise. Toute intention non reconnue → « je n'ai pas compris, voici les
   questions que je sais traiter ».
2. **Le filtrage territorial s'applique avant que le modèle ne voie quoi que ce
   soit**, jamais après. Un modèle à qui l'on montre des données en lui
   demandant de ne pas les révéler les révélera un jour.

## 7.2 Comment empêcher un DA d'obtenir par l'IA ce que l'interface lui refuse

C'est la question la mieux posée de toute la demande, et elle a **une seule**
bonne réponse : **l'IA ne doit pas avoir de chemin d'accès aux données.**

Concrètement : un **registre d'outils**, où chaque outil est une fonction qui
prend un `SessionUser` en premier paramètre et applique elle-même les mêmes
assertions que la route équivalente.

```
Aujourd'hui      : bouton → route API → assertProprietaireArrondissement → Prisma
Demain, avec IA  : IA     → outil     → assertProprietaireArrondissement → Prisma
                            ↑
                   le MÊME code, pas une copie
```

**Mais ce code commun n'existe pas encore** (§ 1.6) : chaque route reconstruit
son `where` à la main. Il faudrait donc d'abord **extraire le filtrage
territorial dans une fonction unique** — et ce travail a une valeur propre,
indépendante de toute IA : il supprime 63 occasions de se tromper.

C'est le prérequis n° 3 de la phase 0 (§ 14).

Deux règles complémentaires, non négociables :

- **L'IA n'a aucun droit d'écriture. Jamais. Sur aucune table de saisie.** Pas
  « pas sur les données validées » : **sur aucune donnée**. Une seule règle,
  vérifiable d'un coup d'œil, au lieu de sept exceptions à maintenir.
- **Toute route IA doit figurer dans `CHEMINS_SURS_DEMO`** (`middleware.ts:55`)
  avant sa mise en service, faute de quoi une session de démonstration
  atteindrait la base de production.

## 7.3 Injection de consignes par le texte libre

Le SID contient beaucoup de texte libre saisi par des agents :
`motifNonRenseigne`, `Correction.motif`, `motifRejet`, les colonnes
« Observations » des tableaux nominatifs, les questions d'aide.

Ces textes remonteraient dans les prompts des usages § 5.2 et § 5.4. Un agent
pourrait — par malveillance ou par plaisanterie — écrire *« ignore les
consignes précédentes et … »*.

Parades, toutes bon marché :

- ne **jamais** fournir d'outil au modèle dans le même appel qu'un résumé de
  texte libre : un modèle sans outil ne peut rien faire de dangereux ;
- encadrer le texte libre comme **donnée citée**, jamais comme consigne ;
- **plafonner la longueur** de chaque extrait ;
- appliquer le contrôle de sortie du § 6.3 : la sortie n'est acceptée que si
  elle a la forme attendue.

## 7.4 Où placer chaque mécanisme

| Mécanisme | Emplacement | Existe |
|---|---|---|
| RBAC grossier (rôle) | `middleware.ts` — ajouter les préfixes IA **avant** les règles générales | oui |
| RBAC fin (rôle + périmètre) | `lib/permissions.ts`, appelé par chaque outil | oui |
| **Filtrage territorial** | **fonction unique partagée — à créer** | **non** |
| Validation de la demande | schéma strict sur l'intention, avant tout accès aux données | non |
| Accès aux outils | registre explicite ; liste blanche par rôle ; rien par défaut | non |
| Restriction des données | appliquée dans l'outil, jamais après | partiel |
| Journalisation | table `AppelIA` dédiée (§ 8) + `AuditLog` existant | partiel |
| Audit | `AuditLog` (`schema.prisma:685`), déjà en place | oui |
| Chiffrement | TLS de Railway ; réseau privé pour un service IA interne ; **jamais d'API d'inférence exposée publiquement** | partiel |
| Authentification du service IA | jeton partagé en variable d'environnement + réseau privé Railway | non |

## 7.5 Risques propres à un serveur d'inférence auto-hébergé

- **Exposition publique par défaut.** Les serveurs d'inférence courants
  écoutent sans authentification. Sur Railway, un service auquel on attache un
  domaine devient joignable depuis Internet. Un serveur d'inférence ouvert est
  utilisé par des tiers en quelques heures — et facturé à la Délégation.
- **Modèle compromis.** Un fichier de poids téléchargé depuis un dépôt public
  est un binaire opaque de plusieurs gigaoctets. Vérifier l'empreinte, ne
  télécharger que depuis la source officielle du modèle, figer la version.
- **Surface de dépendances.** Le SID a 20 dépendances d'exécution. Un serveur
  d'inférence + un client + une file d'attente en ajouteraient plusieurs
  dizaines, à surveiller.

## 7.6 Journaux

`console.error` porte déjà des données sur deux chemins (`push.ts:82`,
`rapport-docx.ts:504`). Un appel IA journalisé intégralement mettrait dans les
journaux Railway l'ensemble des chiffres envoyés au modèle.

Règle : **on journalise les *identifiants* des faits, jamais leur contenu.** Les
faits sont en base, reproductibles, et déjà tracés. Le § 8 en tire la
conception de la table d'audit.

---

# 8. Audit et traçabilité de l'IA

Proportionné, sans infrastructure disproportionnée : **une table**.

| Colonne | Pourquoi |
|---|---|
| `userId`, `createdAt` | qui, quand |
| `fonction` | quelle fonction IA (§ 5) |
| `modele`, `versionModele` | un changement de modèle change les sorties |
| `versionPrompt` | idem |
| `faitIds[]` | **les références, pas les données** — reproductible, non redondant |
| `empreinteEntree` | SHA-256 des faits, prouve que l'entrée n'a pas changé |
| `sortieBrute` | ce que le modèle a répondu, **conservé 30 jours** |
| `texteValide` | ce que l'humain a finalement validé |
| `modifieParHumain` | booléen — **la mesure la plus utile de toutes** |
| `exportDocumentId` | le document final, s'il y en a un |

Deux durées de conservation distinctes : **30 jours** pour la sortie brute (elle
contient de la donnée), **permanent** pour le reste (quelques centaines
d'octets par appel, quelques centaines d'appels par an).

`modifieParHumain` mérite d'être souligné : c'est **l'indicateur qui dira si
l'IA sert à quelque chose**. Si 90 % des textes sont réécrits par le DD, la
fonction ne fait pas gagner de temps et doit être retirée. Sans cette colonne,
personne ne le saura jamais.

---

# 9. Explicabilité

L'exigence du DD — cliquer sur « les abattages bovins ont diminué de 27 % » et
voir le calcul — **est réalisable, et elle l'est indépendamment de toute IA.**
Le chaînage existe déjà presque entièrement :

```
phrase
  └─ factIds[]                        ← à créer (§ 6.2)
       └─ FaitAnalytique              ← à créer : formule, périodes, valeurs
            └─ champs + périodes
                 └─ SaisieMatrice.id
                      ├─ rapportId → RapportArrondissement → arrondissement, statut
                      ├─ saisiParId → User                  ← qui a saisi
                      ├─ Correction[]                       ← qui a corrigé, pourquoi
                      └─ modifieLe, syncedAt                ← quand
```

Tout ce qui est sous `SaisieMatrice.id` **existe déjà en base**. Il ne manque
que les deux niveaux du haut — c'est-à-dire E4.

Ce qui est important : **cette traçabilité fonctionne à l'identique que le texte
vienne d'un gabarit ou d'un modèle**, du moment que la substitution à jetons du
§ 6.3 est respectée. C'est ce qui rend l'IA défendable devant la DREPIA — et ce
qui la rend accessoire, puisque le mérite en revient au moteur de faits.

---

# 10. Infrastructure — auto-hébergé, API externe, ou hybride

## 10.1 Le volume réel, d'abord

| Usage | Fréquence | Appels au modèle par an |
|---|---|---|
| Analyses de tableaux trimestriels | 72 tableaux × 4 trimestres | ~290 |
| Rubriques narratives | ~8 × 4 trimestres + 12 mensuels | ~50 |
| Notes de brief, difficultés récurrentes | quelques-unes par mois | ~40 |
| **Total** | | **de l'ordre de 400 appels par an** |

Soit **environ un appel par jour ouvré.** Ce chiffre doit gouverner toute
décision d'infrastructure.

## 10.2 Comparaison

| Critère | A. Auto-hébergé (Railway) | B. API externe | C. Hybride |
|---|---|---|---|
| Confidentialité | aucune donnée ne sort | données agrégées sortent | selon la fonction |
| Souveraineté | totale | nulle | partielle |
| Coût à 400 appels/an | **très défavorable** : plusieurs dizaines de $/mois pour un service inactif 99,9 % du temps | **quelques dollars par an** | proche de B |
| RAM | ~6 Go (modèle 7-8 B quantifié Q4) + ~2 Go | négligeable | négligeable |
| CPU / GPU | 4-8 vCPU en CPU seul ; Railway n'offre pas de GPU sur les offres standard (**NON VÉRIFIÉ**, à confirmer avant toute décision) | aucun | aucun |
| Latence | 1 à 3 min pour un texte de 400 mots en CPU seul | quelques secondes | quelques secondes |
| Démarrage à froid | 60 à 150 s (chargement de 4-5 Go depuis le disque) | nul | nul |
| Maintenance | **à notre charge** : mises à jour, sécurité, surveillance | nulle | faible |
| Disponibilité | dépend de nous | dépend du fournisseur | dégradation vers les règles |
| Dépendance fournisseur | nulle | réelle, **atténuée par la passerelle unique (§ 4)** | faible |

## 10.3 Sur le service dormant et le « scale-to-zero »

L'intuition du DD est juste : payer un modèle chargé en permanence pour
quelques textes par jour est absurde. Mais l'examen des solutions est
défavorable :

- **Scale-to-zero** : chaque premier appel de la journée paie le démarrage à
  froid. Acceptable pour un rapport trimestriel (on attend deux minutes une
  fois par trimestre) ; **inacceptable** pour un bouton « expliquer » sur
  lequel un agent clique en réunion.
- **Chargement à la demande** : même problème.
- **Quantification** (Q4/Q5) : indispensable, divise la mémoire par ~4 au prix
  d'une légère perte de qualité. À faire si l'on héberge.
- **Cache** : très efficace ici. Le même trimestre régénéré deux fois doit
  réutiliser les textes. Cache par empreinte des faits — quelques lignes de
  code, et cela vaut aussi pour l'API externe.
- **Modèles plus petits** (3-4 B) : rendent l'hébergement plus supportable,
  mais le français administratif est précisément ce que les petits modèles
  rendent le moins bien.

**Conclusion de ce paragraphe :** aucune de ces techniques ne renverse le
rapport de coût. À 400 appels par an, l'auto-hébergement coûte **deux ordres de
grandeur** de plus que l'API externe, pour un résultat au mieux équivalent.

## 10.4 Recommandation d'infrastructure

**Hybride, au sens précis suivant :**

1. **Le moteur de règles, toujours.** Gratuit, hors ligne, traçable, il couvre
   l'essentiel du besoin.
2. **Si une fonction IA est ouverte** : passerelle unique, une implémentation,
   **API externe** — parce que les données transmises seraient des statistiques
   agrégées d'élevage et du texte tapé par le DD lui-même, et que le rapport
   coût/bénéfice de l'auto-hébergement est écrasant.
3. **Si la hiérarchie interdit toute sortie de données** — décision
   institutionnelle, pas technique — alors on remplace l'implémentation
   derrière la passerelle par un point d'accès auto-hébergé, **sans toucher au
   reste du code**. C'est précisément ce que la passerelle sert à garantir.

**Interdit dans tous les cas :** faire tourner l'inférence dans le **même
service** que l'application. Le processus qui sert les six arrondissements ne
doit jamais entrer en concurrence de mémoire avec un modèle.

---

# 11. Choix du modèle

## 11.1 Les besoins, déduits des fonctions

| Besoin | Niveau requis | Commentaire |
|---|---|---|
| Français administratif | **élevé** | c'est le cœur du travail |
| Respect des consignes | **très élevé** | il doit conserver les jetons intacts (§ 6.3) |
| Sortie JSON fiable | **élevé** | à obtenir par **décodage contraint**, pas par la taille du modèle |
| Compréhension de tableaux | **faible** | **le modèle ne voit jamais un tableau** : il reçoit des faits déjà calculés |
| Contexte | **4 à 8 k jetons suffisent** | pas besoin de 128 k |
| Raisonnement | **faible** | tout le raisonnement est fait par les détecteurs |
| Licence | compatible usage administratif public | à vérifier au cas par cas |

**Le point le plus utile de ce tableau** : la base de faits **réduit
drastiquement l'exigence sur le modèle**. Un modèle qui n'a ni à lire un
tableau, ni à calculer, ni à raisonner, mais seulement à bien écrire trois
phrases en français à partir de faits fournis, est une tâche que des modèles
modestes traitent correctement.

## 11.2 Classes de taille

| Classe | Verdict pour le SID |
|---|---|
| 3-4 B | À **tester en premier**, contre toute intuition : la tâche est très contrainte. Risque : registre administratif approximatif. |
| **7-8 B** | **Point d'équilibre attendu.** Quantifié Q4/Q5 : ~5-6 Go. Bon français, bon suivi de consignes. |
| 12-14 B | Seulement si 7-8 B échoue sur le registre. Coût d'hébergement ~2×. |
| > 14 B | **Hors sujet.** Aucune fonction du § 5 ne le justifie. |

## 11.3 Comment choisir — et pourquoi pas maintenant

**Ne pas choisir de modèle aujourd'hui.** Non par précaution rhétorique : parce
que l'entrée du modèle — la base de faits — n'existe pas, et qu'on ne peut donc
pas l'évaluer sur la tâche réelle.

La méthode, le jour venu :

1. constituer **20 cas réels** issus de la base de faits, avec le texte que le
   moteur de règles produit et celui que le DD aurait écrit ;
2. faire tourner **trois candidats** de classes différentes sur ces 20 cas ;
3. évaluer sur **quatre critères mesurables** : jetons préservés à l'identique,
   aucun chiffre inventé, registre acceptable pour le DD, temps de réponse ;
4. **le DD choisit**, à l'aveugle si possible.

Familles à examiner ce jour-là — sous réserve de revérification, ce domaine
évoluant vite : Mistral / Ministral (français natif, certaines versions Apache
2.0), Qwen (Apache 2.0, très bon suivi de consignes et JSON), Gemma (bon
français, **licence à lire attentivement** : ce n'est pas une licence libre
classique), Llama (licence communautaire, restrictions d'usage). **Vérifier la
licence avant la qualité** : une administration publique ne peut pas s'appuyer
sur un modèle dont la licence interdit son usage.

## 11.4 Réglage fin (fine-tuning)

**Le DD a raison : c'est prématuré. Je suis d'accord, pour quatre raisons.**

1. **Il n'y a pas de corpus.** Un réglage fin utile demanderait des centaines de
   textes validés. Le SID en a produit **zéro** (§ 2.1). Il faudrait douze à
   vingt-quatre mois de fonctionnement d'abord.
2. **La tâche est déjà contrainte** par la base de faits et la substitution à
   jetons. Ce qui reste au modèle est étroit — le domaine où le prompting
   suffit.
3. **Le réglage fin crée une dette permanente** : à chaque évolution du canevas,
   il faut réentraîner. Le SID ne peut pas porter cette charge.
4. **Il ne répond pas à l'objection du supérieur.** Un modèle réglé finement
   hallucine toujours ; il hallucine seulement avec un meilleur style.

Ordre correct des moyens, du moins cher au plus cher : **prompting →
few-shot → sorties structurées contraintes → (rien) → RAG → LoRA → réglage
fin complet.** Les trois premiers suffisent aux fonctions du § 5.

---

# 12. UX — rendre l'IA invisible

## 12.1 Le principe directeur

> **Aucun utilisateur du SID ne doit jamais savoir qu'il y a une IA, ni avoir à
> écrire quoi que ce soit pour en bénéficier.**

Corollaire tranchant : **pas de nom, pas d'icône de robot, pas de mention
« IA ».** Deux raisons, dont une politique : le supérieur hiérarchique se
méfie ; une application qui affiche « propulsé par l'IA » se disqualifie
d'elle-même. Et une raison d'honnêteté : quand le texte vient du moteur de
règles, l'appeler « IA » serait faux.

## 12.2 Avis point par point sur la liste du DD

| Élément | Avis | Motif |
|---|---|---|
| **Boutons contextuels** | **oui — le seul patron viable** | un bouton n'exige ni vocabulaire ni frappe |
| **Questions suggérées** | oui, **sous forme de boutons**, jamais d'invite à taper | 3 à 5 maximum, dépendant de l'écran |
| **Interface conversationnelle** | **non, pas en phase 1** | taper une question en français sur un clavier de téléphone est exactement la barrière à supprimer |
| Langage simple | **oui — et à appliquer d'abord au moteur de règles**, gratuitement | |
| Réponses courtes par défaut | oui : **3 phrases maximum**, puis « Voir plus » | |
| « Voir plus » | oui, et surtout **« Voir le calcul »** (§ 9) | c'est ce qui crée la confiance |
| Explications pédagogiques | oui, mais **statiques** : une colonne `description` sur `FormField` | plus fiable, hors ligne, gratuit |
| Aide dans les formulaires | oui, **statique d'abord** | |
| **Voix (dictée)** | **oui — forte valeur, aucune IA requise** | l'API de reconnaissance vocale du navigateur ; **mais elle exige le réseau** et sa qualité sur le français camerounais doit être testée avant d'être promise |
| **Synthèse vocale** | **oui — fonctionne hors ligne dans le navigateur** | lire à voix haute un message d'erreur ou un résumé |
| Français simple | oui, partout, **dès maintenant** | |
| Tolérance aux fautes | **question qui disparaît** si l'on évite la zone de dialogue | argument supplémentaire contre le chat |
| Smartphone | contrainte dominante : une colonne, boutons atteignables au pouce, **jamais de tableau large** | déjà un point douloureux constaté sur le terrain |

## 12.3 La découverte la plus utile de cette section

**Les deux fonctions d'accessibilité les plus utiles aux agents peu à l'aise
avec l'outil — la dictée et la lecture à voix haute — ne nécessitent aucun
modèle de langage.** Elles sont dans le navigateur, gratuites, et l'une des
deux fonctionne hors connexion.

Si l'objectif est d'aider les agents en difficulté, c'est **par là** qu'il faut
commencer, et cela ne coûte ni serveur, ni abonnement, ni arbitrage
hiérarchique.

## 12.4 Le libellé des boutons

Ceux proposés par le DD sont bons. Précision sur ce qui les alimente
réellement :

| Bouton | Alimenté par | Hors ligne |
|---|---|---|
| Analyser ce tableau | **règles** | **oui** |
| Comparer avec le mois précédent | **règles** | **oui** |
| Que dois-je encore compléter ? | **règles** | **oui** |
| Vérifier mon rapport | **règles** | **oui** |
| Pourquoi cette valeur est-elle refusée ? | **règles** (message réécrit) | **oui** |
| Expliquer cette anomalie | règles, puis IA en option | dégradé |
| Résumer cette section | règles, puis IA en option | dégradé |
| Proposer un commentaire | règles, puis IA en option | dégradé |
| *Poser une question au SID* | IA | **non** |

**Cinq des neuf boutons souhaités par le DD ne demandent aucune IA** et
fonctionnent hors connexion. Trois autres marchent en dégradé. Un seul en
dépend réellement — et c'est celui que je déconseille en phase 1.

---

# 13. Risques, y compris ceux qui n'ont pas été identifiés

## 13.1 Contamination de crédibilité — le risque principal, et il n'est pas technique

Si la DREPIA apprend que les rapports du Menoua sont rédigés par une
intelligence artificielle, ce n'est pas seulement le texte qui sera mis en
doute : **ce sont les chiffres**. Or les chiffres, eux, sont exacts, vérifiés
et traçables. Le SID perdrait sur la partie où il est irréprochable, à cause de
la partie qui est accessoire.

C'est très exactement ce que le supérieur hiérarchique redoute, et il n'a pas
tort. Conséquences pratiques :

- **le texte doit rester signé par un humain**, et l'être réellement ;
- **ne jamais afficher ni écrire que le SID « utilise l'IA »** ;
- **le moteur de règles est un argument, pas un pis-aller** : « nos analyses
  sont calculées, pas rédigées, et chaque phrase porte son calcul » est une
  phrase qu'on peut dire devant la DREPIA. « Nous utilisons un modèle de
  langage » ne l'est pas.

## 13.2 Homogénéisation — perte d'un signal de gestion

Si les six DA disposent du même assistant, leurs commentaires se ressembleront.
Or aujourd'hui, **un rapport mal rédigé est une information** : il dit au DD
quel arrondissement ne maîtrise pas son sujet. Lisser l'écriture supprime un
indicateur de management que rien ne remplace.

## 13.3 Perte de compétence

Un agent qui reçoit un commentaire tout fait cesse de regarder son tableau. Le
travail d'analyse **est** le travail. Parade : le texte proposé doit être
**incomplet à dessein** — les faits chiffrés, jamais l'interprétation ni la
cause. C'est déjà la position de `ANALYSE_ET_VALIDATION.md` § 8, et il faut la
tenir.

## 13.4 Le chantier permanent — la crainte du DD, et elle est fondée

Le SID est développé par une seule ressource. Ouvrir un chantier IA maintenant,
c'est le mettre en concurrence avec E2 à E11 du plan trimestriel. Le trimestriel
est **attendu par la hiérarchie** ; l'IA ne l'est pas.

## 13.5 Une asymétrie de vérification qu'il faut regarder en face

Le SID s'est doté d'un golden master (`tests/golden-mensuel.test.ts`) : si un
chiffre bouge, le test échoue et la modification est refusée. C'est l'invariant
n° 1 du projet.

**Aucun équivalent n'est possible pour un texte produit par un modèle.** Deux
appels au même modèle avec la même entrée peuvent produire deux textes
différents. Une mise à jour du modèle change les sorties sans prévenir.

Conséquence à assumer : **la partie IA du SID serait la seule partie non
couverte par une vérification automatique.** Elle doit donc rester la partie
la plus petite possible, et la plus facile à débrancher. C'est un argument
d'architecture, pas de méfiance.

## 13.6 Les autres

| Risque | Nature | Parade |
|---|---|---|
| Le service IA devient une dépendance dure de la génération de rapport | technique | dégradation obligatoire vers les règles (§ 4) |
| Alertes proactives envahissantes | usage | § 15 |
| Confiance excessive : on valide sans lire | humain | mesurer `modifieParHumain` (§ 8) ; si trop bas, alerter |
| Fuite en démonstration | sécurité | `CHEMINS_SURS_DEMO` (§ 7.2) |
| Doublement des dépendances | maintenance | passerelle unique, un seul client |
| Le modèle change, les textes changent | maintenance | version du modèle figée et journalisée (§ 8) |
| Facture imprévue | financier | plafond d'appels par mois, en dur dans la passerelle |
| L'IA sert à faire ce qu'un `if` fait mieux | conception | § 15.2 |

## 13.7 Fonctions qu'il vaut mieux traiter autrement qu'avec de l'IA

| Besoin exprimé | Bonne solution | Pas la bonne |
|---|---|---|
| Détecter des doublons d'établissements | `pg_trgm` / similarité de chaînes dans PostgreSQL | un modèle de langage |
| Détecter une valeur anormale | seuils du moteur de règles, calibrés par le DD | un modèle |
| Savoir ce qui manque dans mon rapport | requête de complétude — **existe déjà en partie** | un modèle |
| Comprendre pourquoi une valeur est refusée | **réécrire le message d'erreur** | un modèle |
| Aider un agent qui lit mal | **dictée + lecture à voix haute** (§ 12.3) | un modèle |
| Retrouver une procédure | recherche plein texte PostgreSQL en français | une base vectorielle |
| Comprendre un champ du formulaire | colonne `description` sur `FormField` | un modèle |

**Sept besoins sur sept se traitent mieux sans IA.** Cette ligne résume assez
bien l'étude.

---

# 14. Recherche documentaire — un RAG est-il justifié ?

## 14.1 Le corpus réel

Textes réglementaires MINEPIA, procédures, guides, notes de service, manuel du
SID : de l'ordre de **10 à 60 documents**. NON VÉRIFIÉ — ce corpus n'existe
aujourd'hui **nulle part dans l'application**.

## 14.2 Comparaison honnête

| Approche | Coût | Adapté ici |
|---|---|---|
| **Bon index + table des matières** | quasi nul | **oui, et c'est probablement suffisant** |
| **Recherche plein texte PostgreSQL** (`tsvector`, configuration française) | faible ; la base est déjà là | **oui — à faire en premier** |
| Recherche vectorielle (`pgvector`) | exige un **second modèle** (les embeddings) à héberger ou à appeler | seulement si le plein texte échoue de façon démontrée |
| RAG hybride | le plus coûteux | non |

## 14.3 Verdict

**Non, pas de base vectorielle.** Pour 50 documents, la recherche plein texte de
PostgreSQL avec la configuration française trouve ce qu'on cherche.

Et surtout : **la valeur ici n'est pas dans la recherche, elle est dans le fait
d'avoir les documents dans l'application.** Aujourd'hui ils sont dans des
tiroirs et des boîtes de messagerie. Les rassembler, les indexer et les rendre
consultables depuis un téléphone est un gain immédiat et considérable — **sans
une ligne d'IA**.

Règle de décision, à écrire dès maintenant : *on n'ajoutera une recherche
vectorielle que le jour où l'on pourra citer trois questions réelles auxquelles
la recherche plein texte a échoué à répondre.*

---

# 15. IA proactive et alertes

## 15.1 Partage strict des rôles

| Signal | Qui le détecte | Qui l'explique |
|---|---|---|
| Forte variation | **règle** (seuil du DD) | règle ; IA en option |
| Rapport incomplet | **règle** | règle |
| Données manquantes | **règle** | règle |
| Incohérence entre tableaux | **règle** (contrôle croisé) | règle ; IA en option |
| Événement sanitaire inhabituel | **règle** (comptage vs historique) | **IA utile** : mettre en perspective |
| Arrondissement en retard | **règle** — existe déjà (`src/server/cron/`) | règle |
| Indicateur qui se dégrade | **règle** (tendance sur 3 mois) | IA en option |
| Difficultés répétées sur plusieurs mois | **IA légitime** (§ 5.2) | IA |

**Six détections sur huit sont des règles.** Deux seulement appellent une IA, et
uniquement pour l'explication, jamais pour la détection.

## 15.2 Éviter l'envahissement

Le SID a déjà un système de notifications événementiel et une pastille
(`Notification`, `schema.prisma:625`). Trois règles suffisent :

1. **Une alerte doit être actionnable.** Si l'utilisateur ne peut rien faire, ce
   n'est pas une alerte, c'est du bruit.
2. **Un seuil, jamais un jugement.** Le DD règle les seuils (§ 2.4 de
   `ANALYSE_ET_VALIDATION.md`). Une alerte que le DD trouve inutile se
   supprime en changeant un nombre, pas en appelant un développeur.
3. **Un plafond par période et par destinataire.** Au-delà de trois alertes, on
   les regroupe en une seule.

---

# 16. Impact sur le code existant

Format demandé par le DD : EXISTANT / CHANGEMENT / IMPACT / RÉGRESSION /
VALEUR / PRIORITÉ.

## R1 — Débloquer la validation des synthèses

- **EXISTANT** : `middleware.ts:39` barre le DD sur `/api/syntheses/valider` ;
  aucune synthèse ne peut être validée ; les quatre rubriques d'analyse du
  rapport mensuel affichent « Synthèse non disponible. » (§ 2.1).
- **CHANGEMENT** : insérer une règle `{ prefix: "/api/syntheses/valider", roles:
  ["DD"] }` **avant** la règle générale.
- **IMPACT** : `src/middleware.ts` (une ligne). À vérifier ensuite de bout en
  bout : chef rédige → DD valide → texte présent dans le `.docx`.
- **RÉGRESSION** : **faible** — une règle plus spécifique n'élargit rien.
- **VALEUR** : **élevée** — c'est la fonction d'analyse du SID, aujourd'hui
  morte.
- **PRIORITÉ** : **maintenant**, avant toute autre chose.

## R2 — Base de faits analytiques (E4)

- **EXISTANT** : aucune moyenne, aucun taux, aucune évolution, aucune
  agrégation multi-mois (§ 1.12).
- **CHANGEMENT** : moteur d'agrégation piloté par
  `referentiel_tableaux_v1.json` ; table `FaitAnalytique` persistée ; sept
  détecteurs (`ANALYSE_ET_VALIDATION.md` § 2.1) plus les deux ajoutés au § 6.7.
- **IMPACT** : nouveau `src/server/analyse/` ; migration additive ;
  `rapport-docx.ts` en consommateur ; `tests/`.
- **RÉGRESSION** : **moyen** — mais le golden master protège les chiffres
  mensuels existants, à condition de **ne pas toucher** `genererPayloadDD`
  pendant ce travail.
- **VALEUR** : **très élevée** — c'est le prérequis de tout : trimestriel,
  analyses, alertes, explicabilité, et IA éventuelle.
- **PRIORITÉ** : **maintenant** (c'est le plan déjà arrêté).

## R3 — Filtrage territorial centralisé

- **EXISTANT** : reconstruit à la main dans chaque route (§ 1.6).
- **CHANGEMENT** : une fonction `perimetreDe(user)` renvoyant le filtre Prisma
  autorisé ; adoption progressive, route par route.
- **IMPACT** : `src/lib/permissions.ts` + les routes migrées, une par une.
- **RÉGRESSION** : **moyen** si l'on convertit tout d'un coup ; **faible** si
  l'on avance route par route avec vérification.
- **VALEUR** : **élevée, indépendamment de l'IA** — supprime 63 occasions de se
  tromper. Et c'est le **prérequis absolu** de toute fonction IA lisant des
  données.
- **PRIORITÉ** : **plus tard**, mais **avant toute IA**.

## R4 — Réduire les 2 744 requêtes de la génération

- **EXISTANT** : ≈ 2 744 allers-retours séquentiels ; 4,5 s mesurées sur base
  quasi vide (§ 2.2).
- **CHANGEMENT** : un `groupBy` par famille au lieu d'une requête par champ et
  par arrondissement.
- **IMPACT** : `rapport-docx.ts` uniquement.
- **RÉGRESSION** : **élevé en apparence, faible en réalité** — c'est
  exactement ce que le golden master est fait pour surveiller : les chiffres
  doivent être identiques au dernier près.
- **VALEUR** : **moyenne aujourd'hui, élevée dès le trimestriel**.
- **PRIORITÉ** : **avant E4**, tant que le golden master est le seul juge.

## R5 — Passerelle IA

- **EXISTANT** : rien.
- **CHANGEMENT** : une interface, une implémentation, un interrupteur dans
  `ConfigSysteme`, une table `AppelIA`, une entrée dans `CHEMINS_SURS_DEMO`,
  un préfixe de middleware.
- **IMPACT** : nouveau `src/server/ia/` ; `next.config.mjs` (le client sera
  probablement à déclarer externe, comme `web-push`) ; migration additive.
- **RÉGRESSION** : **faible** si et seulement si aucune fonction existante n'en
  dépend.
- **VALEUR** : **nulle tant que R2 n'existe pas** — la passerelle n'aurait rien
  à transmettre.
- **PRIORITÉ** : **plus tard**.

## R6 — État `NA` (non applicable)

- **EXISTANT** : n'existe pas (`AUDIT_EXISTANT.md` § 1.4).
- **CHANGEMENT** : distinguer « sans objet » de « non renseigné ».
- **IMPACT** : schéma, `/api/sync`, Dexie (**version 6**), formulaires,
  détecteur `COMPLETUDE`.
- **RÉGRESSION** : **moyen** — touche la synchronisation, zone sensible.
- **VALEUR** : **moyenne** — sans lui, le détecteur de complétude signalera à
  tort des tableaux sans objet, et l'analyse perdra sa crédibilité dès le
  premier trimestre.
- **PRIORITÉ** : à trancher pendant E4.

## R7 — Dictée et lecture à voix haute

- **EXISTANT** : rien.
- **CHANGEMENT** : bouton micro sur les champs texte libre ; bouton haut-parleur
  sur les messages et résumés. API du navigateur, **aucune IA**.
- **IMPACT** : composants de formulaire uniquement.
- **RÉGRESSION** : **faible**.
- **VALEUR** : **élevée pour les agents en difficulté** — probablement le
  meilleur rapport valeur/effort de toute cette étude.
- **PRIORITÉ** : **plus tard, mais avant toute IA.** À tester sur un vrai
  téléphone d'agent avant de promettre quoi que ce soit.

---

# 17. Gouvernance

## 17.1 L'IA PEUT, seule et sans confirmation

- proposer un texte, **toujours identifié comme proposition** ;
- reformuler un texte fourni par un humain ;
- résumer des données que l'utilisateur a **déjà le droit de voir à l'écran** ;
- regrouper des textes libres par thème pour une note de travail ;
- expliquer une règle, un contrôle, un champ.

## 17.2 L'IA PEUT, mais avec confirmation humaine explicite

- alimenter une rubrique d'un document officiel — **jamais sans validation
  nominative, datée** ;
- déclencher une alerte visible par d'autres que le demandeur ;
- produire un document destiné à sortir de la Délégation.

## 17.3 L'IA NE PEUT JAMAIS

La liste du DD, **conservée intégralement** — et durcie :

| Interdit selon le DD | Ma position |
|---|---|
| modifier une donnée validée | **à durcir** : l'IA n'écrit dans **aucune** table de saisie, validée ou non |
| valider un rapport | confirmé |
| soumettre un rapport | confirmé |
| supprimer une donnée | confirmé |
| modifier des permissions | confirmé |
| inventer un chiffre | confirmé, et **rendu structurellement impossible** par le § 6.3 |
| prendre une décision administrative | confirmé |

**Cinq interdictions à ajouter :**

8. **Ne jamais produire un chiffre autrement que par substitution d'un fait
   stocké.**
9. **Ne jamais recevoir de données hors du périmètre territorial de
   l'utilisateur** — même pour « faire une comparaison ».
10. **Ne jamais écrire au nom du SID ni d'un agent** : tout texte est un
    brouillon attribué à un humain identifié.
11. **Ne jamais être un passage obligé** : toute fonction doit rendre un
    résultat utile si le modèle est absent.
12. **Ne jamais fonctionner sans interrupteur** : le DD doit pouvoir tout
    couper en une seconde, sans redéploiement.

## 17.4 La règle de décision permanente

> **Si un `if` peut le faire, un `if` doit le faire.**

Écrite noir sur blanc, elle épargnera plusieurs mois de travail sur la durée de
vie de l'application.

---

# 18. Hors ligne

## 18.1 Doit fonctionner totalement hors connexion

Tout ce qui fonctionne aujourd'hui, **sans exception**, plus :

- la saisie, les contrôles de saisie, les champs dérivés ;
- **le texte d'analyse produit par le moteur de règles** — c'est de
  l'arithmétique, et `derivationLocale.ts` prouve que le SID sait déjà calculer
  dans le navigateur ;
- « Que dois-je encore compléter ? », « Vérifier mon rapport », « Comparer avec
  le mois précédent », « Analyser ce tableau » ;
- la lecture à voix haute.

## 18.2 Peut attendre la reconnexion

- la reformulation IA d'un texte déjà proposé par les règles ;
- la synthèse trimestrielle ;
- la note de difficultés récurrentes.

Elles doivent apparaître **désactivées avec un motif lisible** — « disponible
quand le réseau reviendra » — jamais absentes, jamais bloquantes.

## 18.3 Exige le serveur

- toute question-réponse libre ;
- toute recherche documentaire ;
- la dictée vocale (la reconnaissance passe par le réseau).

## 18.4 Un LLM sur les téléphones ?

**Non. Mauvaise complexité, sans ambiguïté.**

- 1 à 2 Go à télécharger **par appareil** — sur la connexion que le mode hors
  ligne existe précisément pour contourner ;
- 2 à 4 Go de mémoire vive sur des téléphones d'entrée de gamme ;
- le SID est une PWA dans un navigateur ; l'exécution de modèles dans le
  navigateur (WebGPU) est peu fiable sur Android d'entrée de gamme ;
- et **le besoin n'existe pas** : ce qui doit marcher hors ligne, ce sont les
  calculs, et les calculs sont des règles.

## 18.5 La règle intangible

> **Aucune fonction IA ne doit jamais rendre impossible une opération métier qui
> fonctionne aujourd'hui hors connexion.**

À vérifier à chaque livraison, avec le réseau coupé, sur un vrai téléphone.

---

# 19. Autres documents administratifs — valeur réelle ou gadget

| Usage | Verdict |
|---|---|
| Synthèse des rapports des DA | **valeur réelle** — travail existant, pénible, sans chiffre à inventer |
| Extraction des difficultés récurrentes | **valeur réelle** — impossible à faire à la main sur 12 mois (§ 5.2) |
| Brief du Délégué | **valeur réelle** — document interne, risque nul |
| Notes de synthèse | **valeur moyenne** — dépend de la présence des faits |
| Préparation de réunions | **valeur moyenne** — surtout un ordre du jour tiré des faits, donc des règles |
| Comptes rendus | **gadget** — le modèle n'était pas dans la salle |
| Lettres | **gadget** — un modèle de document Word fait mieux |
| Notes de service | **gadget, et risqué** — acte administratif engageant |
| Réponses administratives | **gadget, et risqué** — engage la Délégation |
| Résumé des activités | **valeur faible** — le journal d'audit et les taux de remplissage le donnent déjà, exactement |

Quatre usages réels, six gadgets, dont deux dangereux. La règle qui les
sépare : **le modèle apporte de la valeur quand la matière existe et que seule
la forme manque ; il est un gadget quand la matière est dans la tête d'un
humain, et un danger quand le document engage l'administration.**

---

# 20. Roadmap

## PHASE 0 — Prérequis (aucune IA)

| # | Action | Valeur | Difficulté | Risque | Dépend de |
|---|---|---|---|---|---|
| 0.1 | **R1** — débloquer `/api/syntheses/valider` | élevée | très faible | faible | — |
| 0.2 | **R4** — réduire les 2 744 requêtes | moyenne→élevée | moyenne | faible (golden master) | — |
| 0.3 | Étendre le golden master à un 2ᵉ mois | moyenne | faible | nul | données |
| 0.4 | **E2** — couverture des 72 tableaux | élevée | élevée | nul (lecture seule) | — |
| 0.5 | **E3/E4** — période trimestrielle + **base de faits persistée** | **très élevée** | **élevée** | moyen | 0.2, 0.4 |
| 0.6 | Moteur de texte par règles + « Voir le calcul » | **élevée** | moyenne | faible | 0.5 |
| 0.7 | **R6** — état `NA` | moyenne | moyenne | moyen | 0.5 |

**À l'issue de la phase 0, le SID rend déjà tout ce que le DD demande au § 1 de
sa note** — commenter, comparer, dégager les évolutions, produire une
synthèse — **hors connexion, gratuitement, et avec le calcul derrière chaque
phrase.**

C'est alors, et alors seulement, qu'on saura si un modèle de langage ajoute
quelque chose. Cette question doit se poser sur un texte réel, pas sur une
hypothèse.

## PHASE 1 — MVP IA, deux fonctions, si et seulement si la phase 0 est livrée

| # | Fonction | Valeur | Difficulté | Coût | Risque | Dépend de |
|---|---|---|---|---|---|---|
| 1.0 | **R3** — filtrage territorial centralisé | élevée | moyenne | nul | moyen | — |
| 1.1 | **R5** — passerelle + interrupteur + table `AppelIA` | prérequis | faible | ~0 | faible | 1.0 |
| 1.2 | Mise en forme des rubriques narratives du DD (§ 5.1) | **élevée** | faible | négligeable | **faible** | 1.1 |
| 1.3 | Note de difficultés récurrentes (§ 5.2) | **élevée** | moyenne | négligeable | **très faible** | 1.1, 6 mois de données |

Un seul utilisateur en phase 1 : **le DD**. Aucune exposition aux DA, aucune
exposition hors ligne, aucun document transmis à la DREPIA.

Critère de passage à la phase 2 — **mesuré, pas ressenti** : après trois mois,
`modifieParHumain < 50 %` (le DD garde plus de la moitié du texte tel quel).
Sinon, on retire les fonctions.

## PHASE 2 — après validation du MVP

- Reformulation à jetons du texte réglé (§ 5.3), **synthèse trimestrielle
  seulement**.
- Note de brief départemental (§ 5.4).
- Ouverture aux chefs de section, jamais encore aux DA.

## PHASE 3 — assistant transversal, éventuellement

- « Que dois-je encore compléter ? » en langage naturel, **au-dessus du registre
  d'outils**, intentions fermées.
- Ouverture aux DA, **si et seulement si** la phase 2 démontre un usage réel.

## PHASE 4 — seulement si tout ce qui précède a prouvé sa valeur

- Recherche documentaire — **plein texte d'abord**, vectoriel jamais par défaut.
- Auto-hébergement, **si la hiérarchie l'exige**.
- Réglage fin — **probablement jamais**.

## Hors roadmap IA, à faire quand on veut

**R7 — dictée et lecture à voix haute.** Aucune dépendance, forte valeur pour
les agents en difficulté, aucun arbitrage hiérarchique nécessaire.

---

# 21. Décisions à prendre avant d'écrire la moindre ligne

1. **Corrige-t-on R1 immédiatement ?** (le circuit d'analyse est mort) — je
   recommande oui, aujourd'hui.
2. **Confirme-t-on la phase 0 sans IA ?**
3. **La base de faits est-elle persistée** (table `FaitAnalytique`) ou
   recalculée ? — je recommande persistée ; c'est ce qui rend « Voir le calcul »
   possible.
4. **Le DD accepte-t-il un texte réglé, factuel et répétitif**, pendant au moins
   un trimestre, avant de juger s'il manque quelque chose ?
5. **La hiérarchie autorise-t-elle une donnée agrégée à sortir de
   l'infrastructure ?** — cette réponse, et elle seule, tranche entre API
   externe et auto-hébergement. Ce n'est pas une décision technique.
6. **Quel budget annuel maximal**, s'il y en a un ? Une API externe à ce volume
   coûte quelques dollars par an ; l'auto-hébergement, quelques dizaines par
   mois.
7. **Qui signe un texte assisté ?** — je recommande : l'humain, toujours, sans
   mention de l'outil.
8. **Le mot « IA » apparaît-il quelque part dans l'interface ?** — je
   recommande : non.
9. **Traite-t-on R6 (`NA`) pendant E4 ou après ?**
10. **Qui décide de couper l'IA**, et cet interrupteur existe-t-il avant la
    première fonction ? — il doit exister avant.

---

# MA RECOMMANDATION SI C'ÉTAIT MON PROPRE SYSTÈME

Voici ce que je ferais, sans ménagement.

**Aujourd'hui, je corrigerais R1.** Une ligne dans `middleware.ts`. Depuis la
mise en service, tous les rapports mensuels du Menoua portent quatre fois la
mention « Synthèse non disponible. » alors que des chefs de section ont
peut-être écrit quelque chose. C'est une heure de travail pour restaurer la
fonction d'analyse du SID. Aucune considération sur les modèles de langage ne
passe avant cela.

**Ensuite, je construirais la base de faits — et rien d'autre.** C'est le vrai
projet. Le SID ne sait aujourd'hui que faire des sommes. Il ne sait ni un taux,
ni une moyenne, ni une évolution, ni comparer trois mois. Tant que cela n'existe
pas, la discussion sur l'IA porte sur la décoration d'une maison qui n'a pas de
murs.

Et une fois la base de faits construite, **je serais surpris que le besoin d'IA
survive**. Parce que ce que le DD demande — *ce qui augmente, ce qui baisse,
quel mois explique l'évolution, quel arrondissement explique l'écart, quelles
anomalies examiner* — ce sont cinq calculs. Pas cinq jugements. Un moteur de
règles les fait exactement, hors ligne, gratuitement, et **avec le calcul
affichable derrière chaque phrase**.

**Sur l'auto-hébergement, je serais catégorique : non.** Pas par principe — par
arithmétique. Environ 400 appels par an. Un service qui réserve six gigaoctets
de mémoire en permanence pour cela, ou qui fait attendre deux minutes à chaque
réveil, coûte des dizaines de fois ce qu'il rapporte. Et il ne répond pas à
l'objection du supérieur : un modèle ouvert hallucine comme un modèle fermé.
**La défiance ne se soigne pas par le lieu d'hébergement, elle se soigne par la
traçabilité du calcul** — et cela, le moteur de règles le donne totalement,
gratuitement, dès maintenant.

**Il y a malgré tout deux usages où je mettrais un modèle**, et ils n'ont rien à
voir avec les chiffres : transformer les puces du DD en paragraphes
administratifs, et regrouper par thème les centaines de motifs de correction
que personne ne relira jamais. Ces deux-là, une API externe les traite pour le
prix d'un café par an, sans serveur, sans maintenance, et se débranchent en une
seconde. Mais **après** la phase 0, pas avant.

**Et la chose que je ferais avant toute IA, parce qu'elle aide davantage les
agents que n'importe quel modèle : la dictée et la lecture à voix haute.** Le DD
a posé la contrainte de littératie numérique comme majeure. Elle l'est. Or la
réponse à cette contrainte n'est pas un assistant : c'est un bouton micro sur
les champs de texte libre, un bouton haut-parleur sur les messages, du français
simple partout, et **aucune zone où il faut taper une question**. C'est dans le
navigateur, c'est gratuit, et cela change concrètement la vie d'un agent qui
écrit difficilement — ce qu'aucun modèle de langage ne fera.

**Enfin, le point sur lequel je serais le plus ferme.** Le SID a une qualité
rare pour une application administrative : ses chiffres sont exacts, tracés,
reproductibles, et protégés par un test qui refuse toute modification qui les
change. C'est ce qui lui donne son autorité. Ajouter un modèle de langage, c'est
ajouter la seule partie du système qu'aucun test ne pourra jamais vérifier — et
prendre le risque que la DREPIA, apprenant que les rapports sont « écrits par
une IA », doute aussi des chiffres. **On perdrait sur ce qui est irréprochable à
cause de ce qui est accessoire.**

Alors si c'était mon système : la base de faits d'abord, le moteur de règles
ensuite, la voix pour les agents, et le modèle de langage en dernier — petit,
externe, débranchable, invisible, et seulement là où il ne touche aucun chiffre.

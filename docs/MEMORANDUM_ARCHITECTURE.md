# Mémorandum de décision — Architecture et intégration d'une assistance rédactionnelle au SID-DDEPIA

**Version corrigée.** Reprend le mémorandum initial, en confirme les orientations
justes, et corrige trois points qui, en l'état, auraient produit un système
dangereux ou coûteux. Chaque correction s'appuie sur une vérification faite
dans le code et dans la base, citée en clair.

**Périmètre retenu : la région de l'Ouest, huit départements.** Le système est
conçu de façon à ne pas interdire l'extension à d'autres régions, sans que ce
soit un objectif de la présente étape.

---

## 1. Périmètre et dimensionnement

| | |
|---|---|
| Portée immédiate | Département de la Menoua, six arrondissements |
| Portée cible | **Région de l'Ouest, huit départements** |
| Portée non exclue | D'autres régions, ultérieurement |

Le mémorandum initial évoquait **56 départements**, qui correspond à peu près au
compte national. La différence n'est pas rédactionnelle : elle change le
dimensionnement du serveur, le coût d'exploitation et le niveau de
responsabilité juridique sur les données. **Le présent document retient huit.**

La conception reste néanmoins générique : aucun nom de département, de région ni
d'arrondissement n'est écrit dans le code. Passer de huit à davantage sera une
opération de dimensionnement, non de réécriture.

---

## 2. Base de données : centralisée, cloisonnée — avec un préalable impératif

### 2.1 Orientation confirmée

Une **base unique avec cloisonnement logique** est retenue, plutôt qu'une
installation par département. Motif : le niveau régional doit pouvoir consulter
les huit départements sans interroger huit bases distinctes.

### 2.2 Le préalable que le mémorandum initial omettait

Le mémorandum annonçait une sécurité à la ligne (*Row-Level Security*) comme si
elle était acquise. **Elle ne le serait pas.** Vérification faite sur la base du
SID :

```
utilisateur PostgreSQL de l'application : postgres
superutilisateur ................................ oui
contourne la sécurité par ligne (rolbypassrls) .. OUI
```

Un superutilisateur **ignore les politiques de sécurité par ligne**. Elles
seraient écrites, testées, vertes en développement — et **totalement
inopérantes en production**, sans le moindre message d'erreur. Chaque délégué
verrait les données de tous les autres.

C'est la forme de faille la plus dangereuse : celle qui produit un sentiment de
sécurité fondé sur rien.

**Correction exigée, avant toute mise en service multi-départements :**

1. Créer un rôle applicatif **non superutilisateur**, sans `BYPASSRLS`.
2. Poser `SET LOCAL app.departement_id` à chaque transaction — Prisma ne le fait
   pas de lui-même.
3. Écrire un test qui **tente** de lire les données d'un autre département et
   qui échoue si la lecture aboutit. Une politique de sécurité non éprouvée par
   une tentative d'intrusion n'est pas une politique de sécurité.

### 2.3 Deux barrières plutôt qu'une

Le cloisonnement reposera à la fois sur la sécurité par ligne **et** sur le
filtrage applicatif déjà en place. Une requête oubliée dans le code sera
rattrapée par la base ; une politique mal écrite sera rattrapée par le code.

---

## 3. Assistance rédactionnelle : quatre règles non négociables

### 3.1 Orientations confirmées

- **Fonctionnement en circuit fermé**, par Ollama, sur un réseau privé sans
  adresse publique. Aucune donnée sanitaire ou statistique ne sort du système.
- **Aucun entraînement de modèle** : coûteux, risqué, et inutile ici.
- **Modèles candidats** : famille Mistral pour la qualité du français
  administratif, Qwen pour la rigueur sur les données structurées. Le choix se
  fera à l'aveugle, sur des textes produits à partir de dix tableaux réels,
  soumis au Délégué sans qu'il sache lequel est lequel.

### 3.2 Ce que le mémorandum initial omettait, et qui est le cœur du dispositif

Le texte initial indiquait que l'IA « rédigera les paragraphes d'analyse ». Il ne
précisait nulle part **qu'elle n'a pas le droit d'écrire un chiffre**. Sans cette
règle, le modèle peut produire « en hausse de 27 % » — pourcentage qu'il aura
inventé, dans un document signé par le Délégué.

**Règle 1 — Le modèle n'écrit jamais un chiffre.**

Le moteur de calcul du SID produit des faits étiquetés ; le modèle rédige en
n'employant que les étiquettes ; le SID substitue les valeurs après coup.

> Faits : `F1` = Abattages bovins · `F2` = 14 436 têtes · `F3` = Fokoué ·
> `F4` = 55,3 %
>
> Modèle : « Les {F1} du département s'établissent à {F2}. {F3} en concentre à
> elle seule {F4}. »
>
> Document : « Les abattages bovins du département s'établissent à 14 436 têtes.
> Fokoué en concentre à elle seule 55,3 %. »

**Tout caractère numérique dans la sortie du modèle entraîne le rejet.** Un
chiffre faux n'est pas rendu improbable : il est rendu structurellement
impossible.

**Règle 2 — Sept contrôles automatiques, tous bloquants.**

| Défaillance | Verrou |
|---|---|
| Chiffre inventé | tout caractère numérique → rejet |
| Cause inventée | connecteurs explicatifs interdits |
| Territoire non fourni | seuls les noms présents dans les faits |
| Sens inversé | antonymes interdits selon le sens du fait |
| Langue, longueur, sortie vide | contrôle de forme |
| Serveur absent ou lent | repli sur la phrase calculée |
| Tout le reste | relecture et validation par l'émetteur |

**Règle 3 — Le modèle n'est jamais le seul chemin.**

Le SID produit d'abord une phrase calculée, par règles, sans aucun modèle. Le
modèle ne fait que l'améliorer. **Débrancher l'assistance ne casse rien** : le
rapport sort, y compris hors connexion.

**Règle 4 — Aucun texte libre saisi par un agent n'entre dans la requête.**

Les champs libres sont remplis par des agents de terrain. Un texte saisi qui
atteindrait le modèle pourrait en détourner la rédaction. Seuls entrent des
chiffres calculés et des libellés de référentiel.

---

## 4. Génération documentaire : conserver l'outil en place

Le mémorandum initial proposait une application Python fondée sur `docxtpl`.
Cette voie est **écartée**, pour trois raisons vérifiées :

| | Réalité constatée |
|---|---|
| Langage du SID | TypeScript, 178 fichiers |
| Génération Word actuelle | `docxtemplater`, en production |
| Modèles Word | **fabriqués par code**, 36 000 caractères de générateur |

Adopter `docxtpl` imposerait un **deuxième langage et un deuxième service** à
maintenir, et supposerait d'abandonner le générateur de modèles — donc de
redessiner chaque tableau à la main dans Word à chaque évolution du référentiel.

La balise `{{ analyse_vaccination }}` fonctionne à l'identique dans les deux
bibliothèques : **le changement n'apporterait rien et coûterait beaucoup.**

Le rapport reste par ailleurs **strictement conforme au canevas officiel** :
mêmes colonnes, mêmes libellés de ligne, numérotation automatique des tableaux
par champs Word, listes des tableaux et des graphiques générées seules.

---

## 5. Hébergement et capacité

| | |
|---|---|
| Application web | hébergement cloud, accès public authentifié |
| Module d'assistance | **réseau privé interne, invisible depuis internet** |
| Mémoire du module | **8 à 16 Go** pour un modèle de 12 milliards de paramètres quantifié |
| Stockage du modèle | volume persistant — sans quoi le modèle est retéléchargé à chaque déploiement |

Le plan gratuit est insuffisant, comme l'indiquait le mémorandum initial.

---

## 6. Charge et fluidité

Orientation confirmée, et elle est judicieuse :

- **Préparation de nuit.** Les synthèses sont compilées de manière asynchrone
  avant l'ouverture des bureaux.
- **File d'attente.** Une quarantaine de paragraphes par rapport ne tiennent pas
  dans une requête web ; ils sont traités en arrière-plan, avec un écran
  d'avancement.
- **Résultat attendu** : à la connexion du matin, le texte proposé est déjà là,
  à relire et valider.

À l'échelle de huit départements, la charge est modeste : quelques dizaines de
rapports par trimestre, préparés hors des heures ouvrées.

---

## 7. État vérifié du système à ce jour

Ce qui suit a été éprouvé par des tests automatiques, pas seulement annoncé.

| Élément | État |
|---|---|
| Rapport mensuel | en production, protégé par une référence figée |
| Couche calendrier (trimestre, semestre, année) | 28 tests |
| Règles d'agrégation des 413 champs | 12 tests — aucun champ ne peut être agrégé sans règle explicite |
| Moteur de consolidation | 15 tests — refuse de calculer une période incomplète |
| Conformité au canevas, section I | 7 tests — comparaison au caractère près avec le document officiel |
| Production de texte par règles | opérationnelle, chaque phrase porte son calcul |

---

## 8. Lots de travail, par ordre

### Priorité 1 — Rendre le rapport conforme

| N° | Lot |
|---|---|
| 5 | Décrire la première partie du canevas — budget-programme |
| 6 | Décrire les sections techniques — environ 60 tableaux |
| 8 | Intégrer les textes fixes fournis par le Délégué |

### Priorité 2 — Remplir le rapport

| N° | Lot |
|---|---|
| 7 | Saisie trimestrielle par les DA et le chef BAC |
| 17 | Historisation, versionnage, rubriques narratives |

### Priorité 3 — Cloisonnement régional *(rien ne se livre avant le lot 18)*

| N° | Lot | État |
|---|---|---|
| **18** | **Rôle PostgreSQL dédié sans BYPASSRLS — préalable impératif** | fait |
| 19 | Modèles Département et Région, cloisonnement de chaque requête | fait — politiques posées et éprouvées |
| 9 | Retirer les arrondissements codés en dur du module mensuel | fait |
| 15 | Sortir le nom du département du code | fait — voir réserve ci-dessous |
| 16 | Export consolidé destiné au niveau régional | fait |

#### Lot 16 — la DREPIA reçoit un document, elle ne consulte pas le SID

**Décision prise, et elle ferme une question ouverte du §9.** Le canevas
régional est semestriel et sa colonne territoriale porte les huit départements.
La DDEPIA produit donc SA contribution — ses valeurs consolidées du semestre —
et la transmet. **Aucun rôle régional n'est créé, aucune politique de
cloisonnement n'est rouverte** : un département ne voit toujours que lui-même.

C'est la lecture littérale de l'intitulé — « export **destiné au** niveau
régional » — et la seule qui ne défasse pas ce que les lots 18 et 19 ont posé et
éprouvé. Le jour où la DREPIA voudra consulter en ligne, ce sera un chantier
distinct, avec sa propre maille de cloisonnement (la région) et son test
d'intrusion.

**Un semestre ne se somme pas.** Il n'a aucune saisie propre : ses valeurs se
calculent depuis les six mois, et surtout pas toutes par addition. Un cheptel
sommé sur six mois serait multiplié par six, dans un document paraissant
normal, transmis au MINEPIA. L'export passe donc par le moteur d'agrégation,
qui applique à chaque champ sa règle explicite. Le contrôle rejouable vérifie
sur 40 indicateurs de stock qu'aucun n'est la somme de ses mois.

Le document porte une colonne **« Règle »** : le lecteur régional voit si une
valeur est une somme des six mois ou un état de fin de période. Une période
incomplète est refusée avec la liste des mois manquants ; la génération sous
réserve reste possible, et le document porte alors la mention DOCUMENT
PROVISOIRE, jusque dans son nom de fichier.

#### Lot 9 — ce qui est fait, et ce qui ne l'est pas

Les six arrondissements de la Menoua étaient écrits en dur à quatre endroits :
le générateur du rapport mensuel, le fabricant des gabarits, l'export DREPIA et
le remplissage trimestriel. Ils viennent maintenant de la table
`Arrondissement`, lue à travers le cloisonnement — donc du département de
l'appelant (`src/lib/arrondissements.ts`).

La graphie du canevas (`FOKOUE`, `FONGO TONGO`, `NKONG NI`) n'est plus une table
de correspondance recopiée à la main : elle se déduit du nom — majuscules,
accents retirés, tirets en espaces. Un test fige les six correspondances telles
qu'elles étaient écrites avant le lot et vérifie que la règle les reproduit.

L'appariement nom → code du remplissage trimestriel se faisait **par position**
contre la liste des six codes. Il se fait désormais par le nom : l'ordre du
canevas et celui de la base n'ont plus à coïncider.

Vérifié : golden master mensuel au chiffre près, et les trois gabarits
régénérés depuis la base sont identiques **au caractère près** à ceux qui
étaient versionnés — la lecture en base redonne exactement ce que le code
disait.

**La réserve sur le gabarit est levée** — voir le lot 15 ci-dessous.

#### Lot 15 — le nom du département sort du code

« Menoua » était écrit à la main dans une trentaine d'endroits : en-têtes de
documents officiels, messages de relance envoyés sur les téléphones, noms des
fichiers produits, métadonnées d'export, bandeau de l'application, identifiant
du compte DD. `src/lib/departement.ts` les compose désormais à partir de la
base.

**Le français ne se compose pas par une règle.** « de la Menoua », mais « du
Noun », « des Bamboutos ». L'article est donc porté par la donnée
(`Departement.nomAvecArticle`), et non déduit — sans quoi un rapport transmis au
MINEPIA aurait été intitulé « DE NOUN ». À défaut de valeur, on se rabat sur
« de <nom> » : juste dans la majorité des cas, et visible quand ça ne l'est pas.

Comme au lot 9, un test fige les intitulés **tels qu'ils étaient écrits avant**
et vérifie que la composition les redonne au caractère près — y compris
l'apostrophe typographique de « L’ÉLEVAGE », qu'une apostrophe droite aurait
remplacée sans que personne ne le voie.

**Les titres du canevas se transposent, comme pour un arrondissement.** Deux
titres de la section I nomment le département. Le canevas garde la rédaction
officielle — c'est lui qui fait foi — et le rendu y transpose le territoire,
exactement comme il le faisait déjà pour les rapports de DA. Le mémorandum
l'autorise expressément : « seules la période et la maille géographique sont
transposées ».

**Un jeu de gabarits par département.** `rapport_mensuel_DD.docx` devient
`rapport_mensuel_DD_MEN.docx`, et le fabricant boucle sur les départements. Les
gabarits produits pour la Menoua sont identiques **au caractère près** aux
anciens. Un gabarit absent donne un message qui dit quoi faire, au lieu d'un
plantage.

**Réserve — les pages AVANT connexion restent génériques.** La page de connexion
et la page de démonstration affichent encore « SID DDEPIA-Menoua », de même que
le titre d'onglet (`layout.tsx`). C'est délibéré : avant identification, aucune
session ne dit à quel département appartient le visiteur, et une page d'accueil
partagée entre plusieurs délégations ne peut en nommer aucune. Le jour où un
second département arrive, c'est au Délégué de trancher ce qu'elle doit dire.

**Le nom de la base locale hors ligne n'est pas touché.** `SID_DDEPIA_MENOUA`
(`src/lib/dexie.ts`) est le nom de la base IndexedDB des appareils : le changer
ferait perdre à chaque téléphone sa file de synchronisation en attente. Il reste
tel quel — c'est un identifiant technique, pas un libellé affiché.

### Priorité 4 — Assistance rédactionnelle

| N° | Lot |
|---|---|
| 11 | Banc d'essai : trois modèles, choix à l'aveugle par le Délégué |
| 12 | Couche de style — le modèle n'écrit jamais un chiffre |
| 13 | Les sept contrôles bloquants et le repli |
| 14 | Service privé, file d'attente, traçabilité |

---

## 9. Ce qui reste à trancher

- ~~**Le rôle régional**~~ — **tranché au lot 16** : la DREPIA reçoit un
  document, elle ne consulte pas le SID. Le cloisonnement n'a donc pas été
  élargi. Le document transmis porte le détail par arrondissement *et* les
  valeurs consolidées du département : la DREPIA a les deux sans qu'aucun accès
  ne soit ouvert. Rouvrir la question supposerait une maille « région » et son
  propre test d'intrusion.
- **Les treize tableaux du BAC** : personnel, infrastructures, budget, recettes.
  Sont-ils collectés dans le SID, ou rédigés hors système ?

---

*Document de travail interne. Les vérifications techniques qui le fondent sont
reproductibles : chaque affirmation chiffrée provient d'une exécution sur le
code ou la base du SID.*

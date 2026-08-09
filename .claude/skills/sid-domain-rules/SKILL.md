---
name: sid-domain-rules
description: Règles métier et contrôle d'accès du SID DDEPIA — rôles (DD, DA, agent de saisie, chefs de section, admin technique), périmètre par arrondissement et par section, référentiels, traçabilité obligatoire des corrections. À charger avant toute modification touchant les permissions, les rôles, une route API protégée, la visibilité d'une donnée, ou l'ajout d'une rubrique au canevas.
---

# Règles métier du SID DDEPIA-Menoua

## Les rôles et ce qu'ils peuvent

| Rôle | Périmètre | Ne peut pas |
|---|---|---|
| `DD` | Le département entier | — |
| `DA` | Son seul arrondissement | Voir un autre arrondissement |
| `AGENT_SAISIE` | L'arrondissement de son DA | **Soumettre le rapport** |
| `CHEF_*` (BAC, SSV, PSA, SPAIH) | Les tableaux de sa section, sur les 6 arrondissements | Toucher une autre section |
| `ADMIN_TECH` | Maintenance technique | **Toute donnée métier**, toute gestion de compte |

Deux erreurs à ne jamais commettre :

1. **Donner un droit métier à l'ADMIN_TECH.** Sa séparation d'avec le métier
   est une exigence du cahier des charges, pas une préférence.
2. **Filtrer le DD par `sectionId`.** Le DD n'a pas de section : `sectionId`
   est `null`. Tout contrôle de la forme `assertProprietaireSection(user, …)`
   le bloque sur l'intégralité du système. Prévoir explicitement son cas —
   voir `assertPeutCorriger` dans `src/app/api/corrections/route.ts`.

## Contrôle d'accès à deux niveaux

**Niveau 1 — `src/middleware.ts`** filtre par rôle sur un préfixe d'URL.
`PROTECTED_PREFIXES` est parcouru avec `Array.find` : **la première règle qui
correspond gagne**. Une règle spécifique doit donc être déclarée avant la règle
générale qui l'englobe (`/technique/aide` avant `/technique`,
`/api/rapports/submit` avant `/api/rapports`). Placer une règle spécifique
après sa règle générale la rend inopérante, silencieusement.

**Niveau 2 — chaque route**, via `src/lib/permissions.ts` :
`requireUser`, `assertRole`, `assertProprietaireArrondissement`,
`assertProprietaireSection`, `peutConsulterTableauSection`.

Le middleware ne connaît que le rôle. Le cloisonnement par arrondissement ou
par section se refait **toujours** dans la route. Ne jamais s'appuyer sur un
seul des deux niveaux.

## Mode démonstration

Une session démo (`token.isDemo`) interroge `DEMO_DATABASE_URL`, une base
distincte. Elle ne doit atteindre que les chemins listés dans
`CHEMINS_SURS_DEMO` (`src/middleware.ts`) — c'est-à-dire ceux dont on a
**vérifié** qu'ils passent par `user.db` et non par `db` importé directement.
N'ajouter un chemin à cette liste qu'après avoir vérifié la route ligne à
ligne : une erreur ici expose les données réelles de production.

## Le canevas fait autorité

La structure des 28 tableaux réplique le formulaire papier officiel du MINEPIA
(`templates/_reference_CANEVAS_STAT_MENOUA_officiel.docx`). Ne jamais
simplifier, fusionner ou réordonner une rubrique parce qu'elle paraît
redondante. Si une structure semble illogique, elle est quand même
administrativement exigée : la reproduire.

## Référentiels

- Les listes (espèces, maladies, vaccins…) vivent dans `ReferentielItem`,
  jamais en dur dans le code.
- Tout code se terminant par **`_AUTRE`** déclenche automatiquement un champ
  « Veuillez préciser », restitué `libellé (précision)` dans les rapports.
- Les catégories de `src/lib/categoriesStructurelles.ts` (`ESPECE`,
  `VOLAILLE`, `ESPECE_HALIEUTIQUE`) créent automatiquement des colonnes MATRICE
  quand le DD valide une proposition de référentiel. **Exception : le tableau
  T11**, dont les colonnes sont codées en dur dans `canevasLayout.ts` — y
  ajouter une espèce demande une modification manuelle de ce fichier.
- Les propositions de référentiel des DA passent par
  `/api/dd/referentiels-en-attente` et n'existent qu'une fois validées par le
  DD.

## Traçabilité : jamais de correction silencieuse

Toute modification d'une donnée déjà saisie crée une ligne `Correction` :
`valeurAvant`, `valeurApres`, **`motif` obligatoire**, `auteurId`,
`createdAt` — plus une entrée `AuditLog`. Un motif vide se refuse avec un 400.

Cela vaut pour les chefs de section **comme** pour le DD. Le pouvoir
hiérarchique du DD lui permet de corriger sans attendre le chef compétent ;
il ne le dispense jamais de la trace.

## Règle « 0 vs non renseigné »

`valeur = 0` est un zéro réel et compte comme une réponse.
`nonRenseigne = true` est une absence de réponse, exige un motif, et est
signalée comme telle dans les rapports. Ne jamais convertir l'un en l'autre,
ni traiter `null` comme `0` dans une agrégation.

# Module trimestriel du SID — plan d'exécution avec Claude Code

Onze étapes. Une étape par session. Chaque étape a une entrée, une sortie et un test.
Ne pas passer à l'étape suivante tant que le test de l'étape en cours n'est pas vert.

## Préparation du dépôt (à faire une seule fois, avant toute session)

Déposer à la racine du dépôt SID :

- `CLAUDE.md`
- `referentiel_tableaux_v1.json`
- `PLAN_TRIMESTRIEL.md` (ce fichier)
- `docs/canevas/` contenant le canevas régional corrigé et le rapport T1 2026

Puis créer la branche de travail :

```
git checkout -b trimestriel
git add CLAUDE.md referentiel_tableaux_v1.json PLAN_TRIMESTRIEL.md docs/
git commit -m "Cadre de travail du module trimestriel"
```

**Ne jamais coller les fichiers Word dans le chat.** Ils sont dans le dépôt ; l'agent les lit à
la demande. Un seul collage du canevas consomme une part importante du plafond hebdomadaire.

---

## E0 — Filet de sécurité

**Objectif** : rendre toute régression du mensuel immédiatement détectable.

**Prompt à coller :**

```
Lis CLAUDE.md.

Objectif de cette session : créer le test golden master du rapport mensuel. Aucune autre
modification.

1. Identifie le mois déjà clôturé et validé en base.
2. Génère le rapport mensuel de ce mois avec le code actuel.
3. Fige le résultat sous forme de fixture : toutes les valeurs numériques produites, avec
   leur identifiant de rubrique, dans tests/fixtures/golden_mensuel_<mois>.json
4. Écris un test qui régénère ce rapport et compare valeur par valeur avec la fixture. Le test
   échoue si un seul chiffre diffère.
5. Ajoute une commande npm dédiée pour lancer ce test seul.

Ne modifie aucun fichier du module mensuel. Montre-moi le plan et les fichiers concernés avant
d'écrire quoi que ce soit.
```

**Test de sortie** : la commande passe au vert sur le code actuel.
**Commit** : `test: golden master du rapport mensuel`

---

## E1 — Audit de l'existant, en lecture seule

**Objectif** : savoir ce qui existe réellement, pas ce qu'on suppose.

**Prompt à coller :**

```
Lis CLAUDE.md.

Session en LECTURE SEULE. Tu ne modifies aucun fichier, tu ne crées aucun code.

Produis docs/AUDIT_EXISTANT.md décrivant :
1. le modèle de données actuel : tables, champs, types, contraintes ;
2. le circuit du rapport mensuel, de la saisie à la génération DOCX ;
3. le mécanisme de validation d'un mois : où est stocké l'état validé ;
4. le mécanisme de génération DOCX : gabarit, moteur, mode d'insertion des valeurs ;
5. la gestion des rôles et permissions.

Pour chaque affirmation, cite le fichier et la ligne. Si tu n'as pas vérifié, écris
NON VÉRIFIÉ. Ne suppose aucune correspondance.
```

**Test de sortie** : chaque section de l'audit porte des références de fichiers réelles.
**Commit** : `docs: audit de l'existant`

---

## E2 — Couverture du référentiel

**Objectif** : savoir, pour chacun des 72 tableaux, ce que le SID sait déjà produire.

**Prompt à coller :**

```
Lis CLAUDE.md, referentiel_tableaux_v1.json et docs/AUDIT_EXISTANT.md.

Session en LECTURE SEULE.

Pour chacun des 72 tableaux du référentiel, détermine son statut réel dans le SID :
COUVERT, PARTIEL, ABSENT.

Produis docs/COUVERTURE.md avec une ligne par tableau :
table_no | libellé | statut | table et champ source réels | ce qui manque | priorité

Règles :
- COUVERT uniquement si tu as identifié le champ précis qui porte la donnée, avec sa
  référence de fichier.
- PARTIEL si la donnée existe mais dans une structure inadaptée : dis laquelle et pourquoi.
- ABSENT si aucun champ ne la porte.
- Aucune supposition. NON VÉRIFIÉ est une réponse acceptable ; une invention ne l'est pas.

Termine par la liste des manques classés P0, P1, P2.
```

**Test de sortie** : les 72 lignes sont renseignées, sans statut inventé.
**Commit** : `docs: couverture du référentiel par le SID`

---

## E3 — Couche période

**Objectif** : que le système sache raisonner en périodes, indépendamment du rapport.

**Prompt à coller :**

```
Lis CLAUDE.md.

Crée un service de période, fonctions pures, sans accès base, sans effet de bord.

Il doit résoudre : MONTH, QUARTER, SEMESTER, YEAR.
Pour une période donnée, retourner : les mois qui la composent, sa date d'ouverture, sa date
de clôture, la période précédente, la même période de l'année précédente, son libellé officiel
en français (exemple : PREMIER TRIMESTRE 2026).

Contraintes : aucun import depuis le module mensuel, aucune modification de l'existant.
Tests unitaires obligatoires, y compris le passage d'année (T1 2026 précédé de T4 2025).

Montre le plan avant d'écrire.
```

**Test de sortie** : tests unitaires verts, golden master toujours vert.
**Commit** : `feat: couche période`

---

## E4 — Moteur d'agrégation

**Objectif** : consolider les mois validés selon la règle propre à chaque indicateur.

**Prompt à coller :**

```
Lis CLAUDE.md et referentiel_tableaux_v1.json.

Crée le moteur d'agrégation. Il prend en entrée un table_no, une période et la liste des mois
validés, et retourne les valeurs consolidées.

Il applique la règle du référentiel, jamais une règle codée en dur :
SUM, END_OF_PERIOD, FIRST, AVERAGE, MAX, MIN, COUNT, DISTINCT_COUNT, COLLECT_BY_DATE,
FORMULA, MIXED, NONE.

Tests obligatoires :
- un indicateur SUM sur trois mois donne bien la somme ;
- un indicateur END_OF_PERIOD renvoie la valeur du dernier mois et JAMAIS la somme ;
- le tableau 42 (bandes avicoles) est traité comme un STOCK : bandes en cours au 31 mars ;
- un mois manquant produit null, pas 0 ;
- un mois à 0 réel produit 0, pas null.

Aucune modification du module mensuel.
```

**Test de sortie** : tests d'agrégation verts, golden master vert.
**Commit** : `feat: moteur d'agrégation piloté par le référentiel`

---

## E5 — Registres permanents historisés

Personnel, mouvements, infrastructures, équipements, matériel de transport, budget, régies,
projets BIP, partenaires.

Exigence centrale : **l'historisation**. Un agent affecté à Fokoué du 01/01/2026 au 17/08/2026
doit apparaître dans le rapport du T1 même s'il a été muté depuis. Toute table qui ne stocke
que « l'état actuel » empêche de reconstruire un ancien rapport et doit être refusée.

**Commit** : `feat: registres permanents historisés`

---

## E6 — Registre des valeurs historiques N-1

53 des 72 tableaux exigent une colonne N-1 et une ligne Écart. Le SID n'a pas de données 2025.
Créer un registre de saisie manuelle des valeurs de référence, avec un champ obligatoire de
source documentaire (quel rapport, quelle page). Écran de saisie dédié.

**Commit** : `feat: registre des valeurs historiques de référence`

---

## E7 — Contrôles de cohérence

Implémenter les contrôles listés dans CLAUDE.md, dont le contrôle bloquant
69 = 16 + 24 + 29 + 39 + 45. Le résultat des contrôles alimente l'écran de préparation.

**Commit** : `feat: contrôles de cohérence`

---

## E8 — Snapshot, versionnage et statuts

Statuts : `DRAFT`, `READY`, `VALIDATED`, `SUBMITTED`, `ARCHIVED`.
Champs : trimestre, année, statut, date et auteur de génération, version des données, révision.
À la validation, le snapshot est figé. Une correction ultérieure d'un mois crée une révision,
elle ne modifie pas le rapport validé.

**Commit** : `feat: versionnage et snapshot des rapports`

---

## E9 — Écran de préparation et workflow

Le bouton ne génère pas le fichier. Il ouvre une page de préparation affichant : l'état de
validation des trois mois, le taux de complétude des données automatiques, les anomalies
détectées, les informations trimestrielles manquantes. Puis la séparation entre ce qui est
généré automatiquement et ce qui reste à compléter. Enfin les actions : prévisualiser,
compléter, valider, générer DOCX, générer PDF.

Seul le Délégué Départemental, ou un rôle explicitement autorisé, peut finaliser.

**Commit** : `feat: workflow de préparation du rapport trimestriel`

---

## E10 — Générateur DOCX conforme au canevas

Gabarit unique paramétré par la période et la maille. Chaque emplacement du gabarit est ancré
sur un `table_no`. Application de la charte de mise en forme : styles de titres numérotés
automatiquement, légendes par champ, listes de tableaux et de figures automatiques, en-tête et
pied normalisés, gabarit de tableau unique, convention d'affichage 0 / absent / NA.

**Test de sortie** : le rapport T1 2026 régénéré est structurellement identique au canevas
corrigé, avec les 72 tableaux dans l'ordre et la bonne numérotation.
**Commit** : `feat: génération DOCX conforme au canevas régional`

---

## E11 — Rubriques narratives manquantes

Ajouter les rubriques imposées par le canevas et absentes du rapport actuel : Difficultés
rencontrées, Perspectives, Autres activités et commentaires, Résumé des contraintes
stratégiques (saisie bornée à trois), Autres points d'attention stratégique, IV-1 promptitude
et complétude, IV-2-3 surveillance sentinelle, IV-2-4 bilan épidémiologique, IV-7 autres
activités du service, IV-8 cartographie des vétérinaires privés, sous-découpage aviculture.

La rubrique IV-1 est calculable nativement par le SID : ne pas la faire saisir.

**Commit** : `feat: rubriques narratives imposées par le canevas`

---

## Hygiène de session

- Une étape, une session. Effacer le contexte entre deux étapes.
- Toujours demander le plan avant le patch, et le valider.
- Refuser tout diff qui touche des fichiers hors périmètre annoncé.
- Lancer le golden master après chaque étape, avant le commit.
- Taguer après chaque étape réussie : `git tag trimestriel-E4`.
- En cas de dérive, revenir au tag précédent plutôt que de tenter une réparation en chat.

## Économie du plafond hebdomadaire

- Les documents Word restent dans le dépôt, jamais dans le chat.
- Le référentiel JSON remplace toute réanalyse des canevas : il a déjà été produit.
- Les sessions de lecture seule (E1, E2) sont les plus coûteuses : les faire en une fois,
  et s'appuyer ensuite sur les fichiers `AUDIT_EXISTANT.md` et `COUVERTURE.md` produits.
- Ne pas relancer un audit complet à chaque session : CLAUDE.md suffit à recadrer l'agent.

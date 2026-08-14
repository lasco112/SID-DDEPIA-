# Vérification du SID contre le canevas régional

**Le canevas de la DREPIA-Ouest fait foi.** Le canevas départemental de la
Menoua en est une adaptation. Cette note compare chacun des tableaux décrits
dans le SID à son original régional.

## Ce qui différencie légitimement les deux niveaux

Trois adaptations sont attendues, et neutralisées avant comparaison. Sans cela,
tous les tableaux paraîtraient divergents pour de bonnes raisons.

| Régional | Départemental |
|---|---|
| `Départements` — les huit de l'Ouest, plus le siège DREPIA | `Arrondissement` — les six de la Menoua |
| semestriel : `TOTAL 1er S1 2026` | trimestriel : `TOTAL T1 2026` |
| une seule colonne de total | total de la période **et** de la même période N-1 |

Le département a par ailleurs **ajouté** une ligne `TOTAL` et une ligne `ÉCART`
en pied de la plupart des tableaux. C'est un enrichissement, non une
divergence.

## Résultat

| | |
|---|---|
| Tableaux décrits dans le SID | **68** |
| Conformes au régional | **37** |
| Présentant une divergence | **25** |
| Sans original régional identifiable | **6** |

---

## 1. Ce que le régional contient et que le canevas départemental a perdu

Ce sont les seules divergences qui appellent une décision. Chacune est une
colonne ou une ligne présente à la région, absente du document départemental —
donc absente du SID, qui suit ce dernier.

| Élément du régional | Où | Portée |
|---|---|---|
| **« Viande »** | 5 tableaux de commercialisation | La région distingue les **animaux sur pied** et la **viande**. Le canevas départemental n'a gardé que « Animaux sur pied ». **C'est la perte la plus significative.** |
| **« Demande D'Explication »** | Rapport disciplinaire, tableau n° 6 | Une nature de sanction disparue de la liste |
| **« Cochons d'inde »** | Élevages non conventionnels | Le départemental écrit « Cobayes » — même animal, autre nom. Sans conséquence, sauf pour la comparaison avec les autres départements |
| **« CHAMEAUX »** | Abattages d'équidés | Colonne perdue |
| **« Nombre d'OPA »** | Organisations professionnelles | Colonne perdue |
| **« Nom du centre »** | Alevinage | Colonne perdue |
| **« DEFICIT »** | Situation des infrastructures | Colonne perdue |
| **« Catégorie »** | 2 tableaux | Colonne perdue |
| **« Structures »** | 1 tableau | En-tête de première colonne différent |

## 2. Les erreurs déjà signalées, confirmées

La comparaison confirme les quatre points de `docs/ANOMALIES_CANEVAS.md` :

1. **Tableau n° 52** — « La situation de l'apiculture » porte les colonnes de
   la pisciculture. Le régional porte bien miel, cire, propolis, gelée royale,
   ruches, ruchers, apiculteurs, organisations.
2. **Tableau n° 53** — « produits de la ruche » porte « Animaux sur pied ».
3. **Tableau n° 37** — quatre colonnes de total : les deux semestrielles du
   régional n'ont pas été retirées quand les trimestrielles ont été ajoutées.
4. **« Départements »** subsiste aux tableaux n° 36 et 58.

## 3. Ce que le département a bien fait

À l'inverse, plusieurs choix départementaux **améliorent** le régional, et
doivent être conservés :

- **`ÉCART` accentué** et cohérent partout, là où le régional écrit tantôt
  `ECART`, tantôt `Ecart` ;
- **espaces rétablis** : `Catégorie Départ.`, `Prix moyen FCFA/Unité`,
  `Charbon Symptomatique`, là où le régional a perdu l'espace ;
- **comparaison N-1 ajoutée** : le régional ne compare qu'à une seule période,
  le départemental à la même période de l'année précédente. C'est un progrès
  réel pour l'analyse.

---

## 4. Décision attendue du Délégué

Pour chacun des éléments du § 1 :

**a)** faut-il les rétablir dans le canevas départemental, pour rester aligné
sur la région — au risque de demander aux arrondissements des données qu'ils ne
collectent pas aujourd'hui ?

**b)** ou les laisser de côté, en assumant que le rapport départemental soit
moins détaillé que le canevas régional ?

La colonne **« Viande »** est celle qui mérite le plus d'attention : elle
concerne cinq tableaux de commercialisation, et la région l'attend.

Une fois la décision prise, la mise à jour du SID est mécanique : le test de
conformité signale précisément ce qui doit changer.

---

*Vérification reproductible :*

```
node --import tsx scripts/verifier-contre-regional.mjs
```

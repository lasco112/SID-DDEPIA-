# Écarts entre le canevas départemental et sa source régionale

Comparaison automatique du canevas trimestriel de la DDEPIA-Menoua avec le
canevas semestriel de la DREPIA-Ouest dont il est dérivé.

| | |
|---|---|
| Canevas départemental | 81 tableaux |
| Canevas régional | 163 tableaux |
| Tableaux appariés à un original régional | **70** |
| Tableaux propres au département | **11** |

La méthode : chaque tableau départemental est rapproché du tableau régional
dont les libellés lui ressemblent le plus, puis les libellés qui ne diffèrent
que par les accents, la casse ou l'espacement sont signalés. Le script est
`scripts/comparer-canevas.mjs` ; il ne corrige rien, il constate.

---

## 1. Deux erreurs à corriger dans le canevas départemental

### 1.1 Le tableau n° 52 a perdu ses colonnes

**« La situation de l'apiculture »** porte, dans le canevas départemental, les
colonnes de la **pisciculture** :

```
Arrondissement | Nombre de pisciculteurs | Nombre étangs actifs | Superficie |
Bacs hors sol | Volume (m3) | Stations d'alevinage | TOTAL … | TOTAL …
```

Il est **identique au tableau n° 61**, qui est celui de l'aquaculture.

Le canevas régional, lui, porte de vraies colonnes d'apiculture :

```
Départements | Quantité de miel récolté(en litres) | Cire(enkg) |
Propolis (en kg) | Gelée royale (en kg) | Nombre de ruches | Ruchers |
Nombre d'apiculteurs | Nombre d'organisations
```

**L'erreur a été introduite lors de l'adaptation départementale.** Elle n'est
pas dans le document de la région.

### 1.2 Le tableau n° 53 porte « Animaux sur pied »

**« Etat de la commercialisation des produits de la ruche »** a pour seule
colonne de données « Animaux sur pied ». Même origine probable : un
copier-coller depuis un tableau d'élevage.

### 1.3 Le tableau n° 37 a quatre colonnes de total

Le canevas régional est **semestriel**. Son tableau n° 36, cheptel porcin,
porte logiquement :

```
Départements | Verrats | Truies | Castrés | Porcelets | TOTAL 1er S1 2026 | TOTAL 1er S1 2025
```

L'adaptation trimestrielle a **ajouté** `TOTAL T1 2026 | TOTAL T1 2025` sans
**retirer** les deux colonnes semestrielles. Le tableau départemental en compte
donc quatre, dont deux qui n'ont plus de sens dans un rapport trimestriel.

### 1.4 « Départements » subsiste dans deux tableaux

L'adaptation a remplacé « Départements » par « Arrondissement » partout — sauf
dans deux tableaux, qui portent encore la maille régionale :

- **n° 36**, commercialisation d'animaux sur pied dans les élevages d'équidés ;
- **n° 58**, organisations paysannes de pêche et de pisciculture.

---

## 2. Divergences de forme — vingt libellés

Aucune ne change le sens. Elles sont listées pour que le choix soit conscient.

### 2.1 « ÉCART » contre « ECART » — onze occurrences

Le canevas départemental accentue systématiquement la ligne de pied. Le
régional écrit tantôt `ECART`, tantôt `Ecart`, jamais `ÉCART`.

**L'accentuation départementale est meilleure**, et cohérente d'un tableau à
l'autre. À conserver.

### 2.2 Espaces rétablis par le département — à conserver

Le canevas régional a perdu des espaces que le département a rétablis :

| Départemental | Régional |
|---|---|
| `Catégorie Départ.` | `CatégorieDépart.` |
| `Prix moyen FCFA/Unité` | `Prix moyenFCFA/Unité` |
| `Charbon Symptomatique` | `CharbonSymptomatique` |
| `Cirrhose/tumeur du foie` | `Cirrhose /tumeur du foie` |

### 2.3 Différences de casse

| Départemental | Régional | Remarque |
|---|---|---|
| `TOTAL` | `Total` | tableaux n° 2 et 3 |
| `Scanner` | `scanner` | tableau n° 10 |
| `Paons` | `paons` | tableau n° 43 |
| `Anes`, `Chevaux` | `ANES`, `CHEVAUX` | tableau n° 35 |

Le canevas départemental reste lui-même irrégulier sur ce point : `ANES` en
majuscules au n° 34, `Anes` en minuscules au n° 33 et 35. C'est une
irrégularité **héritée du régional**, non introduite par le département.

---

## 3. Les onze tableaux propres au département

Ils n'ont pas d'équivalent régional. Ce sont des ajouts délibérés, non des
erreurs :

| N° | Objet |
|---|---|
| 1 | En-tête bilingue de la Délégation départementale |
| 2 | Liste des sigles et abréviations |
| 12 | Synthèse des crédits par arrondissement |
| 13 | Synthèse des recettes par régie et par mois |
| 17 à 20 | Les quatre tableaux du budget-programme (053, 055, 057, 059) |
| 62 | Production semestrielle d'alevins |
| — | Promptitude et complétude de la transmission zoo-sanitaire |
| — | Tableau de conformité « Dimension / Canevas régional / Présent rapport » |

Le dernier mérite d'être noté : le canevas départemental porte **son propre
tableau de conformité au canevas régional**. C'est une bonne pratique.

---

## 4. Ce que le SID fait de tout cela

**Le canevas départemental fait foi.** Le SID reproduit ce qu'il contient, y
compris les quatre points du § 1, parce qu'un rapport doit être conforme au
formulaire en vigueur, non à ce qu'il devrait être.

**Si le Délégué corrige son canevas**, il suffira de relancer la description des
tableaux concernés : le test de conformité échouera aussitôt et indiquera
précisément quoi mettre à jour. C'est exactement l'usage prévu du filet.

Les tableaux concernés par une correction éventuelle : **n° 37, 52, 53**, et
les deux mentions « Départements » des n° 36 et 58.

---

*Comparaison reproductible :*

```
node scripts/comparer-canevas.mjs \
  docs/canevas/CANEVAS_RAPPORT_TRIMESTRIEL_DDEPIA-MENOUA_v1.docx \
  docs/canevas/CANEVAS_REGIONAL_DREPIA-OUEST_S1-2026.docx
```

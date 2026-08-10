# Analyse et validation des textes du rapport

Décision arrêtée par le Délégué Départemental le 10 août 2026.

Ce document fixe **comment le texte analytique est produit, par qui il est
validé, et ce qui est figé**. Il conditionne les étapes E9 (écran de
préparation) et E11 (rubriques narratives) du plan trimestriel.

Il ne décrit aucun code écrit à ce jour. Rien de ce qui suit n'est implémenté.

---

## 1. Le socle existe déjà

`SyntheseSection` (`prisma/schema.prisma:519`) porte quatre champs qui séparent
déjà, structurellement, la proposition automatique du texte officiel :

| Champ | Ligne | Rôle |
|---|---|---|
| `brouillonIA` | `:524` | Texte proposé par l'IA — commentaire du schéma : « jamais écrasé » |
| `promptIA` | `:525` | Les chiffres exacts fournis à l'IA, pour la traçabilité |
| `contenuFinal` | `:526` | Texte édité et validé par un humain |
| `valideDD` | `:528` | Validation hiérarchique |
| `auteurId` | `:527` | Qui a écrit le texte final |

La clé actuelle est `@@unique([periodeId, sectionId, blocCode])` (`:535`).

**Ce qui manque** : aucune dimension arrondissement. Un DA ne peut donc pas
écrire l'analyse de son territoire. C'est l'unique modification de schéma
qu'appelle cette décision.

---

## 2. Trois couches, dans cet ordre

### Couche 1 — La base de faits, calculée

**Aucun LLM.** Code déterministe uniquement. Pour chaque `table_no`, sur une
période donnée :

- valeur consolidée de la période, selon la règle du référentiel ;
- valeur de la même période l'année précédente, et écart absolu et relatif ;
- contribution de chaque arrondissement au total, et son rang ;
- ruptures : passage d'une valeur significative à zéro, mois absent, valeur
  aberrante au regard des périodes précédentes ;
- résultat des contrôles croisés obligatoires de `CLAUDE.md`.

Ces faits sont **reproductibles** : les mêmes mois validés produisent les mêmes
faits, aujourd'hui et dans six mois. Ils alimentent aussi les figures.

### Couche 2 — Le texte engendré à partir des faits

**Aucun LLM.** Phrases construites par modèles à partir de la base de faits.

C'est **le texte par défaut du rapport** — décision du DD. Il fonctionne hors
ligne, ne dépend d'aucun service extérieur, n'a aucun coût, et un contrôleur
peut toujours refaire le calcul qui l'a produit.

### Couche 3 — L'assistance rédactionnelle, en renfort

Optionnelle. Trois contraintes, non négociables :

**Entrée bornée.** L'IA ne reçoit que la base de faits de la couche 1. Jamais
d'accès à la base de données, jamais de requête libre. Le contenu exact transmis
est conservé dans `promptIA`.

**Sortie non publiante.** Sa production va dans `brouillonIA`, affichée **à côté**
du texte de la couche 2. L'émetteur choisit, corrige, signe. Son texte va dans
`contenuFinal`. `brouillonIA` n'est jamais recopié automatiquement.

**Garde-fou numérique automatique.** Avant affichage, tout nombre présent dans
la proposition est extrait et confronté à la base de faits. **Si un seul nombre
n'y figure pas, la proposition est rejetée** et n'est pas montrée.

Ce dernier point rend l'invariant n° 2 de `CLAUDE.md` — « aucun LLM ne produit
un chiffre officiel » — vérifiable par la machine, et non seulement affirmé
dans un document.

---

## 3. Chaîne de rédaction et de validation

Décision du DD : **DA, puis chefs de section, puis DD.**

| Qui | Rédige et valide | Périmètre |
|---|---|---|
| DA | l'analyse de son arrondissement | son rapport mensuel, et sa contribution au trimestre |
| Chef de section | l'analyse de son domaine | les tableaux relevant de sa section |
| DD | la synthèse départementale | et il valide le rapport trimestriel |

Un texte n'est officiel que lorsque son auteur l'a validé à son niveau. La
validation porte le nom de l'auteur, la date et la période.

Le pouvoir hiérarchique du DD s'applique ici comme ailleurs : il peut valider à
la place d'un émetteur défaillant, et cette validation reste identifiée comme
émanant de lui — même mécanisme que `validationDirecteDD` pour les sections.

---

## 4. Un texte validé est figé

Décision du DD : **figé, avec révision numérotée.**

Une fois validé, un texte ne se modifie plus. Une correction crée une
**révision datée et signée** ; l'ancienne version reste consultable. C'est la
règle déjà retenue pour les chiffres (invariant n° 5), appliquée au texte.

Conséquence : le DD ne retouche pas le texte d'un DA. S'il n'en veut pas, il
demande une correction, ou rédige la synthèse départementale — qui est un texte
distinct, sous sa propre responsabilité.

---

## 5. Ce que cette décision implique

### Modification de schéma nécessaire

`SyntheseSection` doit accueillir :

- `arrondissementId String?` — null pour un texte départemental ou sectoriel ;
- un statut explicite remplaçant le seul booléen `valideDD` : `BROUILLON`,
  `VALIDE_EMETTEUR`, `VALIDE_DD` ;
- `revision Int @default(1)` et le lien vers la révision précédente ;
- la clé d'unicité étendue à l'arrondissement.

Migration **additive** : les colonnes existantes ne sont ni renommées ni
supprimées, et le mécanisme actuel des synthèses de section continue de
fonctionner.

### Où cela s'insère dans le plan

| Étape | Ce que cette décision y ajoute |
|---|---|
| E4 — moteur d'agrégation | produit aussi la base de faits (couche 1) |
| E9 — écran de préparation | affiche texte calculé et proposition côte à côte ; porte la chaîne de validation |
| E11 — rubriques narratives | les rubriques imposées deviennent des textes à émetteur identifié |

Les étapes E5 à E8 sont inchangées.

### Ce qui reste à décider

- **NON TRANCHÉ** : le fournisseur d'IA, son coût par appel et son budget. La
  couche 3 est optionnelle ; les couches 1 et 2 fonctionnent sans.
- **NON TRANCHÉ** : le sort des rubriques narratives d'un arrondissement qui ne
  rédige rien. Le rapport doit-il être bloqué, ou porter la mention « aucune
  analyse transmise » ?

---

## 6. Limite connue

L'assistance rédactionnelle exige un réseau. Un DA hors couverture n'y aura pas
accès. C'est précisément pourquoi le texte calculé est le texte par défaut, et
non un simple secours : le rapport doit pouvoir être produit sans aucun service
extérieur.

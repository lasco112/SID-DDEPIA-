# Analyse et validation des textes du rapport

Décisions arrêtées par le Délégué Départemental les 10 et 11 août 2026.

Ce document fixe **comment le texte analytique est produit, par qui il est
validé, et ce qui est figé**. Il conditionne les étapes E4, E9 et E11 du plan
trimestriel.

Rien de ce qui suit n'est implémenté à ce jour.

---

## 1. Décision de principe : aucun modèle de langage

**Le SID ne recourt à aucun LLM, ni acheté, ni hébergé, ni entraîné.**

Trois raisons, dans cet ordre :

1. **La hiérarchie ne fait pas confiance aux modèles de langage.** Un texte
   officiel dont personne ne peut retracer l'origine est un texte
   indéfendable devant la DREPIA.
2. **La Délégation n'a pas les ressources** pour un abonnement à un service
   extérieur, ni pour héberger un modèle.
3. **Ce n'est pas le bon outil.** Une analyse de rapport administratif énonce
   des faits de calcul — évolution, contribution, rupture, complétude. Ce sont
   des règles arithmétiques, pas de la compréhension du langage. Un modèle
   probabiliste est approximatif là où l'administration exige l'exactitude.

Cette décision est **définitive jusqu'à instruction contraire du DD**. La
possibilité d'une assistance rédactionnelle avait été envisagée le 10 août puis
écartée le 11 : ne pas la reproposer sans nouvel arbitrage.

Les colonnes `brouillonIA` et `promptIA` de `SyntheseSection`
(`prisma/schema.prisma:524` et `:525`) sont conservées — leur nom est
désormais historique. `brouillonIA` accueillera le **texte produit par le
moteur d'analyse**, `promptIA` les **faits qui l'ont produit**. Renommer ces
colonnes exigerait une migration non additive, sans bénéfice fonctionnel.

---

## 2. Le moteur d'analyse : des règles, pas un modèle

### 2.1 Étape 1 — La base de faits

Code déterministe. Pour chaque `table_no` et chaque période, sept **détecteurs**
cherchent chacun une chose précise :

| Détecteur | Ce qu'il cherche |
|---|---|
| `EVOLUTION` | hausse, baisse ou stabilité par rapport à la même période N-1 |
| `CONTRIBUTION` | part de chaque arrondissement dans le total |
| `CONCENTRATION` | un arrondissement dépasse-t-il la moitié du total |
| `DECROCHAGE` | un arrondissement nettement en dessous des autres |
| `RUPTURE` | passage à zéro, ou variation dépassant le seuil d'alerte |
| `COMPLETUDE` | cases non renseignées, et par quel arrondissement |
| `COHERENCE` | résultat des contrôles croisés obligatoires de `CLAUDE.md` |

Chaque détecteur produit un **fait** portant : le `table_no`, le type de
détecteur, les valeurs qui l'ont déclenché, et un niveau d'importance.

Ces faits sont **reproductibles** : les mêmes mois validés produisent les mêmes
faits, aujourd'hui et dans six mois. Ils alimentent également les figures.

### 2.2 Étape 2 — Le texte

Phrases construites par modèles à partir des faits. **Seuls les faits notables
produisent une phrase**, sinon le rapport se noie sous les évidences.

Exemple de sortie attendue :

> « Production d'œufs de table. 1 240 300 unités au premier trimestre 2026, en
> hausse de 12 % sur un an. Dschang concentre 41 % du total départemental.
> Fokoué recule de 22 %, sans motif renseigné. Deux arrondissements sur six
> n'ont pas renseigné le mois de février. »

### 2.3 Chaque phrase porte son calcul

Toute phrase engendrée conserve le lien vers le fait qui l'a produite, et le
fait conserve ses valeurs d'origine. L'émetteur — et un contrôleur — peuvent
donc afficher le calcul :

> « en hausse de 12 % » → 1 240 300 contre 1 107 400 au T1 2025, soit
> +132 900, soit +12,0 %.

**C'est l'argument décisif face à la défiance hiérarchique** : le texte n'est
pas rédigé, il est calculé, et chaque affirmation est vérifiable.

### 2.4 Seuils

Décision du DD : **seuils par défaut, modifiables par le DD** depuis un écran,
sans intervention technique.

Valeurs initiales proposées, à confirmer à l'usage :

| Seuil | Valeur de départ |
|---|---|
| Stabilité — en deçà, on ne commente pas l'évolution | ± 5 % |
| Rupture — au-delà, on signale | ± 50 % |
| Concentration — au-delà, on nomme l'arrondissement | 50 % du total |
| Décrochage — en deçà de la moyenne des autres | − 40 % |

Ces seuils sont stockés en base et non codés en dur : un mauvais calibrage se
corrige sans développeur.

---

## 3. L'analyse est nécessaire sans être obligatoire

Décision du DD : **nécessaire, non obligatoire, mais signalée.**

Pour tout tableau **renseigné mais dépourvu d'analyse** :

- le DA voit la liste des tableaux concernés de son arrondissement **avant de
  transmettre** ;
- le DD voit la liste départementale **avant de valider** ;
- la génération du rapport n'est **jamais bloquée** de ce fait.

Décision du DD sur l'emplacement du signalement : **à l'écran uniquement**. Le
document transmis à la hiérarchie n'en porte aucune trace.

---

## 4. Chaîne de rédaction et de validation

Décision du DD : **DA, puis chefs de section, puis DD.**

| Qui | Rédige et valide | Périmètre |
|---|---|---|
| DA | l'analyse de son arrondissement | son rapport mensuel, et sa contribution au trimestre |
| Chef de section | l'analyse de son domaine | les tableaux relevant de sa section |
| DD | la synthèse départementale | et il valide le rapport trimestriel |

Le texte produit par le moteur est une **proposition** : il s'affiche
d'emblée, l'émetteur le corrige ou le complète, et c'est **sa** version qui
devient officielle, sous son nom.

Un texte n'est officiel que lorsque son auteur l'a validé à son niveau. La
validation porte le nom de l'auteur, la date et la période.

Le pouvoir hiérarchique du DD s'applique ici comme ailleurs : il peut valider à
la place d'un émetteur défaillant, et cette validation reste identifiée comme
émanant de lui — même mécanisme que `validationDirecteDD` pour les sections.

---

## 5. Un texte validé est figé

Décision du DD : **figé, avec révision numérotée.**

Une fois validé, un texte ne se modifie plus. Une correction crée une
**révision datée et signée** ; l'ancienne version reste consultable. C'est la
règle déjà retenue pour les chiffres (invariant n° 5), appliquée au texte.

Conséquence : le DD ne retouche pas le texte d'un DA. S'il n'en veut pas, il
demande une correction, ou rédige la synthèse départementale — texte distinct,
sous sa propre responsabilité.

---

## 6. Ce que cette décision implique

### Modification de schéma

`SyntheseSection` (`prisma/schema.prisma:519`) doit accueillir :

- `arrondissementId String?` — null pour un texte départemental ou sectoriel ;
- un statut explicite remplaçant le seul booléen `valideDD` (`:528`) :
  `BROUILLON`, `VALIDE_EMETTEUR`, `VALIDE_DD` ;
- `revision Int @default(1)` et le lien vers la révision précédente ;
- la clé d'unicité `@@unique([periodeId, sectionId, blocCode])` (`:535`)
  étendue à l'arrondissement.

Une table de seuils est également nécessaire, ou une entrée dans
`ConfigSysteme` (`:724`).

Migration **additive** : aucune colonne existante n'est renommée ni supprimée,
et le mécanisme actuel des synthèses de section continue de fonctionner.

### Où cela s'insère dans le plan

| Étape | Ce que cette décision y ajoute |
|---|---|
| E4 — moteur d'agrégation | produit aussi la base de faits (§ 2.1) |
| E9 — écran de préparation | affiche le texte proposé, la chaîne de validation, et la liste des tableaux sans analyse |
| E11 — rubriques narratives | les rubriques imposées deviennent des textes à émetteur identifié |

Les étapes E5 à E8 sont inchangées.

---

## 7. Ce qui reste ouvert

- **NON TRANCHÉ** : le calibrage réel des seuils du § 2.4. Les valeurs de
  départ sont des propositions, à corriger après le premier trimestre produit.
- **NON TRANCHÉ** : faut-il un détecteur de **tendance sur les trois mois**
  (hausse continue, baisse continue, irrégulier) en plus de la comparaison
  N-1 ? Utile pour les flux, sans objet pour les stocks.

---

## 8. Ce que ce choix coûte, et ce qu'il ne coûte pas

Aucun abonnement, aucun serveur supplémentaire, aucune carte graphique. Le
moteur fonctionne **hors ligne** — un DA sans réseau dispose du même texte
proposé qu'au bureau.

En contrepartie, le texte est **factuel et répétitif** : il énonce ce que les
chiffres disent, il ne fait ni contexte, ni hypothèse, ni recommandation. C'est
précisément ce qui reste au rédacteur humain, et c'est ce qui donne sa valeur à
sa signature.

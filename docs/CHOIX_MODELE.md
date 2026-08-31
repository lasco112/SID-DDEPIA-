# Choisir le modèle — ce qu'il faut, et rien de plus

Document préparatoire au lot 11. **Aucune souscription, aucun engagement de
dépense n'a été pris.** Il dit ce qu'il faudrait comme accès, ce qu'il faut
comparer, et dans quel ordre.

---

## 1. Ce qui a changé depuis l'étude

L'étude concluait, en novembre : *« ne pas choisir de modèle aujourd'hui — non
par précaution rhétorique, mais parce que l'entrée du modèle, la base de faits,
n'existe pas »* (§ 11.3).

**Cette condition est levée.** Vérifié sur le trimestre 3 de 2025, données
réelles de la Menoua :

| Mesure | Valeur |
|---|---|
| Faits analytiques produits | **610** |
| Dont importance ≥ 0,6 | **502** |
| Types de détecteurs actifs | décrochage, concentration, tendance, complétude |

Un exemple, tel que le moteur le rédige aujourd'hui :

> « Dschang reste nettement en retrait, 99,7 % en dessous de la moyenne des
> autres arrondissements. »

Il y a donc largement de quoi constituer les vingt cas réels que la méthode
demande. Et depuis, trois pièces ont été posées : les **garde-fous**, le
**journal des appels**, le **banc d'essai**. Il ne manque que l'accès.

---

## 2. Ce que le modèle doit savoir faire — et c'est peu

Le point le plus utile, et le plus contre-intuitif : **la base de faits réduit
drastiquement l'exigence**. Le modèle ne voit jamais un tableau, ne calcule
rien, ne raisonne pas. Il reçoit des faits déjà établis et doit écrire trois
phrases de français administratif en conservant les jetons intacts.

| Besoin | Niveau |
|---|---|
| Français administratif | **élevé** — c'est le cœur du travail |
| Respect des consignes (conserver les jetons) | **très élevé** |
| Compréhension de tableaux | **faible** — il n'en voit aucun |
| Raisonnement | **faible** — les détecteurs l'ont fait |
| Contexte | 4 à 8 k jetons suffisent |

Conséquence directe sur la taille : **7-8 milliards de paramètres est le point
d'équilibre attendu**, et la classe 3-4 B mérite d'être testée en premier,
contre l'intuition. Au-delà de 14 B, aucune fonction du SID ne le justifie.

---

## 3. La liste courte — la licence d'abord, la qualité ensuite

**Vérifier la licence avant la qualité.** Une administration publique ne peut
pas s'appuyer sur un modèle dont la licence interdit ou restreint son usage.
C'est un filtre éliminatoire, pas un critère de plus.

| Famille | Poids ouverts | Ce qu'il faut vérifier |
|---|---|---|
| **Mistral / Ministral** | oui, selon les versions | français natif ; certaines versions sont en Apache 2.0, d'autres non — **lire la version précise** |
| **Qwen** | oui | Apache 2.0 sur la plupart des versions ; très bon suivi de consignes, ce qui compte ici plus que tout |
| **Gemma** | oui | bon français, mais **licence propre à lire attentivement** : ce n'est pas une licence libre classique |
| **Llama** | oui | licence communautaire, avec des **restrictions d'usage** à examiner |

**Avertissement d'honnêteté.** Ma connaissance de ce domaine s'arrête à mai
2026, et il évolue vite : les versions, les licences et les fournisseurs ont pu
changer depuis. **Chaque ligne de ce tableau est à reconfirmer à la source** le
jour de l'essai. Ce qui ne changera pas, en revanche, c'est l'ordre des
critères : licence, puis français, puis respect des jetons, puis latence.

---

## 4. Poids ouverts n'oblige pas à héberger soi-même

C'est la distinction qui décide du coût, et elle est souvent confondue.

- **Modèle à poids ouverts** — les poids sont publiés, la licence permet de
  l'utiliser, de l'auditer, de le remplacer. C'est ce que vous souhaitez.
- **Auto-hébergement** — vous faites tourner vous-même le serveur d'inférence.
  C'est ce que l'étude déconseille : ~6 Go de mémoire réservés en permanence
  pour quelques centaines de textes par an, plus une surface d'attaque nouvelle
  (un serveur d'inférence est livré sans authentification par défaut).

**Les deux ne sont pas liés.** Un modèle à poids ouverts servi par un
fournisseur, à l'appel, vous laisse le modèle ouvert — donc remplaçable et
auditable — sans payer la mémoire à l'année.

Et si vous voulez auto-héberger plus tard : **un fichier à remplacer**. C'est
exactement pourquoi l'interface `PasserelleIA` a été posée avant tout modèle.

---

## 5. Ce qu'il faut comme accès

Pour l'essai, et pour lui seul :

- **deux ou trois clés d'API** chez un ou plusieurs fournisseurs servant des
  modèles à poids ouverts — un seul fournisseur qui en sert plusieurs suffit et
  simplifie ;
- rien d'autre. Pas de serveur, pas de GPU, pas de service supplémentaire sur
  Railway.

**Le volume de l'essai lui-même est négligeable.** Vingt cas, trois modèles,
soit soixante appels ; environ 500 jetons en entrée et 200 en sortie par appel,
soit **de l'ordre de 40 000 jetons au total** — l'équivalent d'une poignée de
pages. Quel que soit le tarif, l'essai ne représente pas une dépense
significative. C'est l'usage courant qu'il faudra chiffrer ensuite, et il reste
modeste : quelques centaines de textes par an.

Je n'ai vérifié aucun tarif : ils changent, et je ne veux pas vous donner un
chiffre que vous découvririez faux au moment de payer.

---

## 6. Le protocole du jour J

1. **Vingt cas réels** tirés de la base de faits, avec pour chacun le texte que
   le moteur de règles produit aujourd'hui.
2. **Trois candidats**, de classes de taille différentes.
3. Chaque proposition passe par les **garde-fous** avant de vous être montrée :
   une réponse qui invente un chiffre est écartée automatiquement et ne pollue
   pas votre jugement.
4. **Quatre critères mesurables**, relevés par le SID sans vous les demander :
   jetons préservés à l'identique, aucun chiffre inventé, temps de réponse, et
   taux de rejet par les garde-fous.
5. **Vous choisissez, à l'aveugle** : trois textes sous les lettres A, B, C,
   l'ordre retiré au sort à chaque cas. La correspondance ne quitte pas le
   serveur avant le dépouillement.
6. Le banc **refuse de conclure** sous quinze cas, ou si deux modèles sont à
   moins de dix points l'un de l'autre. Il faudra alors départager sur le coût,
   la souveraineté ou la latence — pas sur une préférence qui n'en est pas une.

Comptez **une heure**. C'est le seul temps qu'on vous demande.

---

## 7. Ce que je n'ai pas fait, et ne ferai pas sans votre ordre

- Aucune souscription, aucun compte créé, aucune clé demandée.
- Aucun appel à un service extérieur.
- Aucune donnée du SID n'est sortie, et il n'en sortira pas : dans les usages
  retenus, le modèle ne reçoit **que des faits agrégés et jetonnés** — ni noms
  d'éleveurs, ni registre nominatif, ni identifiants.

L'assistance est par ailleurs **éteinte par défaut** dans le code, et le restera
tant que vous ne l'activerez pas.

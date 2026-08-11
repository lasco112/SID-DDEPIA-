# Couverture du canevas trimestriel par le SID actuel

Étape E2 du plan trimestriel. **Session en lecture seule sur le code** :
aucun fichier applicatif n'a été modifié.

Croisement des **72 tableaux** de `referentiel_tableaux_v1.json` avec les
**28 tableaux de collecte** réellement présents en base, champ par champ.

Règles appliquées : `COUVERT` seulement si le champ porteur est nommé ;
`PARTIEL` si la donnée existe dans une structure inadaptée, avec la raison ;
`ABSENT` si aucun champ ne la porte. **NON VÉRIFIÉ** là où le canevas papier
doit trancher.

| Statut | Tableaux |
|---|---|
| COUVERT | **23** / 72 |
| PARTIEL | **23** / 72 |
| ABSENT | **26** / 72 |

---

## Tableau de couverture

| N° | Libellé | Type | Prio | Statut | Source réelle dans le SID | Ce qui manque |
|---:|---|---|---|---|---|---|
| 1 | Etat des besoins en creation de nouvelles structures | SNAPSHOT | P1 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 2 | Responsables a designer dans certains postes de responsabilites | SNAPSHOT | P1 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 3 | Repartition du personnel par grade | SNAPSHOT | P0 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 4 | Synthese des besoins en personnel par grade | SNAPSHOT | P0 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 5 | Mobilite du personnel | EVENT | P0 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 6 | Rapport disciplinaire | EVENT | P1 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 7 | Situation des infrastructures | STOCK | P0 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 8 | Situation du materiel de transport | STOCK | P0 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 9 | Besoins en materiel de transport | SNAPSHOT | P1 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 10 | La situation des equipements | STOCK | P0 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 11 | Repartition de masse du budget | BUDGET | P0 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 12 | Synthese des credits | BUDGET | P0 | ❌ ABSENT | — | Aucun tableau de collecte. Domaine BAC, non couvert. |
| 13 | Synthese des recettes par regies et par mois | FLUX | P0 | ❌ ABSENT | — | Aucun tableau de collecte. Aucune recette n'est saisie nulle part dans le SID. |
| 14 | Repartition du cheptel bovin par categorie | STOCK | P0 | 🟡 PARTIEL | `T11_CHEPTEL_BOVIN` (1.1) | Effectif total seulement. Les catégories (taurillon, génisse, vache, bœuf) existent dans `T51` pour la commercialisation, pas pour le cheptel. |
| 15 | Infrastructures d'exploitation bovines | STOCK | P0 | ❌ ABSENT | — | Aucun champ sur les infrastructures d'exploitation. |
| 16 | Abattages controles bovins | FLUX | P0 | ✅ COUVERT | `T21_ABAT_BOVIN` (2.1), `T22_NBABAT_BOVIN` (2.2) | Rien. Agrégation trimestrielle = somme des trois mois. |
| 17 | Rendement moyen viande / carcasse | REFERENCE | P0 | ❌ ABSENT | structure prévue : `ReferentielItem.metadata` (`prisma/schema.prisma:139`) | Le commentaire du schéma annonce « rendement carcasse par catégorie (Tableau n°17) », mais **0 référentiel ne porte de metadata** en base. La table de rendement n'existe pas. |
| 18 | Production de viande bovine en tonnes | COMPUTED | P0 | 🟡 PARTIEL | `T22_VIANDE_BOVIN` (2.2) | La valeur est SAISIE par l'agent, alors que le canevas la veut CALCULÉE (abattages × rendement). Le calcul est impossible tant que le tableau 17 est vide. |
| 19 | Synthese des activites de commercialisation bovine | FLUX | P0 | ✅ COUVERT | `T51` (5.1), 42 champs MEV/VENDU/PRIX_MOYEN par catégorie | Rien. |
| 20 | Synthese de l'exploitation du lait | FLUX | P0 | 🟡 PARTIEL | `T25_LAIT_FRAIS` (2.5) ; `T26_LAIT_CAILLE`, `T26_YAOURT`, `T26_BEURRE`, `T26_FROMAGE` (2.6) | Production et transformation couvertes. Commercialisation du lait (quantités vendues, prix) absente. |
| 21 | Production et commercialisation des cuirs | FLUX | P1 | 🟡 PARTIEL | `T25_PEAUX_BOVIN`, `T25_PEAUX_PETITS_RUM` (2.5) ; `T26_PEAUX_TRANSF`, `T26_CUIRS_TRANSF` (2.6) | Production et transformation couvertes. Commercialisation des cuirs absente. |
| 22 | Situation de la circulation interieure bovine | FLUX | P0 | 🟡 PARTIEL | `T44` (4.4), colonne `especeOuProduit` | L'espèce est en **texte libre**, pas en référentiel. Agrégation par espèce non fiable : « bovin », « Bovins », « bœuf » comptent séparément. |
| 23 | Situation du cheptel ovin | STOCK | P0 | 🟡 PARTIEL | `T11_CHEPTEL_OVIN` (1.1) | Effectif total seulement, pas de catégories. |
| 24 | Situation des abattages d'ovins | FLUX | P0 | ✅ COUVERT | `T21_ABAT_OVIN` (2.1), `T22_NBABAT_OVIN` (2.2) | Rien. |
| 25 | Production de viande ovine en tonnes | COMPUTED | P0 | 🟡 PARTIEL | `T22_VIANDE_OVIN` (2.2) | Saisie et non calculée — voir tableau 18. |
| 26 | Commercialisation des animaux et de la viande ovine | FLUX | P0 | ✅ COUVERT | `T52` (5.2), 28 champs | Rien. |
| 27 | Circulation interieure des ovins | FLUX | P0 | 🟡 PARTIEL | `T44` (4.4) | Même défaut d'espèce en texte libre que le tableau 22. |
| 28 | Situation du cheptel caprin | STOCK | P0 | 🟡 PARTIEL | `T11_CHEPTEL_CAPRIN` (1.1) | Effectif total seulement, pas de catégories. |
| 29 | Situation des abattages de caprins | FLUX | P0 | ✅ COUVERT | `T21_ABAT_CAPRIN` (2.1), `T22_NBABAT_CAPRIN` (2.2) | Rien. |
| 30 | Production de viande caprine en tonnes | COMPUTED | P0 | 🟡 PARTIEL | `T22_VIANDE_CAPRIN` (2.2) | Saisie et non calculée — voir tableau 18. |
| 31 | Commercialisation des caprins sur pied | FLUX | P0 | ✅ COUVERT | `T53` (5.3), 28 champs | Rien. |
| 32 | Circulation interieure des caprins sur pied | FLUX | P0 | 🟡 PARTIEL | `T44` (4.4) | Même défaut d'espèce en texte libre que le tableau 22. |
| 33 | Situation des cheptels de camelides et d'equides | STOCK | P1 | ✅ COUVERT | `T11_CHEPTEL_CAMELIN`, `T11_CHEPTEL_ASIN`, `T11_CHEPTEL_EQUIN`, `T11_CHEPTEL_YACK` (1.1) | Rien pour l'effectif. |
| 34 | Situation des abattages d'equides | FLUX | P1 | ❌ ABSENT | — | `T21` ne porte que bovin, ovin, caprin, porcin, volaille. **Aucune colonne équidé.** |
| 35 | Production de viande d'equides en tonnes | COMPUTED | P1 | ❌ ABSENT | — | Dépend du tableau 34, qui n'existe pas. |
| 36 | Commercialisation des equides sur pied | FLUX | P1 | ✅ COUVERT | `T56` (5.6), 42 champs (âne, asin, équin) | Rien. |
| 37 | Situation du cheptel porcin | STOCK | P0 | 🟡 PARTIEL | `T11_CHEPTEL_PORCIN` (1.1) | Effectif total seulement, pas de catégories. |
| 38 | Dynamique des organisations | STOCK | P1 | ❌ ABSENT | — | Aucun champ sur les organisations de producteurs. |
| 39 | Situation des abattages de porcins | FLUX | P0 | ✅ COUVERT | `T21_ABAT_PORCIN` (2.1), `T22_NBABAT_PORC` (2.2) | Rien. |
| 40 | Production de viande porcine en tonnes | COMPUTED | P0 | 🟡 PARTIEL | `T22_VIANDE_PORC` (2.2) | Saisie et non calculée — voir tableau 18. |
| 41 | Commercialisation des produits porcins | FLUX | P0 | ✅ COUVERT | `T54` (5.4), 28 champs | Rien. |
| 42 | Situation des bandes avicoles | STOCK | P0 | 🟡 PARTIEL | `T12` (1.2), 20 champs moderne/traditionnel ; `T13`, `T14_PONDEUSES_DEBUT`, `T15_POULETS_DEBUT` par établissement | Effectifs couverts. Le suivi de bande (entrées, sorties, mortalité par bande) n'est pas structuré comme tel. |
| 43 | Commercialisation des oiseaux sur pied | FLUX | P0 | ✅ COUVERT | `T55` (5.5), 63 champs | Rien. |
| 44 | Commercialisation des oiseaux par categorie | FLUX | P0 | ✅ COUVERT | `T55` (5.5), 9 catégories : poulet de chair, pondeuse, poulet villageois, canard, oie, dinde, caille, pigeon, pintade | Rien. |
| 45 | Abattages controles de volaille | FLUX | P0 | ✅ COUVERT | `T21_ABAT_VOLAILLE` (2.1), `T22_NBABAT_VOLAILLE` (2.2) | Rien. |
| 46 | Production de viande de volaille | COMPUTED | P0 | 🟡 PARTIEL | `T22_VIANDE_VOLAILLE` (2.2) | Saisie et non calculée — voir tableau 18. |
| 47 | Production des oeufs | FLUX | P0 | ✅ COUVERT | `T14_OEUFS_PRODUITS` (1.4), avec `T14_PONDEUSES_DEBUT` | Rien. |
| 48 | Commercialisation des oeufs et fientes | FLUX | P0 | ❌ ABSENT | — | Vérifié : **aucun champ œuf ni fiente dans `T55`**. `T14` ne porte que la production, jamais la vente. |
| 49 | Consommation des produits connexes de l'aviculture | FLUX | P1 | ❌ ABSENT | — | Aucun champ sur les produits connexes (fientes, plumes, litière). |
| 50 | Circulation des bandes et produits avicoles | FLUX | P0 | 🟡 PARTIEL | `T44` (4.4) | Même défaut d'espèce en texte libre que le tableau 22. |
| 51 | Situation des cheptels d'elevages non conventionnels | STOCK | P1 | 🟡 PARTIEL | `T11_CHEPTEL_LAPIN`, `T11_CHEPTEL_AULACODE`, `T11_CHEPTEL_COBAYE`, `T11_CHEPTEL_PRIMATE` (1.1) | Effectifs seulement. Aucune production ni commercialisation pour ces espèces. |
| 52 | La situation de l'apiculture | STOCK | P1 | 🟡 PARTIEL | `T25_MIEL` (2.5) | Production de miel seulement. Ruches, ruchers, apiculteurs, cire : absents. |
| 53 | Commercialisation des produits de la ruche | FLUX | P1 | ❌ ABSENT | — | Aucun champ de commercialisation des produits de la ruche. |
| 54 | Cheptels canins, felins et animaux de compagnie | STOCK | P0 | ✅ COUVERT | `T11_CHEPTEL_CANIN`, `T11_CHEPTEL_FELIN` (1.1) | Rien pour l'effectif. |
| 55 | Situation des pecheurs par nationalite | SNAPSHOT | P1 | ❌ ABSENT | — | Aucun champ sur les pêcheurs. `T16` ne porte que des tonnages. |
| 56 | Situation des equipements de peche par type | STOCK | P1 | ❌ ABSENT | — | Aucun champ sur les équipements de pêche. |
| 57 | Situation des engins de peche par type | STOCK | P1 | ❌ ABSENT | — | Aucun champ sur les engins de pêche. |
| 58 | Organisations paysannes de peche et de pisciculture | STOCK | P1 | ❌ ABSENT | — | Aucun champ sur les organisations de pêche et pisciculture. |
| 59 | Situation generale des captures en tonnes | FLUX | P0 | ✅ COUVERT | `T16` (1.6) : `T16_POISSON_CONTINENTALE`, `T16_CREVETTE_CONTINENTALE`, `T16_POISSON_MARITIME`, `T16_CREVETTE_MARITIME` | Rien. |
| 60 | Etat des ventes par filiere de peche artisanale | FLUX | P0 | ❌ ABSENT | — | Aucun champ de vente pour la pêche artisanale. |
| 61 | Situation de l'aquaculture (etangs, superficies) | STOCK | P0 | ✅ COUVERT | `T17_NB_ETANGS`, `T17_SUPERFICIE` (1.7) | Rien. |
| 62 | Production d'alevins (intitule regional : semestrielle) | FLUX | P0 | ✅ COUVERT | `T17_ALEVINS_CLARIAS`, `_CARPE`, `_KANGA`, `_HEMICHROMIS`, `_TILAPIA` (1.7) | Rien. **Le référentiel annonce une périodicité semestrielle** : à arbitrer en E3. |
| 63 | Situation de la production de poissons de table | FLUX | P0 | ✅ COUVERT | `T17_POISSON_CLARIAS`, `_CARPE`, `_KANGA`, `_HEMICHROMIS`, `_TILAPIA` (1.7) | Rien. |
| 64 | Situation generale de la vaccination par affection | FLUX | P0 | ✅ COUVERT | `T32` (3.2) : `maladie` [ref MALADIE], `espece` [ref ESPECE], `vaccin` [ref VACCIN], `effectifVaccine` | Rien. Source événementielle, mais toutes les clés sont des référentiels : l'agrégation par affection est déterministe. |
| 65 | Situation generale des consultations par espece | FLUX | P0 | 🟡 PARTIEL | `T33` (3.3) : `activite` [ref ACTE_VETERINAIRE = Consultation], `espece` [ref], `effectif` | `T33` s'intitule « Activités des cliniques et partenaires **privés** ». **Les actes des services publics ne sont saisis nulle part.** Le trimestriel demande la situation générale. |
| 66 | Situation generale des deparasitages par espece | FLUX | P0 | 🟡 PARTIEL | `T33` (3.3), `activite` = Déparasitage | Même limite : privé seulement. |
| 67 | Situation generale des castrations par espece | FLUX | P0 | 🟡 PARTIEL | `T33` (3.3), `activite` = Castration | Même limite : privé seulement. |
| 68 | Recapitulation des affections recurrentes | FLUX | P0 | 🟡 PARTIEL | `T31` (3.1) `maladie` [ref], `nbFoyers`, `effectifTouche`, `morts` ; `T33` `maladie` [ref] | Les affections sont bien référencées. La « récurrence » est un calcul sur plusieurs mois — il n'existe pas, il naîtra du moteur (E4). |
| 69 | Situation des abattages controles (inspection) | FLUX | P0 | ✅ COUVERT | `T34` (3.4), 84 champs d'inspection ; `T21` pour les effectifs abattus | Rien. |
| 70 | Recapitulatif des lesions decelees en inspection | FLUX | P0 | 🟡 PARTIEL | `T35` (3.5), `affection` [ref MOTIF_SAISIE — 7 motifs] | **NON VÉRIFIÉ** : le canevas trimestriel parle de « lésions décelées », le SID de « motif de saisie ». La correspondance des deux nomenclatures reste à confronter au canevas papier. |
| 71 | Recapitulatif des saisies effectuees | FLUX | P0 | ✅ COUVERT | `T35` (3.5) : `affection`, `produitSaisi`, `quantiteKg`, `coutPerteFCFA` | Rien. |
| 72 | Recapitulatif des produits inspectes sur les marches | FLUX | P0 | ✅ COUVERT | `T34` (3.4), 84 champs | Rien. |

---

## Les manques, classés

### P0 — absents et bloquants (13 tableaux)

- **3** — Repartition du personnel par grade
- **4** — Synthese des besoins en personnel par grade
- **5** — Mobilite du personnel
- **7** — Situation des infrastructures
- **8** — Situation du materiel de transport
- **10** — La situation des equipements
- **11** — Repartition de masse du budget
- **12** — Synthese des credits
- **13** — Synthese des recettes par regies et par mois
- **15** — Infrastructures d'exploitation bovines
- **17** — Rendement moyen viande / carcasse
- **48** — Commercialisation des oeufs et fientes
- **60** — Etat des ventes par filiere de peche artisanale

### P0 — partiels, à compléter (20 tableaux)

- **14** — Repartition du cheptel bovin par categorie — Effectif total seulement. Les catégories (taurillon, génisse, vache, bœuf) existent dans `T51` pour la commercialisation, pas pour le cheptel.
- **18** — Production de viande bovine en tonnes — La valeur est SAISIE par l'agent, alors que le canevas la veut CALCULÉE (abattages × rendement). Le calcul est impossible tant que le tableau 17 est vide.
- **20** — Synthese de l'exploitation du lait — Production et transformation couvertes. Commercialisation du lait (quantités vendues, prix) absente.
- **22** — Situation de la circulation interieure bovine — L'espèce est en **texte libre**, pas en référentiel. Agrégation par espèce non fiable : « bovin », « Bovins », « bœuf » comptent séparément.
- **23** — Situation du cheptel ovin — Effectif total seulement, pas de catégories.
- **25** — Production de viande ovine en tonnes — Saisie et non calculée — voir tableau 18.
- **27** — Circulation interieure des ovins — Même défaut d'espèce en texte libre que le tableau 22.
- **28** — Situation du cheptel caprin — Effectif total seulement, pas de catégories.
- **30** — Production de viande caprine en tonnes — Saisie et non calculée — voir tableau 18.
- **32** — Circulation interieure des caprins sur pied — Même défaut d'espèce en texte libre que le tableau 22.
- **37** — Situation du cheptel porcin — Effectif total seulement, pas de catégories.
- **40** — Production de viande porcine en tonnes — Saisie et non calculée — voir tableau 18.
- **42** — Situation des bandes avicoles — Effectifs couverts. Le suivi de bande (entrées, sorties, mortalité par bande) n'est pas structuré comme tel.
- **46** — Production de viande de volaille — Saisie et non calculée — voir tableau 18.
- **50** — Circulation des bandes et produits avicoles — Même défaut d'espèce en texte libre que le tableau 22.
- **65** — Situation generale des consultations par espece — `T33` s'intitule « Activités des cliniques et partenaires **privés** ». **Les actes des services publics ne sont saisis nulle part.** Le trimestriel demande la situation générale.
- **66** — Situation generale des deparasitages par espece — Même limite : privé seulement.
- **67** — Situation generale des castrations par espece — Même limite : privé seulement.
- **68** — Recapitulation des affections recurrentes — Les affections sont bien référencées. La « récurrence » est un calcul sur plusieurs mois — il n'existe pas, il naîtra du moteur (E4).
- **70** — Recapitulatif des lesions decelees en inspection — **NON VÉRIFIÉ** : le canevas trimestriel parle de « lésions décelées », le SID de « motif de saisie ». La correspondance des deux nomenclatures reste à confronter au canevas papier.

### P1 — absents, différables (13 tableaux)

1 (Etat des besoins en creation de nouvelles structures) · 2 (Responsables a designer dans certains postes de responsabilites) · 6 (Rapport disciplinaire) · 9 (Besoins en materiel de transport) · 34 (Situation des abattages d'equides) · 35 (Production de viande d'equides en tonnes) · 38 (Dynamique des organisations) · 49 (Consommation des produits connexes de l'aviculture) · 53 (Commercialisation des produits de la ruche) · 55 (Situation des pecheurs par nationalite) · 56 (Situation des equipements de peche par type) · 57 (Situation des engins de peche par type) · 58 (Organisations paysannes de peche et de pisciculture)

### P1 — partiels (3 tableaux)

21 (Production et commercialisation des cuirs) · 51 (Situation des cheptels d'elevages non conventionnels) · 52 (La situation de l'apiculture)

---

## Ce que ces chiffres disent vraiment

26 tableaux absents sur 72, cela paraît considérable. Ce n'est pas
26 problèmes : c'est **quatre causes**, dont une qui en explique la moitié.

### Cause 1 — Le BAC n'a aucun tableau de collecte (13 tableaux)

Les 28 tableaux du SID se répartissent en **PSA (21), SSV (5), SPAIH (2)**.
**Le BAC en a zéro.**

Or les tableaux 1 à 13 du canevas trimestriel sont exactement son domaine :
personnel, infrastructures, matériel de transport, équipements, budget,
crédits, recettes.

C'est cohérent avec l'existant : `verifierCompletudeDD`
(`src/server/export/rapport-docx.ts:279`) **exclut explicitement le BAC** du
contrôle de complétude mensuel. Le mensuel ne lui demande rien ; le
trimestriel lui demande treize tableaux.

**Conséquence : aucune recette n'est saisie nulle part dans le SID.** La
question « quel arrondissement a fait le plus de recettes ce trimestre ? »
est aujourd'hui sans réponse possible.

### Cause 2 — L'espèce est en texte libre dans la circulation (4 tableaux)

`T44` (4.4) porte `especeOuProduit` en **texte libre**. Les tableaux 22, 27,
32 et 50 en dépendent tous les quatre.

Tant que ce champ n'est pas rattaché au référentiel `ESPECE`, « bovin »,
« Bovins » et « bœuf » sont trois espèces différentes pour la machine. Un
seul changement corrige les quatre tableaux.

### Cause 3 — Les tonnages sont saisis, pas calculés (6 tableaux)

Les six tableaux `COMPUTED` du canevas (18, 25, 30, 35, 40, 46) veulent une
production de viande **calculée** : abattages × rendement carcasse.

Aujourd'hui l'agent tape directement le tonnage dans `T22_VIANDE_*`, et le
tableau 17 (rendement) est vide : `prisma/schema.prisma:139` annonce un
`metadata` de rendement, mais **0 référentiel n'en porte** en base.

Deux conséquences : le calcul officiel est impossible, et rien ne vérifie
aujourd'hui que le tonnage saisi soit cohérent avec le nombre de bêtes
abattues.

### Cause 4 — Les actes vétérinaires ne couvrent que le privé (3 tableaux)

`T33` s'intitule « Activités des cliniques et partenaires **privés** ». Son
champ `activite` pointe le référentiel `ACTE_VETERINAIRE` (Consultation,
Déparasitage, Castration, Vaccination privée, Chirurgie, Vêlage assisté,
Autre acte).

Les tableaux 65, 66 et 67 demandent la **situation générale** — donc services
publics compris. Ces actes ne sont saisis nulle part.

---

## Ce qui est réellement prêt

Il faut le dire aussi : **23 tableaux sont couverts sans réserve**, et ils
portent le cœur statistique du rapport — abattages des cinq espèces,
commercialisation des six filières, œufs, pêche, pisciculture, vaccinations,
inspections et saisies.

Pour ces 23 tableaux, **il ne manque que l'agrégation trimestrielle** — c'est
exactement l'objet de E4. Aucune saisie nouvelle n'est à demander aux agents.

---

## Ce que E2 ne tranche pas

- **NON VÉRIFIÉ** — tableau 70 : « lésions décelées » (canevas) contre
  « motif de saisie » (SID, 7 motifs). Les deux nomenclatures doivent être
  confrontées au canevas papier avant tout développement.
- **NON VÉRIFIÉ** — tableau 62 : le référentiel annonce une périodicité
  semestrielle pour la production d'alevins. À arbitrer en E3.
- **Décision du DD attendue** : les 13 tableaux du BAC sont-ils à collecter
  dans le SID, ou resteront-ils rédigés hors système ? Cette réponse change
  la taille du chantier plus que toute autre.

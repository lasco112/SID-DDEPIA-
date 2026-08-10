# Audit de l'existant — SID DDEPIA-Menoua

Étape E1 du plan trimestriel. **Session en lecture seule** : aucun fichier de
code n'a été modifié, aucun code n'a été créé.

Chaque affirmation porte sa référence `fichier:ligne`. Ce qui n'a pas été
vérifié est marqué **NON VÉRIFIÉ** — cette mention est une réponse acceptable,
une supposition ne l'est pas.

Audit réalisé sur la branche `trimestriel`, au commit `2e28bbe`.

---

## 1. Modèle de données

Le schéma unique est `prisma/schema.prisma`. Il déclare **28 modèles et 9
énumérations**.

### 1.1 Acteurs et territoire

| Modèle | Ligne | Rôle |
|---|---|---|
| `User` | `prisma/schema.prisma:35` | Comptes. `role`, `arrondissementId`, `sectionId` |
| `Arrondissement` | `:84` | Les six arrondissements, `code` unique |
| `Section` | `:100` | BAC, PSA, SSV, SPAIH |

`Role` (`:24`) : `DD`, `DA`, `AGENT_SAISIE`, `CHEF_BAC`, `CHEF_SSV`, `CHEF_PSA`,
`CHEF_SPAIH`, `ADMIN_TECH`.

### 1.2 Structure du canevas

| Modèle | Ligne | Rôle |
|---|---|---|
| `FormTemplate` | `:175` | Un tableau du canevas. `code`, `numero`, `type`, `sectionId` |
| `FormField` | `:195` | Une colonne/ligne. `code` **unique**, `typeValeur`, `ordre` |
| `ReferentielItem` | `:132` | Listes paramétrables (espèces, maladies, vaccins) |
| `Etablissement` | `:218` | Registre nominatif par arrondissement |

`TypeTableau` (`:169`) : `MATRICE`, `NOMINATIF`, `EVENEMENT`. **Ces trois
familles conditionnent toute la chaîne**, de la saisie au rendu.

### 1.3 Périodes et cycle de vie

`PeriodeReporting` (`:262`) porte déjà `type: TypePeriode` (`:248`) et les
champs `mois`, `trimestre`, `semestre`. La contrainte d'unicité
`@@unique([type, annee, mois, trimestre, semestre])` (`:294`) autorise donc
**déjà** l'existence d'une période trimestrielle sans modification de schéma.

**Constat important pour le chantier :** aucune période de type autre que
`MENSUEL` n'existe en base locale — vérifié par requête sur
`periodeReporting` le 2026-08-10 : une seule ligne, `07/2026`, type `MENSUEL`.

`StatutPeriode` (`:255`) : `OUVERTE`, `VERROUILLEE_DA`, `VALIDEE_DD`,
`ARCHIVEE`.

### 1.4 Données saisies — trois tables, jamais une seule

| Modèle | Ligne | Clé naturelle |
|---|---|---|
| `SaisieMatrice` | `:399` | `@@unique([rapportId, fieldCode])` `:431` |
| `SaisieNominative` | `:435` | `@@unique([rapportId, etablissementId, fieldCode])` `:464` |
| `SaisieEvenement` | `:468` | aucune clé naturelle ; `@@index([templateId])` `:488` |

Toutes trois portent `valeur Decimal?`, `valeurTexte String?`,
`nonRenseigne Boolean`, `motifNonRenseigne String?`.

**La distinction `0` / absent existe donc déjà en base** : `valeur = 0` est un
zéro mesuré, `nonRenseigne = true` est une absence motivée, `valeur = null`
sans `nonRenseigne` est une case jamais touchée. L'invariant n° 6 de
`CLAUDE.md` est structurellement supporté. **En revanche, l'état `NA` (non
applicable) n'existe pas** : aucun champ ne le porte.

`SaisieMatrice.reporte` (`:411`, ajouté par la migration
`20260809140000_report_mois_precedent`) marque une valeur reprise du mois
précédent et non encore confirmée.

### 1.5 Validation et traçabilité

| Modèle | Ligne | Rôle |
|---|---|---|
| `RapportArrondissement` | `:339` | État du rapport d'un arrondissement pour une période |
| `ValidationSection` | `:371` | État du contrôle d'une section pour une période |
| `Correction` | `:495` | Valeur avant/après, motif obligatoire, auteur, date |
| `AuditLog` | `:685` | Journal des actions |

`StatutRapportDA` (`:332`) : `EN_SAISIE`, `SOUMIS`, `REJETE`, `CLOTURE`.
`StatutValidationSection` (`:364`) : `EN_ATTENTE`, `EN_CONTROLE`, `VALIDE`,
`REJETE`.

### 1.6 Le modèle `MappingRapport` existe mais n'est pas utilisé

`MappingRapport` (`:551`) déclare `docTag`, `fieldCodes[]`,
`arrondissementCode`, `aggregation` et `calculeEcartN1`. L'énumération
`TypeAggregation` (`:544`) offre `SOMME`, `MOYENNE`, `DERNIERE_VALEUR`,
`COMPTAGE`.

**Ce modèle n'est référencé nulle part dans le code applicatif.** Recherche de
`mappingRapport` et `MappingRapport` dans `src/` et `prisma/` hors
`schema.prisma` : aucune occurrence.

C'est une intention de conception restée lettre morte : la correspondance entre
les champs et les balises du document est aujourd'hui **codée en dur** dans
`rapport-docx.ts` et `canevasLayout.ts`. Ce point est central pour l'étape E4 —
le moteur d'agrégation devra lire `referentiel_tableaux_v1.json`, et non
ressusciter ce modèle inutilisé sans décision explicite.

---

## 2. Circuit du rapport mensuel, de la saisie à la génération

### 2.1 Saisie, hors ligne d'abord

L'agent saisit dans `FormMatrice.tsx`, `FormNominatif.tsx` ou
`FormEvenement.tsx`. Chaque frappe est écrite dans la base locale du navigateur
— Dexie/IndexedDB, `src/lib/dexie.ts:214` (`offlineDB`), schéma en version 5
(`:208`).

Les données de référence — tableaux, référentiels, établissements, période
active — sont téléchargées par `/api/bootstrap` et conservées localement.

### 2.2 Synchronisation

`POST /api/sync` (`src/app/api/sync/route.ts:66`), réservé aux rôles `DA` et
`AGENT_SAISIE`.

Points vérifiés :
- refus si la période est clôturée (`:87`) ;
- refus 423 si le rapport est déjà `SOUMIS`/`CLOTURE` (`:112`) ou si la période
  est `VERROUILLEE_DA` sans déverrouillage (`:118`) ;
- écriture par **clé naturelle** et non par `clientId` ;
- arbitrage des conflits par `modifieLe` ;
- les lignes en échec repartent dans `echecs` et ne sont **jamais** confirmées.

### 2.3 Soumission

`POST /api/rapports/submit` (`src/app/api/rapports/submit/route.ts:13`),
réservé au rôle `DA` — l'agent de saisie ne peut jamais soumettre. Transition
vers `SOUMIS`, horodatée et attribuée.

### 2.4 Contrôle sectoriel et validation

Les chefs de section consultent la vue croisée
(`/api/section/vue-croisee/[templateCode]`) et corrigent via
`POST /api/corrections`, avec motif obligatoire et trace `Correction`.

La validation d'une section passe par `POST /api/validations`
(`src/app/api/validations/route.ts:12`). Le DD peut valider à la place d'un
chef via `POST /api/dd/validations` (`src/app/api/dd/validations/route.ts:19`),
et la validation est alors marquée `validationDirecteDD`.

### 2.5 Génération

`POST /api/reports/generate` (`src/app/api/reports/generate/route.ts:21`).
Quatre types : `DD`, `EXACT`, `DA`, `APERCU`.

Pour `DD` et `EXACT`, la génération est refusée si `verifierCompletudeDD`
(`src/server/export/rapport-docx.ts:279`) signale un arrondissement non
transmis ou une section non validée. `APERCU` échappe à cette condition et
porte la mention BROUILLON.

Le document produit est conservé **en base** dans `ExportDocument.contenu`
(`prisma/schema.prisma:581`), versionné par arrondissement, avec empreinte
SHA-256.

---

## 3. Où est stocké l'état « validé » d'un mois

Il n'existe **pas un seul** état de validation, mais trois niveaux distincts,
et c'est un point à connaître avant de définir « un mois validé » pour le
trimestre :

| Niveau | Où | Valeur signifiant « validé » |
|---|---|---|
| Arrondissement | `RapportArrondissement.statut` (`:343`) | `SOUMIS` ou `CLOTURE` |
| Section | `ValidationSection.statut` (`:375`) | `VALIDE` |
| Période | `PeriodeReporting.statut` (`:273`) | `ARCHIVEE` = clôturée et figée |

`verifierCompletudeDD` (`rapport-docx.ts:279`) considère un mois complet quand
les six arrondissements sont `SOUMIS`/`CLOTURE` **et** que toutes les sections
sont `VALIDE`, **à l'exception du BAC** pour une période mensuelle — exclusion
explicite et commentée dans le code.

La clôture définitive est portée par `PeriodeReporting.clotureeLe` /
`clotureeParId` (`:277`), et la réouverture par `reouverteLe`,
`reouvertePar`, `motifReouverture` (`:282`). Le gel effectif des écritures est
appliqué par `assertPeriodeModifiable` dans `src/server/periodes/gel.ts`.

**Recommandation pour E3/E4, à valider :** la définition de « mois validé »
retenue pour le trimestre doit être choisie explicitement entre ces trois
niveaux. `verifierCompletudeDD` est le candidat naturel, mais il exclut le BAC —
ce qui devra être réexaminé pour une période trimestrielle. **NON TRANCHÉ.**

---

## 4. Génération DOCX

### 4.1 Moteur

`docxtemplater` sur `pizzip`, appelé dans `rendreDocx`
(`src/server/export/rapport-docx.ts:490`), avec
`{ paragraphLoop: true, linebreaks: true, nullGetter: () => "—" }`.

Le `nullGetter` explique que toute balise sans valeur s'affiche `—`. **Une
balise oubliée est donc silencieuse** : elle ne fait pas échouer la génération.
Ce comportement est à connaître pour E10.

### 4.2 Gabarits

Quatre fichiers dans `templates/` :

| Fichier | Taille | Usage |
|---|---|---|
| `rapport_mensuel_DD.docx` | 1 152 116 o | Rapport départemental |
| `rapport_mensuel_DA.docx` | 1 149 349 o | Rapport d'arrondissement |
| `rapport_mensuel_exact.docx` | 1 151 732 o | Fiche de collecte |
| `_reference_CANEVAS_STAT_MENOUA_officiel.docx` | 148 627 o | Référence |

**Ces gabarits ne sont pas écrits à la main : ils sont générés** par
`prisma/seed-lib/buildReportTemplates.ts` (`main()` à `:736`, écriture à
`:742`, `:745`, `:748`), à partir de la bibliothèque `docx` et de la mise en
page déclarée dans `prisma/seed-lib/canevasLayout.ts`.

Conséquence directe pour E10 : **le gabarit trimestriel devra être produit par
le même chemin**, et non dessiné dans Word, sous peine de désynchroniser la
mise en page et les balises.

### 4.3 Mode d'insertion des valeurs

`genererPayloadDD` (`rapport-docx.ts:397`) construit un objet plat de balises.
Convention constatée, documentée en tête de fichier (`:1`-`:25`) :

- MATRICE : `{code}_{ARR}`, `{code}_TOTAL`, `{code}_TOTAL_PREC`
- NOMINATIF / EVENEMENT : un tableau JSON nommé d'après le code du tableau
- rapport DA : `{code}` et `{code}_PREC`

Les six codes d'arrondissement sont **codés en dur** à `:34`
(`["DSC","FOK","FGT","NKN","PKM","STC"]`).

La mention d'en-tête `{MENTION_DEMO}` se trouve dans `word/header1.xml` du
gabarit, et non dans le corps — vérifié par lecture du gabarit.

### 4.4 Agrégation actuelle : uniquement inter-arrondissements

Le commentaire d'en-tête de `rapport-docx.ts:5`-`:9` est explicite :

> « Sur une période MENSUELLE, l'agrégation inter-arrondissements est toujours
> une somme (photo STOCK ou flux SOMME, peu importe : on additionne les 6
> arrondissements du MÊME mois). La distinction STOCK/SOMME ne joue que sur les
> périodes multi-mois (trimestre/semestre/année, phase 3) »

**C'est le constat central de cet audit.** Le moteur actuel ne sait sommer que
des arrondissements sur un même mois. **Aucune agrégation multi-mois n'existe
dans le code.** C'est exactement ce que l'étape E4 doit construire — et cela
confirme que le trimestre est un ajout, non une modification du mensuel.

### 4.5 Une règle STOCK/SOMME existe déjà, mais reste inutilisée

`src/lib/aggregationRules.ts:12` expose `getAgregationParChamp()`, qui renvoie
une table `code de champ → STOCK | SOMME | MOYENNE`, lue depuis le dictionnaire
de données (`prisma/seed-lib/parseDictionnaire.ts`).

**NON VÉRIFIÉ :** je n'ai pas établi si cette fonction est appelée quelque part
dans un chemin de production. Recherche à faire en E2.

Deux sources de vérité coexistent donc désormais pour la règle d'agrégation :
ce dictionnaire Excel, et `referentiel_tableaux_v1.json` déposé pour le
trimestre. **Leur articulation doit être tranchée avant E4** — `CLAUDE.md`
désigne le référentiel JSON comme source de vérité fonctionnelle, mais ne dit
pas ce qu'il advient du dictionnaire.

---

## 5. Rôles et permissions

Le contrôle s'exerce à **deux niveaux**, et les deux sont nécessaires.

### 5.1 Filtrage par rôle sur l'URL

`src/middleware.ts:17` déclare `PROTECTED_PREFIXES`. La règle appliquée est la
**première** qui correspond (`Array.find`, `:95`) : une règle spécifique doit
donc précéder la règle générale qui l'englobe.

`src/middleware.ts:116` déclare le `matcher` : `/da`, `/dd`, `/section`,
`/admin`, `/etablissements`, `/technique`, `/api`, `/dashboard`.

### 5.2 Contrôle fin dans chaque route

`src/lib/permissions.ts` :

| Fonction | Ligne | Rôle |
|---|---|---|
| `requireUser` | `:126` | Session obligatoire |
| `assertRole` | `:143` | Restriction par rôle |
| `assertProprietaireArrondissement` | `:167` | Cloisonnement territorial |
| `assertProprietaireSection` | `:173` | Cloisonnement sectoriel |
| `peutConsulterTableauSection` | `:162` | Accès à un tableau donné |
| `permissionErrorResponse` | `:180` | Traduction en réponse HTTP |

`ROLES_CHEF` est défini à `:149`.

Point notable : **le DD n'a pas de section** (`sectionId` nul). Tout contrôle
fondé sur `assertProprietaireSection` le bloque donc sur l'intégralité du
système — d'où le contournement explicite `assertPeutCorriger` dans
`src/app/api/corrections/route.ts:24`. Le même piège attend toute route
trimestrielle.

### 5.3 Mode démonstration

`src/middleware.ts:55` déclare `CHEMINS_SURS_DEMO` : une session de
démonstration ne peut atteindre que les chemins dont il a été **vérifié**
qu'ils passent par `user.db` et non par le client `db` importé directement.
Toute route trimestrielle devra être ajoutée à cette liste **après**
vérification, jamais avant.

---

## 6. Ce que cet audit n'a pas vérifié

Mentions explicites, pour ne pas laisser croire à une couverture complète :

- **NON VÉRIFIÉ** : si `getAgregationParChamp()` est appelée dans un chemin de
  production, et si oui lequel.
- **NON VÉRIFIÉ** : le contenu exact du dictionnaire de données Excel
  (`DICO_DONNEES_CANEVAS_MENSUEL_MENOUA.xlsx`) et sa correspondance avec les
  72 tableaux du référentiel trimestriel. C'est l'objet de E2.
- **NON VÉRIFIÉ** : le comportement de `MappingRapport` s'il était alimenté —
  le modèle n'ayant jamais servi, rien ne prouve qu'il soit exploitable en
  l'état.
- **NON VÉRIFIÉ** : l'état réel de la base de **production**. Tout ce qui
  précède décrit le code et la base locale. Aucune requête n'a été faite sur
  Railway, qui n'est pas joignable depuis le poste de développement.
- **NON VÉRIFIÉ** : la conformité visuelle des gabarits actuels au canevas
  régional trimestriel — les gabarits existants sont mensuels.

---

## 7. Conséquences pour la suite du plan

Trois constats appellent une décision avant d'écrire du code.

**Le trimestre n'a pas d'existant à casser.** Aucune agrégation multi-mois
n'est codée (`rapport-docx.ts:5`). La couche période et le moteur d'agrégation
se construisent donc à côté, sans toucher au mensuel — comme le plan
l'annonçait.

**Deux sources de vérité pour l'agrégation coexistent** : le dictionnaire Excel
lu par `aggregationRules.ts`, et `referentiel_tableaux_v1.json`. Il faut
choisir laquelle fait foi, et ce que devient l'autre.

**« Mois validé » n'a pas de définition unique** : trois états coexistent
(arrondissement, section, période). Le trimestre doit s'appuyer sur une
définition explicite, arrêtée par le DD.

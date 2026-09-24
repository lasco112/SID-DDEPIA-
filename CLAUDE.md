# SID DDEPIA-MENOUA — Règles de travail

Ce fichier est lu automatiquement au début de chaque session. Il fait autorité sur toute
autre instruction donnée dans le chat, sauf instruction contraire explicite du Délégué
Départemental.

## Contexte

Le SID est le système d'information de la Délégation Départementale de l'Élevage, des Pêches
et des Industries Animales de la Menoua. Il collecte, valide, consolide et génère les rapports
administratifs et statistiques officiels.

Le module mensuel est **en production** et a déjà servi à clôturer des cycles réels.
Le chantier en cours est l'ajout du **rapport trimestriel**.

Le rapport produit est un document officiel transmis à la hiérarchie (DREPIA-Ouest, puis
MINEPIA). Une erreur de chiffre est un incident administratif, pas un bug.

## Invariants — ne jamais enfreindre

1. **Non-régression du mensuel.** Le module mensuel ne doit jamais changer de comportement.
   Avant et après toute modification, exécuter le test « golden master » : régénérer un mois
   déjà clôturé et comparer valeur par valeur avec la référence figée. Si un seul chiffre
   diffère, la modification est refusée.

2. **Aucun LLM ne produit un chiffre officiel.** Toute consolidation statistique est
   déterministe : SQL ou TypeScript. Sélection, somme, moyenne, état de période, comparaison,
   formule, contrôle. Une IA rédactionnelle pourra plus tard proposer des commentaires à
   partir de chiffres déjà calculés et certifiés ; elle ne calcule rien.

3. **Une donnée est saisie une seule fois.** Interdiction absolue de créer une table
   trimestrielle parallèle, ou de redemander à l'utilisateur une donnée déjà présente
   ailleurs. Le trimestre est une **vue calculée** sur les mois validés.

4. **Un indicateur de type STOCK n'est jamais sommé** sur les mois de la période.
   Cheptel, étangs, infrastructures, équipements, bandes avicoles : valeur de fin de période.
   Sommer un stock triple le cheptel du département. C'est l'erreur la plus grave possible.

5. **Reproductibilité.** Une génération faite aujourd'hui à partir des mêmes mois validés doit
   produire exactement les mêmes chiffres dans six mois. À la validation, un snapshot est figé.
   Une correction ultérieure d'un mois ne modifie pas un rapport déjà validé : elle crée une
   révision numérotée, accompagnée d'une note de révision.

6. **Distinguer trois états**, jamais confondus : `0` (mesuré et nul), `null` (donnée absente),
   `NA` (non applicable). Un `null` affiché comme `0` fausse tous les totaux.

7. **Ancrage documentaire.** Chaque rubrique du rapport est identifiée par son `table_no`
   (1 à 72) issu du canevas officiel de la DREPIA-Ouest. Ce numéro est la clé de liaison entre
   la base, le moteur d'agrégation et le gabarit DOCX. Ne jamais le renuméroter.

8. **Conformité au canevas hiérarchique.** L'ordre des sections, la numérotation et les
   intitulés des tableaux sont imposés. Ils ne sont pas négociables, même s'ils comportent des
   défauts. Seules la période et la maille géographique sont transposées.

## Référentiel

`referentiel_tableaux_v1.json` est la source de vérité fonctionnelle. Il contient, pour chacun
des 72 tableaux : le libellé normatif, le type d'indicateur, la règle d'agrégation, l'exigence
de comparaison N-1, les contrôles croisés obligatoires et la priorité.

**Le code lit ce fichier ; il ne le contredit pas.** Toute règle métier codée en dur et absente
du référentiel est un défaut. Toute évolution de règle passe d'abord par le référentiel.

Types d'agrégation autorisés :
`SUM` · `END_OF_PERIOD` · `FIRST` · `AVERAGE` · `MAX` · `MIN` · `COUNT` · `DISTINCT_COUNT` ·
`COLLECT_BY_DATE` · `FORMULA` · `MIXED` · `NONE`

## Contrôles croisés bloquants

Aucune génération n'est possible tant que ces contrôles échouent :

- tableau 69 (abattages contrôlés à l'inspection) = somme des tableaux 16 + 24 + 29 + 39 + 45
- tableau 70 (lésions décelées) ≤ tableau 69
- tableau 48 (œufs commercialisés) ≤ tableau 47 (œufs produits)
- tableau 60 (ventes de poisson) ≤ tableau 59 (captures)
- tableau 13 (recettes) : somme des lignes = somme des colonnes, et cohérence avec le
  programme 059 action 03

## Méthode de travail imposée

- **Une étape du plan = une session = un commit.** Pas de refactor opportuniste, pas
  d'amélioration non demandée, pas de changement de dépendance sans validation explicite.
- **Plan avant patch.** Présenter le plan et les fichiers concernés, attendre validation,
  puis exécuter.
- **Diff minimal.** Si une modification touche plus de fichiers que prévu, s'arrêter et le
  signaler.
- **Preuve avant affirmation.** Ne jamais affirmer qu'un champ, une table ou une règle existe
  sans citer le fichier et la ligne. Si la vérification n'a pas été faite, écrire
  `NON VÉRIFIÉ` plutôt que de supposer.
- **Tests obligatoires** à chaque étape : agrégation, données manquantes, stock contre flux,
  changement d'année, permissions, reproductibilité.

## Interdits explicites

- Réécrire le module mensuel au motif qu'il serait perfectible.
- Créer une base ou une table parallèle pour le trimestre.
- Inventer des données de démonstration dans un chemin de code de production.
- Modifier le schéma sans migration réversible.
- Générer un rapport lorsque les mois de la période ne sont pas tous validés, sauf mode
  « génération sous réserve » explicitement demandé, qui imprime alors le taux de complétude
  dans le document.

---

# Annexe technique — le terrain

Cette annexe complète les invariants ci-dessus. Elle ne les contredit jamais.
Elle rassemble ce qui a déjà coûté cher sur ce projet et ne se déduit ni du
code ni du canevas.

## Règle absolue de livraison

**Ne jamais pousser sur GitHub ou Railway sans un ordre explicite du Délégué
Départemental.** Même quand le travail est fini, testé et vert. Sur ce dépôt,
pousser sur `main` déclenche un déploiement immédiat chez les six
arrondissements : il n'y a pas d'étape intermédiaire.

## Trois bases, à ne jamais confondre

| Environnement | URL |
|---|---|
| Locale (`.env`) | `localhost:5432/sid_menoua` |
| Production | `postgis.railway.internal` (Railway) |
| Démonstration | `DEMO_DATABASE_URL`, base distincte |

Un test local ne prouve **rien** sur la production. Quand un problème est
rapporté par un collègue, il est en production : le dire, plutôt que de
présenter une vérification locale comme une preuve.

`prisma migrate deploy` n'agit que sur `DATABASE_URL` ; la base de
démonstration est migrée séparément au démarrage (`scripts/migrations-demo.mjs`),
sans jamais bloquer le service.

## Pièges déjà payés cher

Chacun a causé un incident réel.

**Le disque de Railway est éphémère.** Tout fichier écrit dans
`process.cwd()/storage/` disparaît au redéploiement. Un document à conserver
va en base (`ExportDocument.contenu`), jamais sur disque.

**Idempotence de la synchronisation : clés naturelles, pas `clientId`.**
Les clés qui font foi sont `@@unique([rapportId, fieldCode])` et
`@@unique([rapportId, etablissementId, fieldCode])`.

**Arbitrage des conflits par `modifieLe`**, date de modification sur
l'appareil — et non `syncedAt`, date d'arrivée au serveur.

**Ne jamais confirmer une ligne qui a échoué.** Une ligne renvoyée dans
`confirmedIds` sans avoir été écrite fait vider la file de l'appareil : la
donnée est perdue définitivement.

**Middleware : la règle spécifique précède la règle générale.**
`PROTECTED_PREFIXES` est parcouru avec `Array.find`.

**Cache et hors ligne.** `CACHE_NAME` doit être identique dans `public/sw.js`
et `src/lib/offlineStore.ts`, et **incrémenté** à chaque livraison touchant un
actif statique — sinon les appareils gardent l'ancienne version. Les pages Next
renvoient `Vary: RSC…` : `caches.match()` exige `{ ignoreVary: true }`.

**Ne jamais tirer au sort un identifiant dans une mise à jour d'état React.**
React exécute ces fonctions deux fois : deux lignes étaient créées pour la même
cellule dans la base locale.

## Comment vérifier pour de vrai

`npx tsc --noEmit` et `npx next build` sont un préalable, pas une preuve. Une
fonction n'est vérifiée que lorsqu'elle a été **exercée** avec le rôle concerné
et que le résultat a été constaté en base.

Méthode, sans jamais saisir de mot de passe : forger un jeton avec `encode` de
`next-auth/jwt` et `NEXTAUTH_SECRET`, le poser dans le cookie
`next-auth.session-token`, puis appeler les routes avec `fetch`.

Toujours tester **le refus** autant que le succès, et **remettre en état** les
données touchées par un test.

Le protocole complet — accès par rôle, cloisonnement DA/DD, circuit
trimestriel agent → DA → chef de section → DD, verrous, rapports mensuels et
trimestriels — est écrit : `scripts/verifier-protocole.ts`, à rejouer sur le
serveur local avant toute livraison. Pour vérifier un écran dans le navigateur
avec plusieurs rôles à la fois : une adresse locale par rôle (`127.0.0.1`,
`127.0.0.2`…), chacune a ses propres cookies.

Deux pièges pendant la vérification :

- `next build` pendant que `npm run dev` tourne écrase `.next` et casse le
  serveur de développement.
- Après une migration, le serveur garde l'ancien client Prisma : relancer
  `npx prisma generate` **puis** redémarrer.

Le serveur de développement tourne sur le port 3000 et **le DD s'en sert
lui-même** : ne pas le laisser arrêté.

## Langue

Interface, messages d'erreur et commentaires de code en **français**. Les
messages s'adressent à des agents administratifs : « Votre rapport doit être
soumis avant de générer le document. », jamais « Error 409 ».

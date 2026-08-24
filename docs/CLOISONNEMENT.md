# Cloisonnement par département — état et suite

## Où on en est

| Étape | État |
|---|---|
| Rôle applicatif sans BYPASSRLS (`sid_app`) | **fait** — lot 18 |
| Modèles `Region` / `Departement`, colonne sur 19 tables | **fait** |
| 14 776 lignes rattachées à la Menoua | **fait** |
| `user.db` déclare le département à chaque opération | **fait** |
| Les 29 fichiers avec session passent par `user.db` | **fait** |
| Les 7 fichiers sans session | **fait** — lot 19 |
| Politiques de sécurité par ligne activées | **fait** — lot 19 |
| Test d'intrusion | **fait** — lot 19 |

Contrôles rejouables à tout moment :

```bash
node --env-file=.env --import tsx scripts/verifier-cloisonnement.ts
node --env-file=.env --import tsx scripts/verifier-relances-cloisonnees.ts
node --env-file=.env --import tsx scripts/verifier-transactions-cloisonnees.ts
node --env-file=.env --import tsx scripts/verifier-authentification-cloisonnee.ts
```

## Pourquoi les politiques ne sont pas encore activées

Les politiques comparent le département de chaque ligne au réglage
`app.departement_id`. Ce réglage n'est posé que par le client cloisonné, donc
uniquement quand le code passe par `user.db`.

Une politique permissive quand le réglage est absent serait pire que rien :
elle donnerait le sentiment d'une sécurité qui n'existe pas. C'est exactement
ce que le mémorandum d'architecture interdit. Le réglage absent doit donc
signifier « aucune ligne » — et tout chemin qui lit une table cloisonnée doit
avoir été converti AVANT d'activer quoi que ce soit.

Les chemins applicatifs le sont désormais tous. Reste l'amorçage de
l'authentification, décrit à l'étape 4 : il faut lire un compte AVANT de
connaître son département.

## La piste à ne pas retenter

Attacher le département à la requête via `AsyncLocalStorage.enterWith` dans
`requireUser` **ne fonctionne pas** : `enterWith` ne remonte pas à l'appelant
au-delà d'un `await`. Mesuré, puis confirmé sur l'application. L'échec est
silencieux — aucune erreur, aucun cloisonnement. Le détail est en tête de
`src/lib/dbCloisonne.ts`.

## Ce qu'il reste, dans l'ordre

### 1. Les 29 fichiers qui ont une session sous la main — FAIT

Conversion mécanique : `db.` devient `user.db.`. Ces fichiers appellent déjà
`requireUser` ou `contexteSession` ; l'objet `user` est dans la portée.

À vérifier après chaque lot de fichiers : `npx tsc --noEmit`, puis la suite de
tests, puis les contrôles de bout en bout (`scripts/verifier-rubriques.ts`,
`scripts/verifier-archivage-trimestriel.ts`).

### 2. Les 7 fichiers SANS session — FAIT

**DÉCISION APPLIQUÉE : boucler département par département.** Donner la
connexion d'administration aux tâches de fond reviendrait à laisser une porte
ouverte en permanence — et cette porte serait précisément celle qui contourne
toutes les politiques. Une tâche qui boucle sur les départements est plus longue
à écrire, mais elle ne crée aucun chemin privilégié durable.

| Fichier | Ce qui a été fait |
|---|---|
| `api/mon-compte/premiere-connexion/route.ts` | lit le département du compte, puis écrit avec `clientCloisonne` |
| `app/etablissements/page.tsx` | passe par `contexteSession`, lit avec `user.db` |
| `server/cron/planificateur.ts` | boucle sur `Departement`, un client cloisonné par tour |
| `server/cron/triggers.ts` | les 4 déclencheurs reçoivent le client du département traité |
| `server/notifications/dispatcher.ts` | reçoit son client, comme `evenements.ts` et `push.ts` |
| `server/export/drepia-xlsx.ts` | reçoit `user.db` de la route appelante |
| `server/export/rapport-thematique.ts` | idem |

Trois points qui ne se déduisent pas du tableau :

**Un huitième fichier manquait à l'inventaire : `components/AppShell.tsx`.** Il
lit `PeriodeReporting` — table cloisonnée — mais passe `db` en **paramètre** à
`resoudrePeriode`, sans jamais écrire « `db.` ». Aucun recensement par motif
textuel ne le voyait. Il enveloppe pourtant toutes les pages authentifiées : les
politiques activées, le sélecteur de période se serait vidé partout. Chercher
les fichiers qui *importent* `db`, jamais ceux qui l'*utilisent*.

**Le marqueur des relances porte maintenant le code du département.**
`ConfigSysteme` est une table commune : sans le département dans la clé, le
premier département traité marquerait la relance « faite » pour tous les autres,
qui ne seraient jamais prévenus. L'ancienne forme de clé reste consultée tant
qu'il n'y a qu'un département, pour ne pas renvoyer sur les téléphones des DA
une relance déjà partie le mois de la mise en service.

**`server/cron/alerts.ts` délègue désormais au planificateur.** Cet ancien
process séparé (`npm run cron`) dupliquait la planification. Plutôt que d'y
recopier la boucle des départements, il appelle `verifierRelances` : la logique
du cloisonnement n'existe qu'à un seul endroit, et les deux process peuvent
tourner ensemble sans notifier deux fois — le marqueur les départage.

### 3. Les 7 transactions applicatives — FAIT

Les routes n'appellent plus `transactionCloisonnee` directement : la session
porte sa propre transaction, `user.transaction(async (tx) => …)`, qui ferme sur
le client de base et le département. L'appelant n'a jamais à manipuler l'un ni
l'autre — et ne peut donc plus se tromper de client.

Fichiers convertis : `api/admin/utilisateurs/[id]`, `api/dd/etablissements-demo`,
`api/dd/purger-donnees-test`, `api/etablissements/[id]`, `api/exports/drepia`,
`api/reports/generate`, `server/trimestre/rubriques.ts`.

**Le défaut n'était pas théorique.** `scripts/verifier-transactions-cloisonnees.ts`
le reproduit : sur un client cloisonné, `$transaction([a, b])` dont `b` échoue
laisse `a` VALIDÉE en base. Chaque opération partait dans sa propre transaction.
Une suppression de compte à moitié faite, une purge à moitié faite, un document
archivé sans sa trace d'audit — tout cela était possible.

**La forme en fonction était pire encore.** `db.$transaction(async (tx) => …)`
sur un client cloisonné rend un `tx` lui-même étendu : chaque opération rouvre
sa propre transaction et sort de celle qu'on croyait tenir. Le code a l'air
atomique, il ne l'est pas, et rien ne le signale.

### Le piège à ne pas retenter (bis) : ne jamais passer `user.db` à `transactionCloisonnee`

Un client déjà cloisonné donne un `tx` étendu ; chaque opération repasse par
l'extension, qui se rappelle sur le même `tx`, **sans fin**. Le processus
consomme toute la mémoire disponible avant d'être tué — mesuré, 2 Go en une
minute. Sur Railway, le service redémarre sans laisser d'erreur exploitable.

Un `WeakSet` dans `dbCloisonne.ts` retient les clients fabriqués par
`clientCloisonne`, et `transactionCloisonnee` refuse désormais net, avec le
message qui indique quoi utiliser à la place.

### 4. Activer les politiques — FAIT

Migration `20260815120000_politiques_cloisonnement`. Les 19 tables cloisonnées
portent leur politique :

```sql
ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "X_departement" ON "X"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));
```

`current_setting(…, true)` renvoie NULL si le réglage est absent : la
comparaison est alors fausse et **aucune ligne ne passe**. C'est le bon sens de
l'échec — un chemin non cloisonné ne voit rien, plutôt que de tout voir.

Pas de `FORCE ROW LEVEL SECURITY` : `postgres` reste propriétaire et doit
pouvoir migrer.

#### L'amorçage de l'authentification — ce que le plan n'avait pas prévu

`User` fait partie des 19 tables. Or la connexion doit lire un compte **avant**
de connaître son département : on cherche par nom d'utilisateur, et c'est la
ligne trouvée qui apprend à quel département elle appartient. La vérification de
révocation du jeton relit le compte à chaque requête, avant tout cloisonnement.
Aucune politique ne résout cette circularité — activer les politiques sans rien
faire d'autre empêchait toute connexion, pour tout le monde.

Une seule porte est donc ouverte : `compte_pour_authentification`, fonction SQL
`SECURITY DEFINER` qui rend **un** compte par identifiant ou par nom
d'utilisateur, et rien d'autre. Elle ne permet ni de parcourir la table, ni de
la filtrer, ni d'atteindre une autre table. `identifiant_disponible` la
complète : elle ne rend qu'un booléen, l'unicité d'un identifiant étant globale
et non départementale.

`src/lib/comptes.ts` est le **seul** endroit du code autorisé à les appeler —
trois usages, pas un de plus : la connexion, la résolution d'une session, la
révocation d'un jeton. Chaque usage ajouté élargit la porte.

Tout le reste a été ramené sous cloisonnement sans aucun privilège : la mise à
jour de `lastLoginAt` et la trace d'audit de connexion se font avec un client
cloisonné une fois le département connu, et le jumeau de démonstration se
retrouve en passant par le CODE du département, stable d'une base à l'autre —
`Departement` n'étant pas une table cloisonnée.

#### Les tests et les scripts voyaient une base vide

Un `new PrismaClient()` qui ne déclare aucun département ne voit plus rien. Les
assertions passaient alors au vert **pour de mauvaises raisons** : « aucune
ligne » ressemble à « aucune anomalie ». Douze tests sont tombés, et le
recensement de `verifier-cloisonnement.ts` affichait « 0 ligne, aucune
orpheline » en vert.

`src/lib/baseDeTravail.ts` donne désormais le client cloisonné une fois pour
toutes, et le recensement compte département par département. Deux contrôles
ont été ajoutés là où l'ancien mentait :

- `role-base.test.ts` : sans département déclaré, le rôle applicatif ne voit
  AUCUNE ligne ;
- `verifier-cloisonnement.ts` : le total doit être non nul, sans quoi le
  contrôle ne prouve rien.

#### Piège de banc d'essai : `fournisseur.authorize` rend toujours `null`

`CredentialsProvider` ne garde pas la fonction qu'on lui donne à la racine du
fournisseur : il y laisse un `authorize: () => null` et range les options sous
`.options`. Un contrôle qui appelle `fournisseur.authorize` conclut donc « la
connexion est cassée » alors que l'application fonctionne. La vraie fonction est
`fournisseur.options.authorize`.

#### Au déploiement

Les fonctions d'amorçage sont créées avant les politiques : aucune fenêtre où
l'authentification serait cassée. En revanche, si l'ancien code tourne encore
contre la base migrée — le temps d'une bascule de conteneur — il ne déclare
aucun département et ne voit donc plus rien. **Déployer à une heure creuse.**

#### L'écriture pour un second département — FAIT

Migration `20260815160000_departement_a_la_creation`.

Le client cloisonné déclarait le département à la base — ce qui suffit pour LIRE
et pour MODIFIER — mais ne l'inscrivait pas dans les lignes créées. Une valeur
par défaut, `dep_menoua`, comblait le trou : juste tant qu'il n'y a qu'un
département, faux dès le second, dont les créations auraient pris la valeur par
défaut et se seraient fait refuser par le `WITH CHECK`.

**Une règle de la base, pas du code.** Une injection écrite dans le client
cloisonné n'aurait pas tout couvert : `transactionCloisonnee` remet à l'appelant
un client de transaction BRUT, qui ne passe pas par l'extension — les sept
transactions applicatives lui auraient échappé. Un déclencheur `BEFORE INSERT`
s'applique à toute insertion, quel que soit le chemin, y compris du SQL écrit à
la main.

**La valeur par défaut est retirée.** Une insertion sans département déclaré
n'est plus rattachée à la Menoua par accident : elle est refusée. Une ligne qui
n'appartient à personne est pire qu'une insertion qui échoue — elle devient
invisible à tous et fausse les totaux sans que rien ne le signale.

La liste des tables n'est pas recopiée dans la migration : elle est **lue dans
le catalogue** comme étant l'ensemble des tables portant une colonne
`departementId`. Une table cloisonnée ajoutée demain ne peut pas être oubliée.

#### Piège : Prisma avale le message d'un code d'erreur qu'il connaît

Le déclencheur levait d'abord avec `ERRCODE = '23502'` (violation de non-nullité).
Prisma reconnaît ce code, le traduit en `P2011` et **remplace le message** par
« Null constraint violation on the fields: () ». Le motif réel était perdu, et
qui lisait l'erreur ne pouvait pas savoir quoi corriger. Sans code explicite,
`RAISE` emploie `P0001`, que Prisma ne reconnaît pas : le message français passe
alors intact, comme le fait déjà le refus des politiques.

#### Le semis était cassé, et personne ne l'avait vu

`prisma/seed.ts` et `prisma/seed-demo.ts` écrivaient avec un client nu. Depuis
les politiques, chacune de leurs insertions était refusée — l'application
n'était donc plus installable sur une base neuve. Ils résolvent maintenant le
département (`Departement` n'est pas cloisonnée, elle se lit sans réglage) et
poursuivent avec un client cloisonné.

Vérifié pour de vrai : base jetable créée, les 22 migrations appliquées, le
semis exécuté avec le rôle applicatif, 67 lignes semées et **aucune orpheline**,
puis la base supprimée.

### 5. Le test d'intrusion — FAIT

`tests/intrusion.test.ts`, dans la suite : neuf contrôles, joués à chaque
exécution. Un second département fictif est créé avec ses lignes, on se déclare
dans le premier, et on tente d'atteindre les siennes.

Ce qui est éprouvé :

| Tentative | Attendu |
|---|---|
| lire l'arrondissement, le compte, la période du voisin | rien |
| lister — sans filtre — arrondissements et comptes | aucune ligne du voisin |
| passer par une **jointure** (`arrondissement: { code }`) | rien |
| modifier une ligne du voisin | 0 ligne touchée, et la sienne intacte |
| supprimer une ligne du voisin | 0 ligne touchée |
| **créer** une ligne au nom du voisin | refus de la base (`WITH CHECK`) |
| ne rien déclarer du tout | rien, dans les deux départements |

Deux précautions rendent ce test sérieux :

**Il vérifie d'abord que les lignes visées existent vraiment.** Sans cela, tous
les contrôles suivants passeraient au vert sur une base vide — c'est exactement
le piège dans lequel les tests étaient tombés à l'étape 4.

**Il a été vu échouer.** `ALTER TABLE "Arrondissement" DISABLE ROW LEVEL
SECURITY`, puis rejeu : quatre contrôles virent au rouge, et uniquement ceux qui
portent sur cette table — ceux sur `User` et `PeriodeReporting` restent verts. La
politique a été remise aussitôt (19/19). Un test d'intrusion qui n'a jamais
échoué ne prouve rien.

Le `WITH CHECK` mérite d'être souligné : c'est la moitié qu'on oublie. Sans lui,
on ne pourrait pas LIRE les données d'un autre département, mais on pourrait y
en DÉPOSER.

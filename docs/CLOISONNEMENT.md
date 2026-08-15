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
| Politiques de sécurité par ligne activées | **à faire** |
| Test d'intrusion | **à faire** |

Contrôles rejouables à tout moment :

```bash
node --env-file=.env --import tsx scripts/verifier-cloisonnement.ts
node --env-file=.env --import tsx scripts/verifier-relances-cloisonnees.ts
node --env-file=.env --import tsx scripts/verifier-transactions-cloisonnees.ts
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

### 4. Activer les politiques

Une migration, par table cloisonnée :

```sql
ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "X_departement" ON "X"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));
```

`current_setting(…, true)` renvoie NULL si le réglage est absent : la
comparaison est alors fausse et **aucune ligne ne passe**. C'est le bon sens de
l'échec — un chemin non cloisonné ne voit rien, plutôt que de tout voir.

Ne PAS mettre `FORCE ROW LEVEL SECURITY` : `postgres` reste propriétaire et
doit pouvoir migrer.

### 5. Le test d'intrusion

Exigé par le mémorandum, et il ne suffit pas de vérifier qu'un délégué voit ses
données : il faut **tenter** de lire celles d'un autre département et que le
test échoue si la lecture aboutit. Créer un second département fictif avec
quelques lignes, se déclarer dans le premier, et compter ce qu'on obtient.

Une politique non éprouvée par une tentative d'intrusion n'est pas une
politique de sécurité.

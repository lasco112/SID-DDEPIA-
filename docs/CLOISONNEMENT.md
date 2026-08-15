# Cloisonnement par département — état et suite

## Où on en est

| Étape | État |
|---|---|
| Rôle applicatif sans BYPASSRLS (`sid_app`) | **fait** — lot 18 |
| Modèles `Region` / `Departement`, colonne sur 19 tables | **fait** |
| 14 776 lignes rattachées à la Menoua | **fait** |
| `user.db` déclare le département à chaque opération | **fait** |
| Les 29 fichiers avec session passent par `user.db` | **fait** |
| Les 7 fichiers sans session | **à faire — décision prise, voir ci-dessous** |
| Politiques de sécurité par ligne activées | **à faire** |
| Test d'intrusion | **à faire** |

Contrôle rejouable à tout moment :

```bash
node --env-file=.env --import tsx scripts/verifier-cloisonnement.ts
```

## Pourquoi les politiques ne sont pas encore activées

Les politiques compareraient le département de chaque ligne au réglage
`app.departement_id`. Ce réglage n'est posé que par le client cloisonné, donc
uniquement quand le code passe par `user.db`. Il reste **7 fichiers** qui
importent `db` directement — sur 36 au départ. Les activer aujourd'hui rendrait
ces 7 chemins aveugles : ils ne verraient plus aucune ligne. Parmi eux, l'envoi
des notifications et les tâches planifiées, dont la panne serait silencieuse.

Et l'inverse — une politique permissive quand le réglage est absent — serait
pire : elle donnerait le sentiment d'une sécurité qui n'existe pas. C'est
exactement ce que le mémorandum d'architecture interdit.

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

### 2. Les 7 fichiers SANS session — une décision, pas une réécriture

| Fichier | Nature | Ce qu'il faut trancher |
|---|---|---|
| `api/mon-compte/premiere-connexion/route.ts` | avant authentification | légitime hors département : il change un mot de passe, il ne lit aucune donnée métier |
| `app/etablissements/page.tsx` | page serveur | doit passer par `contexteSession` |
| `server/cron/planificateur.ts` | tâche de fond | traverse TOUS les départements par nature |
| `server/cron/triggers.ts` | tâche de fond | idem |
| `server/notifications/dispatcher.ts` | tâche de fond | idem |
| `server/export/drepia-xlsx.ts` | export | reçoit son client en paramètre : lui passer `user.db` |
| `server/export/rapport-thematique.ts` | export | idem |

**DÉCISION PRISE : boucler département par département.** Donner la connexion
d'administration aux tâches de fond reviendrait à laisser une porte ouverte en
permanence — et cette porte serait précisément celle qui contourne toutes les
politiques. Une tâche qui boucle sur les départements est plus longue à écrire,
mais elle ne crée aucun chemin privilégié durable.

### 3. Les 7 transactions applicatives

Six utilisent la forme en tableau — `db.$transaction([...])` — qui ne survit
pas à une extension de client. Les convertir en `transactionCloisonnee`
(`src/lib/dbCloisonne.ts`).

Fichiers : `api/admin/utilisateurs/[id]`, `api/dd/etablissements-demo`,
`api/dd/purger-donnees-test`, `api/etablissements/[id]`, `api/exports/drepia`,
`api/reports/generate`, `server/trimestre/rubriques.ts`.

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

# Le rôle avec lequel l'application se connecte à la base

## Le problème

Jusqu'au lot 18, l'application se connectait en `postgres` :

```
rôle applicatif : postgres — rolsuper: true, rolbypassrls: true
tables avec RLS activée : 0
```

Un superutilisateur, et un rôle portant `BYPASSRLS`, échappent aux politiques
de sécurité par ligne. PostgreSQL ne les applique pas : **sans erreur, sans
avertissement, sans trace**. On peut donc écrire un cloisonnement complet,
croire qu'il protège, et se tromper du tout au tout.

Tant que la base ne sert qu'un département, cela ne se voit pas. Le jour où les
huit départements de l'Ouest la partagent — c'est la décision du mémorandum
d'architecture — c'est la seule barrière qui compte. Il sera alors trop tard
pour découvrir qu'elle n'a jamais été posée.

## Ce qui a été fait

Deux rôles, deux usages :

| Rôle | Usage | Droits |
|---|---|---|
| `postgres` | migrations, administration | propriétaire des tables |
| `sid_app` | **l'application, en fonctionnement** | lire et écrire des lignes, rien de plus |

`sid_app` : `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`.
Il n'a pas `CREATE` sur le schéma `public` : il ne peut créer, modifier ni
supprimer aucune table.

### Le piège du propriétaire

Il ne suffit pas de retirer `BYPASSRLS`. **Le propriétaire d'une table échappe
lui aussi à ses politiques**, sauf si la table porte `FORCE ROW LEVEL
SECURITY`. Donner les tables à `sid_app` aurait donc rouvert le même trou sous
une autre forme. D'où la séparation : `postgres` reste propriétaire, `sid_app`
ne possède rien. Un test le vérifie.

### Les tables créées plus tard

`ALTER DEFAULT PRIVILEGES FOR ROLE postgres` fait que toute table créée
ensuite par une migration est automatiquement lisible et modifiable par
`sid_app`. Sans cela, l'application serait tombée en panne au déploiement
suivant — non pas pendant la migration, mais à la première requête sur la
table neuve.

## Les variables d'environnement

| Variable | Contenu |
|---|---|
| `DATABASE_URL` | connexion de l'**application** — `sid_app` |
| `MIGRATE_DATABASE_URL` | connexion d'**administration** — `postgres` |
| `DEMO_DATABASE_URL` | idem, base de démonstration, `sid_app` |
| `MIGRATE_DEMO_DATABASE_URL` | idem, base de démonstration, `postgres` |

**Repli délibéré :** si les variables `MIGRATE_*` sont absentes, les scripts de
migration retombent sur `DATABASE_URL` / `DEMO_DATABASE_URL`, c'est-à-dire le
comportement d'avant ce lot. Ce repli n'est pas une négligence : sans lui,
déployer ce code sur un environnement où la variable n'existe pas encore ferait
échouer `prisma migrate deploy` — et **une migration qui échoue au démarrage
empêche le conteneur de démarrer**. L'application resterait éteinte pour les six
arrondissements le temps qu'on s'en aperçoive.

## Marche à suivre sur Railway

**Non fait. À exécuter par l'utilisateur, après sauvegarde.**

1. Sauvegarder la base — `/technique/sauvegarde`, compte ADMIN_TECH.

2. Créer le rôle, depuis un poste ayant accès à la base de production :

   ```
   ADMIN_DATABASE_URL="<url postgres de production>" \
     node scripts/creer-role-applicatif.mjs --engendrer
   ```

   Le script affiche le mot de passe engendré. Il est **idempotent** : on peut
   le relancer sans rien casser.

3. Dans les variables Railway :
   - **d'abord** créer `MIGRATE_DATABASE_URL` avec l'URL `postgres` actuelle ;
   - **ensuite seulement** remplacer `DATABASE_URL` par la même URL avec
     `sid_app` et le mot de passe engendré.

   Cet ordre compte : intervertir les deux ferait démarrer un conteneur qui
   tente de migrer avec un rôle sans droits.

4. Redéployer, puis vérifier :

   ```
   node --env-file=.env --import tsx scripts/verifier-role-applicatif.ts
   ```

5. Si quelque chose cloche, le retour en arrière est immédiat : remettre
   l'ancienne valeur de `DATABASE_URL`. Aucune donnée n'est touchée par ce lot,
   aucune migration n'y est liée.

## Ce que ce lot ne fait PAS

Il ne pose **aucune** politique de sécurité par ligne — il n'y en a toujours
zéro. Il rend seulement possible d'en écrire qui s'appliquent réellement. Les
politiques viendront avec le lot 19, en même temps que les modèles `Departement`
et `Region`.

## Le filet

`tests/role-base.test.ts` échoue si l'application se reconnecte un jour en
superutilisateur, avec `BYPASSRLS`, ou en propriétaire des tables. Vérifié :
lancé contre la connexion d'administration, quatre de ses cinq contrôles
tombent.

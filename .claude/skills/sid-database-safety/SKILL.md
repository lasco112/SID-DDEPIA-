---
name: sid-database-safety
description: Sécurité de la base du SID DDEPIA — Prisma + PostgreSQL sur Railway, migrations appliquées automatiquement au déploiement, distinction base locale / production / démonstration, suppressions en cascade. À charger avant toute modification de prisma/schema.prisma, toute migration, toute suppression de données, ou tout diagnostic portant sur des données de production.
---

# Sécurité de la base — SID DDEPIA

Socle réel : **Prisma 5 + PostgreSQL hébergé sur Railway**. Ce projet n'utilise
ni Supabase, ni ORM secondaire.

## Trois bases distinctes

| Rôle | URL | Usage |
|---|---|---|
| Locale | `localhost:5432/sid_menoua` (`.env`) | Développement et tests |
| Production | `postgis.railway.internal` | Les vraies données des six arrondissements |
| Démonstration | `DEMO_DATABASE_URL` | Comptes `demo.*`, jamais mélangée aux deux autres |

**Un test local ne prouve rien sur la production.** Quand l'utilisateur
rapporte un problème vécu par un collègue, ce problème est en production. Le
dire clairement plutôt que de présenter une vérification locale comme une
preuve.

## Migrations

En local :

```bash
npx prisma migrate dev --name <nom_explicite>
```

En production, elles s'appliquent **automatiquement au démarrage du
conteneur** : `"start": "prisma migrate deploy && next start"`. Conséquence
directe : **une migration poussée est appliquée au déploiement suivant, sans
validation manuelle.** Elle doit donc être :

- **non destructive** — pas de `DROP COLUMN` ni de `DROP TABLE` sur des
  données réelles sans que l'utilisateur l'ait explicitement décidé ;
- **additive de préférence** — nouvelle colonne nullable, avec reprise des
  données existantes dans la même migration si besoin (voir le backfill de
  `arrondissementId` dans `20260731090000_archivage_rapports_en_base`) ;
- **compatible avec l'ancien code** — pendant quelques secondes, l'ancienne
  version de l'application tourne encore contre le nouveau schéma.

Une migration qui échoue au démarrage **empêche l'application de démarrer**.
Vérifier le SQL généré avant de pousser.

## Suppressions

Les saisies et corrections référencent les rapports, établissements et
utilisateurs. Supprimer une entité sans traiter ses dépendances produit une
erreur de contrainte — ou, pire, un refus silencieux côté interface.

Retour d'expérience : un garde-fou refusant la suppression « si des données
sont liées » bloquait exactement le cas que l'utilisateur voulait traiter
(supprimer les établissements de démonstration, qui ont des saisies). La
bonne réponse était la **suppression en cascade explicite** des corrections
puis des saisies, pas le refus.

Avant toute suppression : compter ce qui va disparaître, l'annoncer, et le
tracer dans `AuditLog`.

## Écrire dans la base plutôt que sur disque

Le conteneur Railway est recréé à chaque déploiement : `process.cwd()/storage/`
est vidé. Aucun volume persistant n'est configuré dans le dépôt. Tout document
à conserver va en base (`Bytes`), comme `ExportDocument.contenu`.

## Tester sans casser

Pour vérifier une fonction, forger un jeton de session plutôt que de saisir un
mot de passe :

```js
import { encode } from "next-auth/jwt";
const jwt = await encode({
  token: { sub: user.id, role: user.role, username: user.username,
           arrondissementId: user.arrondissementId, sectionId: user.sectionId,
           mustChangePassword: false, isDemo: false },
  secret: process.env.NEXTAUTH_SECRET,
});
// puis : fetch(url, { headers: { cookie: `next-auth.session-token=${jwt}` } })
```

Exécuter le script depuis la racine du projet (les modules se résolvent depuis
`node_modules`), avec `node --env-file=.env <script>.mjs`.

**Toujours remettre en état** : restaurer les valeurs modifiées, supprimer les
lignes `Correction`, `AuditLog` et `ExportDocument` créées par le test. La base
locale sert aussi aux démonstrations.

## Sauvegarde

`/technique/sauvegarde` (ADMIN_TECH) permet un export de la base. Avant toute
opération risquée en production — migration destructive, purge, réinitialisation
de comptes — proposer une sauvegarde et **attendre l'accord de l'utilisateur**.

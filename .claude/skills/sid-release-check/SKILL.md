---
name: sid-release-check
description: Contrôle avant livraison du SID DDEPIA — vérifications à passer avant de proposer un déploiement sur GitHub et Railway, et rappel de la règle d'autorisation. À charger quand le travail est terminé et prêt à être livré, ou quand l'utilisateur demande de pousser sur GitHub ou Railway.
---

# Contrôle avant livraison — SID DDEPIA

## Règle qui prime sur tout

**Ne rien pousser sur GitHub ou Railway sans un ordre explicite de
l'utilisateur.** Le travail peut être fini, testé et vert : on présente le
résultat et on attend. Une autorisation donnée pour une livraison ne vaut pas
pour la suivante.

Pousser déclenche un redéploiement Railway, qui applique les migrations en
attente et redémarre l'application pour les six arrondissements.

## Séquence

**1. Types et build** — préalable, pas une preuve.

```bash
npx tsc --noEmit
npx next build
```

Vérifier au passage que les nouvelles routes apparaissent bien dans la liste
produite par le build.

**2. Exercer réellement chaque fonction touchée.** Lire le code ne suffit pas.
Pour chaque fonction : l'appeler avec le rôle concerné, et constater le
résultat **en base**, pas seulement le code HTTP.

**3. Tester les refus autant que les succès.** Pour toute route touchant aux
permissions :

- le rôle autorisé passe ;
- un rôle non autorisé reçoit 403 ;
- un DA ne voit pas les données d'un autre arrondissement ;
- sans session, 401 ;
- un champ obligatoire vide (motif de correction, par exemple) reçoit 400.

Un contrôle d'accès qui laisse passer est un bug silencieux : il ne se
manifeste que le jour où quelqu'un lit ce qu'il ne devait pas.

**4. Vérifier l'absence de régression** sur les rôles voisins. Élargir un droit
au DD ne doit rien changer pour les chefs de section : le vérifier
explicitement.

**5. Migrations.** Si `prisma/migrations/` a changé : relire le SQL, confirmer
qu'il est non destructif, et vérifier qu'il s'applique sur une base contenant
déjà des données.

**6. Cache hors ligne.** Si un actif statique ou une page a changé,
`CACHE_NAME` a-t-il été incrémenté dans `public/sw.js` **et**
`src/lib/offlineStore.ts` ? Sinon les appareils garderont l'ancienne version.

**7. Remettre en état les données de test.** Valeurs restaurées, lignes
`Correction`, `AuditLog` et `ExportDocument` de test supprimées, scripts
temporaires effacés du dépôt.

**8. Ne pas arrêter le serveur de développement.** L'utilisateur s'en sert
lui-même sur le port 3000.

## Ce qu'on présente à l'utilisateur

- ce qui a changé, en français, en termes métier ;
- **ce qui a été réellement vérifié et comment**, avec les résultats ;
- ce qui n'a pas pu l'être, et pourquoi ;
- les conséquences opérationnelles pour les collègues (faut-il regénérer un
  rapport ? réinstaller ? attendre ?) ;
- puis la demande d'autorisation de pousser.

Ne jamais présenter comme vérifié ce qui ne l'a pas été. Si un test a échoué,
le dire avec sa sortie.

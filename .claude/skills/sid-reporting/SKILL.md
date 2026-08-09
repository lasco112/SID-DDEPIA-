---
name: sid-reporting
description: Génération et archivage des rapports mensuels du SID DDEPIA (.docx via docxtemplater) — agrégation des six arrondissements, mise en page du canevas, conditions de génération, conservation en base. À charger avant de modifier la génération d'un rapport, l'agrégation des données, un modèle .docx, la mise en page d'un tableau, ou l'export/archivage d'un document.
---

# Rapports mensuels du SID DDEPIA

## Chaîne de production

```
Saisie DA  →  Synchronisation  →  Contrôle des chefs de section
           →  Validation       →  Consolidation  →  Rapport départemental
```

Trois documents distincts :

| Type | Modèle | Qui |
|---|---|---|
| `RAPPORT_DA_DOCX` | `templates/rapport_mensuel_DA.docx` | Le DA, une fois **son** rapport soumis |
| `RAPPORT_DD_DOCX` | `templates/rapport_mensuel_DD.docx` | Le DD, si le circuit est complet |
| `RAPPORT_EXACT_DOCX` | `templates/rapport_mensuel_exact.docx` | Le DD — fiche de collecte, calquée sur le canevas papier |

`templates/_reference_CANEVAS_STAT_MENOUA_officiel.docx` est la **référence
administrative**, pas un modèle à rendre : ne pas y toucher.

## Conditions de génération

- **Rapport DA** : refusé tant que `RapportArrondissement.statut` n'est pas
  `SOUMIS` ou `CLOTURE` (409). Le taux de remplissage n'entre pas en compte —
  un rapport soumis à 6 % se génère, et sortira presque vide. C'est le rôle de
  la Supervision d'afficher ce taux pour repérer le cas.
- **Rapport DD** : `verifierCompletudeDD` bloque tant que les six
  arrondissements n'ont pas soumis **et** que toutes les sections (hors BAC)
  n'ont pas validé.

## Moteur

`src/server/export/rapport-docx.ts`. Points structurants :

- Toutes les fonctions reçoivent le client Prisma **en premier paramètre**
  (`db`, production ou démo). Ne jamais importer `db` directement dans ce
  module : cela casserait le mode démonstration.
- Sur une période mensuelle, l'agrégation inter-arrondissements est **toujours
  une somme**. La distinction STOCK/SOMME/MOYENNE de
  `src/lib/aggregationRules.ts` ne joue que sur les périodes multi-mois.
- Codes d'arrondissement figés : `DSC, FOK, FGT, NKN, PKM, STC`. Le canevas
  attend les noms en majuscules sans accent (`FOKOUE`, `FONGO TONGO`).
- Une valeur nulle se rend `—`, jamais `0` : la confusion entre « zéro
  déclaré » et « non renseigné » est une faute métier.

## Balises attendues par les modèles

La mise en page de chaque tableau est décrite dans
`prisma/seed-lib/canevasLayout.ts` et dicte la forme du payload :

- **MATRICE** : `{code}_{ARR}`, `{code}_TOTAL`, `{code}_TOTAL_PREC` pour le
  rapport DD ; `{code}` et `{code}_PREC` pour le rapport DA.
- **NOMINATIF_LOOP / EVENEMENT_LOOP** : un tableau JSON nommé d'après le code
  du tableau, une entrée par établissement ou par événement, avec `ARR` ajouté
  côté DD.

Ajouter une colonne à un tableau demande donc **trois** modifications
cohérentes : le référentiel ou `canevasLayout.ts`, le payload, et le modèle
`.docx`. Une balise absente du modèle est ignorée sans erreur — c'est ainsi
qu'on croit avoir ajouté une colonne qui n'apparaît nulle part.

## Archivage : en base, jamais sur disque

Le disque du conteneur Railway est effacé à chaque déploiement. Un rapport
généré est conservé dans `ExportDocument` :

- `contenu` (`Bytes`) — le fichier lui-même ;
- `arrondissementId` — renseigné pour un rapport DA, `null` pour un document
  départemental ;
- `version` — comptée **par arrondissement** (Santchou v1, v2… indépendamment
  de Dschang) ;
- `hashSha256` — intégrité.

Relecture : `/api/reports/archives/[id]` (`?apercu=1` pour un affichage dans le
navigateur), `/api/reports/archives/lot-da` pour les six en ZIP. Le DD lit
tout ; un DA ne lit que son arrondissement. Un document sans `contenu` est
antérieur à l'archivage : répondre **410** avec un message clair, jamais un
fichier vide.

Pour le ZIP groupé : repérer d'abord les identifiants des dernières versions
**sans** charger `contenu`, puis ne lire que ceux-là. Charger toutes les
versions ferait entrer plusieurs dizaines de mégaoctets en mémoire pour n'en
garder que six.

## Reste à corriger

`/api/exports/drepia/route.ts` écrit encore sur le disque du conteneur : même
bug d'éphémérité que celui corrigé pour les rapports.

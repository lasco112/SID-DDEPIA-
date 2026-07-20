# SID DDEPIA-Menoua — Architecture technique et périmètre du MVP

Version 1.0 — 08 juillet 2026 — Document de cadrage technique (première itération)

---

## 1. Périmètre du MVP validé : "un cycle mensuel complet, du 1er au rapport du mois suivant"

Le MVP est jugé réussi si, sur **un mois réel de données** (mois M), le système permet :

1. La saisie offline par les 6 DA des tableaux des **Sections 1 et 2 du canevas** (13 tableaux : 1.1 à 1.7 et 2.1 à 2.6), incluant les tableaux nominatifs (couvoirs, fermes ponte/chair, provenderies) via le registre des établissements.
2. La synchronisation, la soumission au 28, le verrouillage automatique.
3. Le contrôle par les chefs PSA et SPAIH (vue croisée 6 arrondissements, correction tracée, analyse rédigée) au 29.
4. La validation DD au 02 du mois M+1.
5. La génération de **trois documents** :
   - Rapport mensuel d'arrondissement (.docx) par chaque DA ;
   - Rapport mensuel départemental (.docx) par le DD, avec lignes "Total mois courant / Total mois précédent" conformes au canevas ;
   - **Export DREPIA (.xlsx normalisé)** : un classeur structuré, un onglet par section, codes stables en colonnes, prêt à être transmis à la Délégation Régionale de l'Ouest.
6. La reproduction du cycle au mois M+1 avec calcul automatique du "mois précédent" à partir des données de M (critère explicite : *produire le rapport du mois prochain sans ressaisie*).

Hors périmètre MVP (phases suivantes) : Section 3-5 du canevas, périodicités trimestrielle/semestrielle/annuelle, PPT, SIG interactif, IA, SMS/WhatsApp réels (le cron loggue les alertes), format docx régional DREPIA.

### Pré-requis bloquant avant développement (à produire par le DD)
Le **dictionnaire de données des Sections 1 et 2** : pour chacun des 13 tableaux, la liste des codes stables (FormField), unités, type de valeur, et la règle d'agrégation (SOMME pour les flux : abattages, production ; DERNIERE_VALEUR pour les stocks : effectifs cheptel). Sans ce dictionnaire validé, tout code de formulaire est provisoire.

---

## 2. Stack retenue

| Brique | Choix | Justification |
|---|---|---|
| Front + Back | Next.js 14+ (App Router, TypeScript) | Une seule base de code, API Routes, PWA via `next-pwa`/Serwist |
| Offline | IndexedDB via **Dexie.js** | File d'attente de sync, requêtes indexées, plus robuste que l'API brute |
| Auth | NextAuth.js (Credentials) + **JWT longue durée (30 j)** | Session utilisable offline ; pas d'inscription libre |
| BDD | PostgreSQL 16 + **PostGIS** | SIG natif (§10.3 du CDC) |
| ORM | Prisma | Schéma fourni |
| Word | docxtemplater + pizzip | Injection dans les templates officiels DDEPIA |
| Excel (DREPIA) | exceljs | Export normalisé multi-onglets |
| PPT | pptxgenjs | Phase 3 |
| Cron | node-cron (process séparé ou instrumentation Next) | Alertes 27/28/29/02 |
| Cartographie | Leaflet + export GeoJSON | Phase 4 |

---

## 3. Arborescence du projet

```
sid-menoua/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts                      # référentiels, arrondissements, sections,
│   │                                #   FormTemplates/FormFields Sections 1-2
│   └── migrations/
├── public/
│   ├── manifest.json                # PWA installable Windows 10
│   └── icons/
├── templates/                       # templates docx/pptx OFFICIELS (jamais servis au client)
│   ├── rapport_mensuel_DA.docx
│   ├── rapport_mensuel_DD.docx
│   └── export_drepia_mapping.json   # correspondance codes → cellules régionales
├── src/
│   ├── app/
│   │   ├── (auth)/login/page.tsx
│   │   ├── (da)/                    # espace Délégué d'Arrondissement
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── saisie/[templateCode]/page.tsx
│   │   │   └── rapport/page.tsx     # bouton "Générer rapport DA"
│   │   ├── (section)/               # espace Chefs de sections
│   │   │   ├── controle/page.tsx    # vue croisée 6 arrondissements
│   │   │   └── analyse/page.tsx     # éditeur de synthèse (+ brouillon IA en phase 4)
│   │   ├── (dd)/                    # espace Délégué Départemental
│   │   │   ├── supervision/page.tsx
│   │   │   ├── validation/page.tsx
│   │   │   └── exports/page.tsx     # monopole génération départementale + DREPIA
│   │   ├── (admin)/
│   │   │   ├── utilisateurs/page.tsx
│   │   │   ├── referentiels/page.tsx
│   │   │   ├── etablissements/page.tsx
│   │   │   └── periodes/page.tsx    # ouverture, déverrouillage exceptionnel
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── sync/route.ts        # réception idempotente des saisies offline
│   │       ├── corrections/route.ts
│   │       ├── reports/generate/route.ts
│   │       └── exports/drepia/route.ts
│   ├── components/
│   │   ├── SyncButton.tsx
│   │   ├── OnlineIndicator.tsx      # en ligne / hors ligne / sync en attente (§4.2)
│   │   ├── FormMatrice.tsx          # rendu générique des tableaux MATRICE
│   │   ├── FormNominatif.tsx        # tableaux par établissement
│   │   └── TableCroiseeSection.tsx
│   ├── lib/
│   │   ├── db.ts                    # client Prisma
│   │   ├── dexie.ts                 # schéma IndexedDB local
│   │   ├── permissions.ts           # contrôle des droits CÔTÉ SERVEUR (§14.2)
│   │   └── periodes.ts              # calcul mois précédent / N-1
│   └── server/
│       ├── aggregation/
│       │   └── engine.ts            # moteur SOMME / DERNIERE_VALEUR / écarts
│       ├── export/
│       │   ├── docx.ts
│       │   └── drepia-xlsx.ts
│       ├── cron/
│       │   └── alerts.ts
│       └── notifications/
│           └── dispatcher.ts        # IN_APP + log en MVP ; SMS/WhatsApp branchés en phase 3
├── .env.example
└── package.json
```

---

## 4. Export DREPIA — décision d'architecture

**MVP : Excel normalisé (`EXPORT_DREPIA_XLSX`).** Le canevas régional DREPIA-O comporte 147 tableaux : reproduire son format docx exact est un chantier de mapping aussi lourd que le rapport départemental lui-même. Un classeur Excel normalisé (un onglet par section, une ligne par indicateur avec code stable, colonnes = arrondissements + total départemental + rappel N-1) donne immédiatement à la DREPIA une donnée exploitable et **réduit son propre travail de compilation** — argument politique fort pour la réplication du système dans les 7 autres départements de l'Ouest.

**Phase ultérieure : `EXPORT_DREPIA_DOCX`** au format exact du canevas régional, une fois le `MappingRapport` départemental stabilisé (la table de mapping prévoit déjà `documentCible = "EXPORT_DREPIA"`).

---

## 5. Règles de gestion critiques implémentées dans le schéma

1. **Codes stables** : toute valeur saisie référence `FormField.code`, jamais un libellé. Les écarts N-1 et les totaux sont calculés par jointure sur codes — insensible aux renommages.
2. **0 ≠ non renseigné** : `nonRenseigne + motifNonRenseigne`. La génération départementale peut être bloquée ou annotée "donnée incomplète" (§8.3 du CDC).
3. **Verrouillage à la soumission, pas à la synchronisation** : après `SOUMIS`, le DA perd l'écriture ; seules les corrections tracées des chefs de section sont possibles. Élimine l'essentiel des conflits de sync.
4. **Déverrouillage exceptionnel** post-28 par le DD, motivé et audité (scénario DA hors réseau prolongé).
5. **Stocks vs flux** : les effectifs de cheptel s'agrègent en `DERNIERE_VALEUR` sur les périodes longues (l'effectif annuel n'est pas la somme des 12 mois) ; abattages, productions, recettes s'agrègent en `SOMME`. La confusion des deux est l'erreur d'agrégation la plus fréquente des compilations manuelles.
6. **Idempotence de la synchronisation** : chaque saisie offline porte un `clientId` unique généré localement ; un renvoi après coupure réseau ne crée jamais de doublon.

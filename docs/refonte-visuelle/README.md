# Refonte visuelle « Indigo des Hautes Terres »

Directive : `INSTRUCTIONS_CLAUDE_CODE_REFONTE_VISUELLE_SID.md` (15 octobre 2026).
Référence graphique : `design_handoff_sid_menoua_v2` (prototype non copié en production).
Principe : **habiller le SID, pas le remplacer**. Aucune logique métier, route,
API, permission, donnée ou migration n'est touchée.

## 1. Audit (faits observés)

| Élément | Constat |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript, PWA (service worker écrit à la main) |
| Styles | Tailwind CSS ; charte centralisée dans `tailwind.config.js` + variables de `src/app/globals.css` |
| Police | Manrope déjà en place (`next/font`, copiée dans l'application à la construction) |
| Icônes | lucide-react |
| Écrans | 42 pages (`src/app/**/page.tsx`), 78 composants |
| Composants communs | Pas de bouton / carte / badge partagés : chaque écran écrit ses classes Tailwind |
| Couleurs | 579 usages des jetons de la charte ; **1 512 usages de gammes Tailwind brutes** (gray 919, amber 198, red 185, green 125, blue 73) dans 87 fichiers ; 116 couleurs hex dans 12 fichiers (dont 3 fichiers serveur qui produisent des documents, hors périmètre) |
| Tests | 272 tests (node:test + tsx) contre la base locale |

**Conséquence sur la méthode** : la charte étant centralisée, la refonte se fait
d'abord en changeant les **valeurs** des jetons (noms inchangés) et en
redéfinissant les gammes `gray`, `blue`, `green`, `amber`, `red` dans des
teintes accordées. Chaque gamme garde son sens (neutre, information,
conforme, à corriger, erreur) et sa logique clair = fond / sombre = texte. Les
écrans changent d'apparence sans qu'une ligne de leur logique soit réécrite.

## 2. Inventaire des photos et médias — certifié inchangé

| Fichier | Où il s'affiche | Avant | Après |
|---|---|---|---|
| `public/fonds/region.webp` (troupeau) | Connexion ; démonstration et déconnexion (fond) ; départements sans photo | ✔ | ✔ même fichier, même rôle — connexion : colonne de gauche au lieu du plein écran |
| `public/fonds/MEN-musee.webp`, `MEN-falaise.webp` | Menoua : écran de passage, démonstration (en alternance par jour) | ✔ | ✔ inchangés |
| `public/fonds/BAM.webp` | Bamboutos | ✔ | ✔ |
| `public/fonds/HNK.webp` | Haut-Nkam (crédit CC BY-SA) | ✔ | ✔ |
| `public/fonds/HPL.webp` | Hauts-Plateaux (crédit) | ✔ | ✔ |
| `public/fonds/KKH.webp` | Koung-Khi | ✔ | ✔ |
| `public/fonds/MIF.webp` | Mifi | ✔ | ✔ |
| `public/fonds/NDE.webp` | Ndé (crédit CC BY-SA) | ✔ | ✔ |
| `public/fonds/NOU.webp` | Noun (crédit CC BY-SA) | ✔ | ✔ |
| `public/icon-192.png`, `icon-512.png` | Logo : bandeau, connexion, écran de passage, icône du téléphone | ✔ | ✔ inchangés |
| Animation d'ouverture (`SplashScreen.tsx`, SVG fourni par le DD) | Démarrage | ✔ | ✔ **non retouchée** (œuvre fournie par le DD) |

Légendes et crédits : inchangés (`src/lib/fondsDepartement.ts`). Le test
`tests/fonds-departement.test.ts` vérifie que chaque photo nommée existe.

## 3. Plan par lots

| Lot | Contenu | État |
|---|---|---|
| 1 | Thème : jetons de couleur, gammes accordées, rayons, ombres, Cormorant Garamond (titres), focus visible, chiffres tabulaires dans les tableaux, couleur du téléphone | ✔ fait |
| 2 | Coque : menu latéral bleu nuit (repère or sur l'entrée active), bandeau indigo, frise ndop fine | ✔ fait |
| 3 | Connexion : photo à gauche / panneau ivoire à droite, bandeau photo sur téléphone, frise ndop, libellés reliés aux champs | ✔ fait |
| 4 | Tableaux de bord DD / DA / chefs : titres d'accueil, cartes, chiffres | à faire |
| 5 | Saisie mensuelle, nominative, événements : en-têtes de tableau, alternance des lignes, focus, densité conservée | à faire |
| 6 | Validation, observations, supervision : badges de statut avec pictogramme | à faire |
| 7 | Rapports, statistiques, autres rapports | à faire |
| 8 | Administration, démonstration, harmonisation responsive, contrôle final | à faire |

## 4. Conflits signalés (aucun résolu par invention)

1. **Nom du système** : la directive dit « SID DDEPIA Menoua » ; le Délégué l'a
   renommé « SID EPIA-O » le 14 octobre 2026 et le SID sert désormais les huit
   départements de l'Ouest. Le nom en place est conservé ; aucun texte
   « Menoua » n'est écrit en dur (le département vient de la base).
2. **Ordre du menu** du prototype (Tableau de bord, Saisie, Validation…) : le
   menu réel est rangé par rapport (décision du DD, 27 sept. 2026). Conservé.
3. **En-tête blanc** du prototype : le bandeau reste coloré (indigo), car ses
   composants (période, cloche, en ligne, recherche) sont dessinés pour un fond
   sombre ; les rendre blancs aurait touché six composants. À revoir au lot 8
   si souhaité.
4. **Fonctions du prototype absentes du SID** (enregistrement automatique « à
   10:42 », « Dernière synchronisation » dans le menu, total automatique de
   rubrique, barre « X renseignés · Y restants ») : **non ajoutées**.
5. **Monogramme « SID »** du prototype : remplacé par le logo existant (média
   à conserver).

## 5. Non-régression — lots 1 à 3

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit` | aucune erreur |
| Suite de tests (272) | 272 réussis, 0 échec |
| Connexion réelle (compte d'essai local) puis tableau de bord | ✔ |
| Déconnexion en français | ✔ |
| Menu : mêmes entrées, même visibilité par rôle (DA vérifié) | ✔ |
| Saisie 1.1 : valeurs, cases N/O, statuts « Synchronisée » affichés | ✔ |
| Téléphone 375 px : pas de défilement horizontal sur la connexion | ✔ |
| `npm run build` | non lancé en local (fichier Prisma verrouillé par le serveur de développement) ; le serveur le lance à la mise à jour |

Captures : `avant/` et `apres/`.

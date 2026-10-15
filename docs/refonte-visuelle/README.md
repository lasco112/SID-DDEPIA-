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
| 4 | Tableau de bord (page unique pour tous les rôles) : carte d'accueil (fonction en surtitre cuivre, salut en Cormorant, photo du département à droite — un média existant du même territoire), cartes de rapport, liens d'administration ; bandeau : fin du chevauchement « Période » / « En ligne » | ✔ fait |
| 5 | Saisie mensuelle, nominative, événements : en-têtes ivoire, lignes alternées, valeurs à droite en chiffres tabulaires, motif « N/D » signalé en cuivre tant qu'il est vide ; densité et comportement inchangés | ✔ fait |
| 6 | Validation, observations, supervision : harmonisées par le thème (vérifié sur la supervision DD) ; badges à pictogramme du prototype non ajoutés (voir conflits) | ✔ thème |
| 7 | Rapports, statistiques : en-têtes et lignes alternées communs à tous les tableaux (`globals.css`, priorité nulle) | ✔ thème |
| 8 | Administration et démonstration : thème vérifié ; **boutons du menu réparés** (voir §6) ; contrôle de chaque lien du menu, pour chaque rôle, en réel et en démonstration | ✔ fait |

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
6. **Saisie sur téléphone en cartes empilées** (prototype) : non faite — ce
   serait réorganiser l'écran de saisie, auquel le personnel est habitué
   (consigne du DD : même organisation). Le tableau défile sur le côté, comme avant.
7. **Pastille « – » à la place du champ vide « non renseigné »** : non faite,
   le traitement du non-renseigné reste celui du SID.

## 5. Non-régression — lots 1 à 7

| Contrôle | Résultat |
|---|---|
| `npx tsc --noEmit` | aucune erreur |
| Suite de tests (272) | 272 réussis, 0 échec |
| Connexion réelle (compte d'essai local) puis tableau de bord | ✔ |
| Déconnexion en français | ✔ |
| Menu : mêmes entrées, même visibilité par rôle (DA vérifié) | ✔ |
| Saisie 1.1 : valeurs identiques (591, 2 375…), cases N/D, statuts « Synchronisée » | ✔ |
| Supervision DD (démo Menoua) : boutons, états des arrondissements et sections | ✔ |
| Gestionnaires d'événements des champs (saisie, N/D, motif) | inchangés (seules les classes CSS ont bougé) ; non cliqués pour ne pas modifier les données |
| Téléphone 375 px : pas de défilement horizontal sur la connexion | ✔ |
| `npm run build` | non lancé en local (fichier Prisma verrouillé par le serveur de développement) ; le serveur le lance à la mise à jour |

Captures : `avant/` et `apres/`.

## 6. Boutons du menu qui ne fonctionnaient pas (signalés par le DD, 15 octobre 2026)

Contrôle : chaque lien du menu de chaque rôle ouvert avec un compte d'essai
local — 54 liens pour 5 comptes réels, 80 liens pour 8 comptes de démonstration.

| Défaut | Cause | Réparation |
|---|---|---|
| DD, réel : « Tableaux administratifs du BAC » renvoyait à l'accueil | la règle d'accès générale `/section` ne laissait passer que les chefs, alors que la page accepte le DD | règle `/section/bac` (CHEF_BAC + DD) avant la règle générale |
| Démonstration : « Comptes utilisateurs », « Journal d'activité », « Questions des utilisateurs » renvoyaient sans un mot à l'accueil | écrans jamais ajoutés à la liste des écrans ouverts en démonstration | ouverts (leurs routes ne lisent que la base de la session, vérifié) |
| Démonstration : réinitialiser un mot de passe, désactiver un compte | aurait cassé la démonstration pour toute la salle de formation | restent refusés, mais avec un message clair au lieu d'un bouton muet |
| « Désactiver / Réactiver » et « Révoquer la session » ne disaient rien en cas d'échec | pas de branche d'erreur | le message du serveur s'affiche |

Résultat après réparation : **0 lien qui ne s'ouvre pas**, en réel comme en
démonstration. Garde-fou permanent : `tests/menu-acces.test.ts` compare le menu
aux règles d'accès pour chaque rôle (275 tests réussis).
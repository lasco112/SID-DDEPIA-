/**
 * middleware.ts — Première barrière de contrôle d'accès par rôle (CDC §14.2)
 * ---------------------------------------------------------------------------
 * Défense en profondeur : bloque ici même une tentative d'URL directe ou
 * d'appel API depuis un rôle non autorisé, AVANT que le handler ne s'exécute.
 * Chaque route sensible refait aussi son propre contrôle fin via
 * lib/permissions.ts (arrondissement/section propriétaire) — le middleware
 * ne connaît que le rôle, pas le périmètre exact.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const CHEF_ROLES = ["CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"];

export const PROTECTED_PREFIXES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/da", roles: ["DA", "AGENT_SAISIE"] }, // l'agent de saisie partage l'écran de saisie de son DA, mais jamais la soumission
  { prefix: "/dd", roles: ["DD"] },
  // Les tableaux du BAC : le DD y a son entrée de menu « Tableaux
  // administratifs du BAC », et la page l'accepte (allowedRoles CHEF_BAC + DD),
  // mais la règle générale ci-dessous le renvoyait à l'accueil (constaté le
  // 15 octobre 2026 en ouvrant chaque lien du menu). AVANT la règle générale.
  { prefix: "/section/bac", roles: ["CHEF_BAC", "DD"] },
  { prefix: "/section", roles: CHEF_ROLES },
  { prefix: "/admin", roles: ["DD"] }, // ADMIN_TECH n'a aucun droit métier (CDC §A.2) : pas de gestion des comptes
  // Administration du système : un DD, et la marque d'administrateur vérifiée
  // en base dans chaque page et chaque route (décision du 14 octobre 2026).
  { prefix: "/admin-systeme", roles: ["DD"] },
  { prefix: "/api/admin-systeme", roles: ["DD"] },
  { prefix: "/etablissements", roles: ["DA", "DD", "AGENT_SAISIE"] }, // registre des établissements NOMINATIF (§B.5.3) : DA et agent de saisie sur leur arrondissement, DD sur tous
  // Règle spécifique AVANT la règle générale "/technique" (Array.find prend la
  // première correspondance) : la boîte de réception de l'aide est partagée
  // DD + ADMIN_TECH, alors que le reste de l'espace technique reste réservé
  // à l'ADMIN_TECH seul (§A.2).
  { prefix: "/technique/aide", roles: ["DD", "ADMIN_TECH"] },
  { prefix: "/technique/audit", roles: ["DD", "ADMIN_TECH"] }, // journal d'activité partagé : le DD doit voir qui fait quoi
  { prefix: "/technique", roles: ["ADMIN_TECH"] }, // espace de maintenance technique — strictement séparé du métier (§A.2)
  { prefix: "/api/admin", roles: ["DD"] },
  { prefix: "/api/dd", roles: ["DD"] },
  { prefix: "/api/etablissements", roles: ["DA", "DD", "AGENT_SAISIE"] }, // AGENT_SAISIE : creation inline pendant la saisie NOMINATIF uniquement (voir route)
  // Rédaction des zones de texte du rapport trimestriel. Le DD écrit celles du
  // département, le DA les siennes ; le cloisonnement est REFAIT dans la route,
  // le middleware ne connaissant que le rôle. L'agent de saisie en est exclu :
  // il ne signe aucun rapport.
  // Depuis le 24 septembre 2026 : l'agent rédige pour son arrondissement, le
  // chef de section pour son domaine ; le DA et le DD relisent et corrigent.
  { prefix: "/api/trimestre/rubriques", roles: ["DD", "DA", "AGENT_SAISIE", ...CHEF_ROLES] },
  // Saisie trimestrielle (décision D9) : les droits fins — son arrondissement
  // pour un DA ou un agent, les tableaux du BAC pour le chef BAC, ceux de sa
  // section pour un chef technique (13 octobre 2026 : il complète ce qui
  // manque) — sont vérifiés case par case dans la route.
  { prefix: "/api/trimestre/saisie", roles: ["DD", "DA", "AGENT_SAISIE", ...CHEF_ROLES] },
  // Analyses du trimestre : l'agent valide pour son arrondissement, le chef de
  // section pour son domaine ; le DA et le DD relisent. Le ressort de chacun
  // est vérifié dans la route. AVANT la règle générale "/trimestre".
  { prefix: "/api/trimestre/analyses", roles: ["DD", "DA", "AGENT_SAISIE", ...CHEF_ROLES] },
  { prefix: "/trimestre/analyses", roles: ["DD", "DA", "AGENT_SAISIE", ...CHEF_ROLES] },
  { prefix: "/trimestre/textes", roles: ["DD", "DA", "AGENT_SAISIE", ...CHEF_ROLES] },
  // Circuit du trimestre : chacun y franchit SON étape ; les droits fins sont dans la route.
  { prefix: "/api/trimestre/circuit", roles: ["DD", "DA", "AGENT_SAISIE", ...CHEF_ROLES] },
  { prefix: "/trimestre/circuit", roles: ["DD", "DA", "AGENT_SAISIE", ...CHEF_ROLES] },
  { prefix: "/trimestre", roles: ["DD", "DA", "AGENT_SAISIE", ...CHEF_ROLES] },
  { prefix: "/api/technique/audit", roles: ["DD", "ADMIN_TECH"] }, // AVANT la règle générale : Array.find prend la première correspondance
  { prefix: "/api/technique", roles: ["ADMIN_TECH"] },
  { prefix: "/api/sync", roles: ["DA", "AGENT_SAISIE"] },
  { prefix: "/api/rapports/submit", roles: ["DA"] }, // soumission réservée au DA — jamais l'agent, quelle que soit la mise en page ou l'ordre des règles
  { prefix: "/api/corrections", roles: [...CHEF_ROLES, "DD"] }, // le DD corrige lui-même avant consolidation (§4) ; la trace est identique
  { prefix: "/api/validations", roles: CHEF_ROLES },
  // Règle spécifique AVANT la règle générale (Array.find prend la première
  // correspondance) : la VALIDATION d'une synthèse appartient au DD, alors que
  // sa RÉDACTION appartient au chef de section. Sans cette ligne, le DD était
  // renvoyé en 403 par la règle "/api/syntheses" ci-dessous — donc aucune
  // synthèse ne pouvait être validée, et comme rapport-docx.ts n'insère le
  // texte que si valideDD est vrai, les quatre rubriques ANALYSE_* de TOUS les
  // rapports mensuels portaient « Synthèse non disponible. ».
  { prefix: "/api/syntheses/valider", roles: ["DD"] },
  { prefix: "/api/syntheses", roles: CHEF_ROLES },
  { prefix: "/api/exports/drepia", roles: ["DD"] },
  { prefix: "/api/reports/generate", roles: ["DD", "DA"] },
  { prefix: "/api/reports/archives", roles: ["DD", "DA", "AGENT_SAISIE"] }, // relecture d'un rapport déjà transmis ; le cloisonnement par arrondissement est refait dans la route

  { prefix: "/api/reports/thematique", roles: ["DD"] },
  { prefix: "/api/periodes/deverrouiller", roles: ["DD"] },
];

// Correction n°10 (mode Démo), Phase 1 : seules ces routes ont été vérifiées comme
// interrogeant réellement la base de démonstration (voir user.db / dbForSession dans
// lib/permissions.ts). Tant qu'une route n'est pas dans cette liste, une session démo
// ne doit JAMAIS l'atteindre — sinon elle verrait les données réelles de production,
// ce que le cahier des charges interdit explicitement. Étendre cette liste à mesure que
// d'autres routes sont migrées (Phase 2 : vue croisée, supervision DD, génération de
// rapports...), jamais avant de l'avoir fait.
export const CHEMINS_SURS_DEMO = [
  "/dashboard",
  "/da/saisie",
  "/dd/supervision",
  "/section/controle",
  "/section/analyse",
  "/api/auth",
  "/deconnexion", // la déconnexion en français : aucune donnée, seulement signOut()
  "/api/periodes/active",
  "/api/form-templates",
  "/api/rapports", // couvre aussi /rejeter, /mon-rapport, /mes-saisies, /submit
  "/api/reports/generate",
  "/api/sync",
  "/api/notifications",
  "/api/section/vue-croisee",
  "/api/validations",
  "/api/corrections",
  "/api/syntheses",
  "/api/demo/reinitialiser",
  "/api/demo/etat", // lecture seule : indique si le mode démo global est actif (bandeau)
  "/api/demo/comptes", // lecture seule : les entrées de la démonstration (page /demo, « Changer de fonction »)
  "/a-corriger", // lit l'appareil, et /api/a-corriger
  "/api/a-corriger", // lecture seule, par user.db
  // Phase 2 (14 octobre 2026, pour former les départements qui rejoignent le
  // SID) : tout le travail métier — mensuel, trimestriel, note de situation,
  // autres rapports, établissements. Vérifié : plus aucune route de ces familles
  // n'importe le client de production ; toutes passent par `user.db`, qui est la
  // base de démonstration pour une session démo. Restent fermés : comptes
  // (/admin), administration du système, espace technique, première connexion.
  "/da",
  "/dd",
  "/section",
  "/trimestre",
  "/etablissements",
  "/mon-compte/synchronisation",
  "/mon-compte/securite",
  "/api/bootstrap",
  "/api/da",
  "/api/dd",
  "/api/section",
  "/api/trimestre",
  "/api/reports",
  "/api/exports",
  "/api/etablissements",
  "/api/periodes",
  "/api/observations",
  "/api/aide",
  // 15 octobre 2026 (« certains boutons du menu ne fonctionnent pas », constat
  // du Délégué en démonstration) : ces écrans du menu « Administration de ma
  // délégation » renvoyaient sans un mot à l'accueil. Vérifié : leurs routes
  // ne lisent que `user.db` — la base de démonstration pour une session démo.
  "/technique/audit",
  "/api/technique/audit", // lecture seule
  "/technique/aide", // ses données passent par /api/aide, déjà ouverte
  "/admin/utilisateurs", // la page ; ses actions, voir CHEMINS_EXACTS_SURS_DEMO
];

/**
 * Ouvertes en démonstration pour CETTE adresse seulement, pas pour ses
 * sous-adresses : la liste des comptes et la création d'un compte d'essai,
 * oui ; mais réinitialiser un mot de passe, désactiver un compte ou
 * réinitialiser tous les mots de passe casserait la démonstration pour toute
 * la salle de formation — ces actions restent refusées, avec un message.
 */
export const CHEMINS_EXACTS_SURS_DEMO = ["/api/admin/utilisateurs"];

const MESSAGE_COMPTES_DEMO =
  "En démonstration, les mots de passe et l'état des comptes ne se modifient pas : les comptes de formation servent à tout le monde. Dans le vrai système, ce bouton fonctionne.";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isApi = pathname.startsWith("/api/");

  if (
    token?.isDemo &&
    pathname !== "/" &&
    pathname !== "/demo" &&
    !CHEMINS_EXACTS_SURS_DEMO.includes(pathname) &&
    !CHEMINS_SURS_DEMO.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    if (isApi) {
      return NextResponse.json(
        {
          message: pathname.startsWith("/api/admin/utilisateurs/")
            ? MESSAGE_COMPTES_DEMO
            : "Cette fonctionnalité n'est pas encore disponible dans l'environnement de démonstration.",
        },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Frontière de segment obligatoire (pathname === prefix OU suivi de "/") : un simple
  // startsWith() ferait croire que "/dashboard" appartient au préfixe "/da" (bug réel
  // trouvé en vérification finale — provoquait une boucle de redirection infinie pour
  // tout rôle autre que DA/AGENT_SAISIE tentant d'ouvrir le tableau de bord).
  const rule = PROTECTED_PREFIXES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return NextResponse.next();

  if (!token) {
    if (isApi) {
      return NextResponse.json({ message: "Non authentifié" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  const role = token.role as string;
  if (!rule.roles.includes(role)) {
    if (isApi) {
      return NextResponse.json({ message: "Rôle non autorisé pour cette route." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/da/:path*",
    "/dd/:path*",
    "/section/:path*",
    "/admin/:path*",
    "/admin-systeme/:path*",
    "/etablissements/:path*",
    "/technique/:path*",
    "/api/:path*",
    "/dashboard",
  ],
};

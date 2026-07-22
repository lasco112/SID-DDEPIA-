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

const PROTECTED_PREFIXES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/da", roles: ["DA", "AGENT_SAISIE"] }, // l'agent de saisie partage l'écran de saisie de son DA, mais jamais la soumission
  { prefix: "/dd", roles: ["DD"] },
  { prefix: "/section", roles: CHEF_ROLES },
  { prefix: "/admin", roles: ["DD"] }, // ADMIN_TECH n'a aucun droit métier (CDC §A.2) : pas de gestion des comptes
  { prefix: "/etablissements", roles: ["DA", "DD"] }, // registre des établissements NOMINATIF (§B.5.3) : DA sur son arrondissement, DD sur tous
  { prefix: "/technique", roles: ["ADMIN_TECH"] }, // espace de maintenance technique — strictement séparé du métier (§A.2)
  { prefix: "/api/admin", roles: ["DD"] },
  { prefix: "/api/dd", roles: ["DD"] },
  { prefix: "/api/etablissements", roles: ["DA", "DD"] },
  { prefix: "/api/technique", roles: ["ADMIN_TECH"] },
  { prefix: "/api/sync", roles: ["DA", "AGENT_SAISIE"] },
  { prefix: "/api/rapports/submit", roles: ["DA"] }, // soumission réservée au DA — jamais l'agent, quelle que soit la mise en page ou l'ordre des règles
  { prefix: "/api/corrections", roles: CHEF_ROLES },
  { prefix: "/api/validations", roles: CHEF_ROLES },
  { prefix: "/api/syntheses", roles: CHEF_ROLES },
  { prefix: "/api/exports/drepia", roles: ["DD"] },
  { prefix: "/api/reports/generate", roles: ["DD", "DA"] },
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
const CHEMINS_SURS_DEMO = [
  "/dashboard",
  "/da/saisie",
  "/dd/supervision",
  "/section/controle",
  "/section/analyse",
  "/api/auth",
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
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isApi = pathname.startsWith("/api/");

  if (token?.isDemo && pathname !== "/" && pathname !== "/demo" && !CHEMINS_SURS_DEMO.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (isApi) {
      return NextResponse.json(
        { message: "Cette fonctionnalité n'est pas encore disponible dans l'environnement de démonstration." },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const rule = PROTECTED_PREFIXES.find((r) => pathname.startsWith(r.prefix));
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
    "/etablissements/:path*",
    "/technique/:path*",
    "/api/:path*",
    "/dashboard",
  ],
};

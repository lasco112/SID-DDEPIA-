/**
 * permissions.ts — Contrôle des droits CÔTÉ SERVEUR (CDC §14.2)
 * ---------------------------------------------------------------------------
 * Ne JAMAIS se fier à l'UI pour restreindre l'accès : chaque route API doit
 * appeler une des fonctions ci-dessous avant toute lecture/écriture. Le
 * middleware.ts fait une première passe par préfixe d'URL ; ces fonctions
 * font la vérification fine (rôle + périmètre : son arrondissement, sa
 * section) à l'intérieur du handler.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { demoDb } from "@/lib/demoDb";
import type { PrismaClient, Role } from "@prisma/client";

export interface SessionUser {
  id: string;
  role: Role;
  username: string;
  arrondissementId: string | null;
  sectionId: string | null;
  /** Session de démonstration (correction n°10) : jamais vrai pour un compte réel. */
  isDemo: boolean;
  /** Client Prisma à utiliser pour CETTE session — demoDb si isDemo, sinon la production.
   *  Les routes non encore migrées vers le mode démo continuent d'importer `db` directement
   *  (comportement inchangé) ; seules celles qui utilisent explicitement `user.db` deviennent
   *  démo-conscientes. Ne jamais faire l'inverse (ne jamais utiliser `db` pour une session démo). */
  db: PrismaClient;
}

export class ForbiddenError extends Error {
  status = 403;
}
export class UnauthorizedError extends Error {
  status = 401;
}

/** Session + utilisateur en base (source de vérité — jamais le seul JWT). */
export async function requireUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError("Non authentifié");

  const isDemo = Boolean((session.user as any).isDemo);
  if (isDemo && !demoDb) throw new UnauthorizedError("Environnement de démonstration indisponible.");
  const client = isDemo ? (demoDb as PrismaClient) : db;

  const user = await client.user.findUnique({ where: { id: (session.user as any).id } });
  if (!user || !user.actif) throw new UnauthorizedError("Compte introuvable ou désactivé");

  return {
    id: user.id,
    role: user.role,
    username: user.username,
    arrondissementId: user.arrondissementId,
    sectionId: user.sectionId,
    isDemo,
    db: client,
  };
}

/** Pour les pages serveur qui appellent encore `getServerSession(authOptions)` directement
 *  (plutôt que `requireUser()`) : renvoie le client Prisma correspondant à la session (démo ou
 *  production), sans lancer d'erreur — la page gère elle-même la redirection si non connecté. */
export function dbForSession(session: { user?: unknown } | null): PrismaClient {
  const isDemo = Boolean((session?.user as any)?.isDemo);
  if (isDemo && !demoDb) throw new Error("Environnement de démonstration indisponible.");
  return isDemo ? (demoDb as PrismaClient) : db;
}

export function assertRole(user: SessionUser, allowed: Role[]) {
  if (!allowed.includes(user.role)) {
    throw new ForbiddenError(`Rôle ${user.role} non autorisé pour cette action.`);
  }
}

export const ROLES_CHEF: Role[] = ["CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"];

/** Accès en lecture (vue croisée) à des tableaux d'une autre section, accordé au cas par cas sur
 *  demande explicite du DD — le chef garde le même usage (consultation par DA/arrondissement,
 *  espèce, période, totaux) que pour les tableaux de sa propre section, sans transfert de propriété.
 *  Ex. : le chef des services vétérinaires (CHEF_SSV) suit aussi T21 "Abattages contrôlés",
 *  qui reste rattaché à la section PSA (productions et statistiques animales). */
export const ACCES_TABLEAU_SUPPLEMENTAIRE: Partial<Record<Role, string[]>> = {
  CHEF_SSV: ["T21"],
};

/** Un chef peut consulter un tableau s'il appartient à sa section, ou s'il figure dans
 *  ACCES_TABLEAU_SUPPLEMENTAIRE pour son rôle. */
export function peutConsulterTableauSection(user: SessionUser, template: { code: string; sectionId: string }): boolean {
  if (user.sectionId === template.sectionId) return true;
  return (ACCES_TABLEAU_SUPPLEMENTAIRE[user.role] ?? []).includes(template.code);
}

export function assertProprietaireArrondissement(user: SessionUser, arrondissementId: string) {
  if (user.role !== "DA" || user.arrondissementId !== arrondissementId) {
    throw new ForbiddenError("Cet arrondissement n'est pas le vôtre.");
  }
}

export function assertProprietaireSection(user: SessionUser, sectionId: string) {
  if (!ROLES_CHEF.includes(user.role) || user.sectionId !== sectionId) {
    throw new ForbiddenError("Cette section n'est pas la vôtre.");
  }
}

/** Traduit une erreur de permission en réponse HTTP homogène pour les routes API. */
export function permissionErrorResponse(e: unknown): { status: number; message: string } {
  if (e instanceof ForbiddenError) return { status: 403, message: e.message };
  if (e instanceof UnauthorizedError) return { status: 401, message: e.message };
  return { status: 500, message: e instanceof Error ? e.message : "Erreur serveur" };
}

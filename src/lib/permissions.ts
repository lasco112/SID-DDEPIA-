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
import type { Role } from "@prisma/client";

export interface SessionUser {
  id: string;
  role: Role;
  username: string;
  arrondissementId: string | null;
  sectionId: string | null;
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

  const user = await db.user.findUnique({ where: { id: (session.user as any).id } });
  if (!user || !user.actif) throw new UnauthorizedError("Compte introuvable ou désactivé");

  return {
    id: user.id,
    role: user.role,
    username: user.username,
    arrondissementId: user.arrondissementId,
    sectionId: user.sectionId,
  };
}

export function assertRole(user: SessionUser, allowed: Role[]) {
  if (!allowed.includes(user.role)) {
    throw new ForbiddenError(`Rôle ${user.role} non autorisé pour cette action.`);
  }
}

export const ROLES_CHEF: Role[] = ["CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"];

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

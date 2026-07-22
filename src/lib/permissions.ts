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

// ---------------------------------------------------------------------------
// Mode démonstration GLOBAL (correction n°10, ajout final du DD)
// ---------------------------------------------------------------------------
// Quand le Super Administrateur l'active, TOUS les comptes réels basculent sur
// les données fictives en conservant leur rôle et leur périmètre — sans qu'aucun
// mot de passe ni aucune donnée de production ne bouge. La bascule se fait ici,
// au seul endroit qui décide quelle base une requête interroge.

export const CLE_MODE_DEMO_GLOBAL = "MODE_DEMO_GLOBAL";

// requireUser() est appelé à chaque requête : on évite une lecture SQL
// systématique avec un cache très court (la bascule prend effet en ≤ 10 s, et
// immédiatement pour l'administrateur qui l'actionne via invaliderCacheModeDemo).
let cacheModeDemo: { actif: boolean; expire: number } | null = null;

export function invaliderCacheModeDemo() {
  cacheModeDemo = null;
}

export async function modeDemoGlobalActif(): Promise<boolean> {
  if (!demoDb) return false; // pas d'environnement démo configuré ici
  if (cacheModeDemo && cacheModeDemo.expire > Date.now()) return cacheModeDemo.actif;
  let actif = false;
  try {
    const config = await db.configSysteme.findUnique({ where: { cle: CLE_MODE_DEMO_GLOBAL } });
    actif = config?.valeur === "actif";
  } catch {
    actif = false; // table absente ou base indisponible : on reste en production
  }
  cacheModeDemo = { actif, expire: Date.now() + 10_000 };
  return actif;
}

type IdentiteUtilisateur = { id: string; role: Role; username: string; arrondissementId: string | null; sectionId: string | null };

/** Retrouve, dans la base démo, le compte équivalent à un compte réel : même rôle et même
 *  périmètre (code d'arrondissement / code de section, stables entre les deux bases). */
async function jumeauDemo(reel: IdentiteUtilisateur): Promise<IdentiteUtilisateur | null> {
  if (!demoDb) return null;
  const [arr, sec] = await Promise.all([
    reel.arrondissementId ? db.arrondissement.findUnique({ where: { id: reel.arrondissementId }, select: { code: true } }) : null,
    reel.sectionId ? db.section.findUnique({ where: { id: reel.sectionId }, select: { code: true } }) : null,
  ]);
  return demoDb.user.findFirst({
    where: {
      role: reel.role,
      actif: true,
      ...(arr ? { arrondissement: { code: arr.code } } : {}),
      ...(sec ? { section: { code: sec.code } } : {}),
    },
    select: { id: true, role: true, username: true, arrondissementId: true, sectionId: true },
  });
}

/** Contexte effectif d'une session : quelle base interroger, sous quelle identité.
 *  Trois cas : session démo dédiée (/demo), compte réel pendant une démonstration
 *  globale (remappé sur son jumeau fictif), ou production normale. */
async function resoudreContexte(sessionUser: any): Promise<SessionUser> {
  const sessionEstDemo = Boolean(sessionUser?.isDemo);
  if (sessionEstDemo && !demoDb) throw new UnauthorizedError("Environnement de démonstration indisponible.");

  const client = sessionEstDemo ? (demoDb as PrismaClient) : db;
  const user = await client.user.findUnique({ where: { id: sessionUser?.id } });
  if (!user || !user.actif) throw new UnauthorizedError("Compte introuvable ou désactivé");

  // L'ADMIN_TECH n'est jamais remappé : c'est lui qui pilote la démonstration et
  // il doit garder l'accès réel à son espace technique pour pouvoir l'arrêter.
  if (!sessionEstDemo && user.role !== "ADMIN_TECH" && (await modeDemoGlobalActif())) {
    const jumeau = await jumeauDemo(user);
    if (jumeau) {
      return { ...jumeau, isDemo: true, db: demoDb as PrismaClient };
    }
  }

  return {
    id: user.id,
    role: user.role,
    username: user.username,
    arrondissementId: user.arrondissementId,
    sectionId: user.sectionId,
    isDemo: sessionEstDemo,
    db: client,
  };
}

/** Session + utilisateur en base (source de vérité — jamais le seul JWT). */
export async function requireUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError("Non authentifié");
  return resoudreContexte(session.user);
}

/** Équivalent de requireUser() pour les pages serveur qui gèrent elles-mêmes la
 *  redirection : renvoie null au lieu de lever si la session est absente/invalide. */
export async function contexteSession(session: { user?: unknown } | null): Promise<SessionUser | null> {
  if (!session?.user) return null;
  try {
    return await resoudreContexte(session.user);
  } catch {
    return null;
  }
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

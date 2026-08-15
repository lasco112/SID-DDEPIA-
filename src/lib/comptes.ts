/**
 * comptes.ts — la seule lecture de `User` qui précède le cloisonnement.
 *
 * Pourquoi ce module existe
 * -------------------------
 * `User` est une table cloisonnée : ses politiques comparent le département de
 * la ligne au réglage `app.departement_id`. Mais l'authentification doit lire un
 * compte AVANT de connaître son département — on cherche par nom d'utilisateur,
 * et c'est la ligne trouvée qui apprend à quel département elle appartient.
 * Aucune politique ne peut résoudre cette circularité.
 *
 * On ouvre donc UNE porte, et une seule : une fonction SQL `SECURITY DEFINER`
 * qui rend un compte par identifiant ou par nom d'utilisateur, et rien d'autre.
 * Elle ne permet ni de parcourir la table, ni de la filtrer, ni d'atteindre une
 * autre table. Tout le reste de l'accès aux comptes passe par `user.db`.
 *
 * Ce module est le seul endroit du code autorisé à l'appeler. Ne pas s'en
 * servir pour du confort : chaque usage ajouté élargit la porte.
 *
 * Les opérations sans modèle — `$queryRaw` en fait partie — traversent le
 * client cloisonné sans être enveloppées : l'appel fonctionne donc aussi bien
 * avec le client de base qu'avec un client de session.
 */
import type { PrismaClient, Role } from "@prisma/client";

/** Ce que l'authentification a besoin de savoir, et rien de plus. */
export interface CompteAuthentification {
  id: string;
  username: string;
  passwordHash: string;
  nom: string;
  role: Role;
  actif: boolean;
  mustChangePassword: boolean;
  sessionRevoqueeLe: Date | null;
  arrondissementId: string | null;
  sectionId: string | null;
  departementId: string | null;
}

async function compte(
  base: PrismaClient,
  username: string | null,
  id: string | null
): Promise<CompteAuthentification | null> {
  const lignes = await base.$queryRaw<CompteAuthentification[]>`
    SELECT * FROM public.compte_pour_authentification(${username}::text, ${id}::text)
  `;
  return lignes[0] ?? null;
}

/** Le compte portant ce nom d'utilisateur — pour la connexion. */
export function compteParUsername(base: PrismaClient, username: string) {
  return compte(base, username, null);
}

/**
 * Le compte portant cet identifiant — pour retrouver le département d'une
 * session déjà ouverte, et pour vérifier qu'un jeton n'a pas été révoqué.
 */
export function compteParId(base: PrismaClient, id: string) {
  return compte(base, null, id);
}

/**
 * Ce nom d'utilisateur est-il libre ?
 *
 * L'unicité des identifiants est GLOBALE, pas départementale : la vérification
 * traverse donc les départements par nature. La fonction SQL ne rend qu'un
 * booléen — elle n'expose aucune ligne.
 */
export async function identifiantDisponible(base: PrismaClient, username: string): Promise<boolean> {
  const lignes = await base.$queryRaw<{ libre: boolean }[]>`
    SELECT public.identifiant_disponible(${username}::text) AS libre
  `;
  return lignes[0]?.libre ?? false;
}

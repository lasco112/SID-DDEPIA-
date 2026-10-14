/**
 * La garde commune des routes de l'administration du système : un DD qui
 * porte la marque d'administrateur, et lui seul (décision du Délégué,
 * 14 octobre 2026). Le middleware filtre déjà sur le rôle ; la marque se
 * vérifie ici, en base, à chaque appel.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, assertAdminSysteme, permissionErrorResponse, type SessionUser } from "@/lib/permissions";
import { ErreurAdministration } from "@/server/administration/systeme";

export async function administrateur(): Promise<SessionUser> {
  const user = await requireUser();
  assertRole(user, ["DD"]);
  assertAdminSysteme(user);
  return user;
}

export function reponseErreur(e: unknown) {
  if (e instanceof ErreurAdministration) return NextResponse.json({ message: e.message }, { status: e.status });
  const { status, message } = permissionErrorResponse(e);
  return NextResponse.json({ message }, { status });
}

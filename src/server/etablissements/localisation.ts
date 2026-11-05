/**
 * Le CZV et le village d'un établissement (découpage MINEPIA de l'Ouest,
 * demande du Délégué du 4 novembre 2026).
 *
 * Tout est facultatif : un appareil qui n'a pas encore la nouvelle version
 * n'envoie aucun de ces champs, et l'établissement s'écrit comme avant, avec
 * sa seule « localité ». Quand un village est choisi, la localité prend son
 * nom ; « Autre village » (absent de la liste) l'écrit tel que saisi. Rien de
 * ce qui lit la localité — listes, exports, rapports — ne change donc.
 *
 * Le contrôle se fait ICI, côté serveur : un CZV d'un autre arrondissement, ou
 * un village d'un autre CZV, est refusé même par un appel direct à l'API. La
 * lecture passe par le client cloisonné : un CZV d'un autre département n'est
 * même pas visible.
 */
import type { PrismaClient } from "@prisma/client";

type Lecture = Pick<PrismaClient, "centreZootechnique" | "village">;

const texte = (x: unknown) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim() : "");

export async function preparerLocalisation(
  db: Lecture,
  body: Record<string, unknown>,
  arrondissementId: string
): Promise<{ erreur: string } | { data: { centreId?: string | null; villageId?: string | null; villageAutre?: string | null; localite?: string } }> {
  const touche = "centreId" in body || "villageId" in body || "villageAutre" in body;
  if (!touche) return { data: {} };

  let centreId = typeof body.centreId === "string" && body.centreId ? body.centreId : null;
  const villageId = typeof body.villageId === "string" && body.villageId ? body.villageId : null;
  const villageAutre = villageId ? null : texte(body.villageAutre) || null;

  let nomVillage: string | null = null;
  if (villageId) {
    const v = await db.village.findUnique({ where: { id: villageId }, select: { nom: true, centreId: true } });
    if (!v) return { erreur: "Ce village n'existe pas dans la liste de votre département." };
    if (centreId && v.centreId !== centreId) return { erreur: "Ce village n'est pas couvert par le CZV choisi." };
    centreId = v.centreId;
    nomVillage = v.nom;
  }
  if (centreId) {
    const c = await db.centreZootechnique.findUnique({ where: { id: centreId }, select: { arrondissementId: true } });
    if (!c || c.arrondissementId !== arrondissementId) return { erreur: "Ce CZV n'est pas dans l'arrondissement de l'établissement." };
  }
  if (villageAutre && !centreId) return { erreur: "Choisissez d'abord le CZV, puis précisez le village." };

  const localite = nomVillage ?? villageAutre ?? undefined;
  return { data: { centreId, villageId, villageAutre, ...(localite ? { localite } : {}) } };
}

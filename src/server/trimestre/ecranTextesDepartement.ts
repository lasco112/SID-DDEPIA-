/**
 * Ce que l'écran « Textes de mon département » lit et écrit — commun au DD (son
 * département) et à l'administrateur du système (n'importe lequel). Le client
 * reçu est cloisonné sur le département visé.
 */
import type { PrismaClient } from "@prisma/client";
import { identiteDepartement } from "@/lib/departement";
import { ecrireTextePermanent, zonesPermanentes, TexteRefuse } from "./textesDepartement";

export async function lireEcranTextes(db: PrismaClient, portee: string) {
  const identite = await identiteDepartement(db);
  const arrondissements = await db.arrondissement.findMany({ orderBy: { ordre: "asc" }, select: { id: true, nom: true } });
  const arrondissement = portee ? arrondissements.find((a) => a.id === portee) ?? null : null;
  if (portee && !arrondissement) throw new TexteRefuse("Cet arrondissement n'appartient pas au département.");
  return {
    departement: { id: identite.id, nom: identite.nom, nomAvecArticle: identite.nomAvecArticle },
    arrondissements,
    portee,
    zones: await zonesPermanentes(db, identite.code, arrondissement),
  };
}

export async function ecrireEcranTextes(db: PrismaClient, corps: unknown, auteurId: string) {
  const b = (corps ?? {}) as { portee?: unknown; cle?: unknown; texte?: unknown };
  if (typeof b.cle !== "string" || typeof b.texte !== "string") throw new TexteRefuse("Zone ou texte manquant.");
  const portee = typeof b.portee === "string" ? b.portee : "";
  const resultat = await ecrireTextePermanent(db, portee, b.cle, b.texte, auteurId);
  await db.auditLog.create({
    data: {
      userId: auteurId,
      action: "TEXTE_PERMANENT",
      entite: "TexteDepartement",
      entiteId: `${portee || "departement"}:${b.cle}`,
      details: { portee: portee || "departement", cle: b.cle, resultat, longueur: b.texte.length },
    },
  });
  return resultat;
}

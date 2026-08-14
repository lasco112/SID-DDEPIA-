/**
 * Conservation des rapports trimestriels produits.
 *
 * Un rapport téléchargé et perdu n'existe plus : le disque du conteneur Railway
 * est effacé à chaque redéploiement, et rien ne garantit que le Délégué
 * retrouve le fichier six mois plus tard, quand la Région le lui redemande.
 * Chaque document produit est donc conservé EN BASE, avec son numéro de
 * version et l'empreinte de son contenu.
 *
 * Le versionnage n'est pas décoratif : régénérer un trimestre après avoir
 * complété une rubrique donne un document différent du précédent. Les deux
 * doivent pouvoir être distingués — c'est le seul moyen de répondre à « quelle
 * version ai-je transmise ? ».
 */
import { createHash } from "node:crypto";
import type { PrismaClient, TypeExport } from "@prisma/client";
import type { Periode } from "../periodes/calendrier";
import { periodeTrimestrielle } from "./rubriques";

export interface RapportArchive {
  id: string;
  version: number;
  /** Vrai si ce document est identique au précédent — rien n'a changé depuis. */
  identiqueAuPrecedent: boolean;
}

export async function archiverRapportTrimestriel(
  db: PrismaClient,
  periode: Periode,
  o: {
    buffer: Buffer;
    nomFichier: string;
    auteurId: string;
    /** null pour le rapport départemental. */
    arrondissementId: string | null;
  }
): Promise<RapportArchive> {
  const periodeId = await periodeTrimestrielle(db, periode);
  const type: TypeExport = o.arrondissementId
    ? "RAPPORT_TRIMESTRIEL_DA_DOCX"
    : "RAPPORT_TRIMESTRIEL_DD_DOCX";

  const hash = createHash("sha256").update(o.buffer).digest("hex");

  /*
   * Le numéro de version se calcule sur la même période, le même type ET le
   * même arrondissement. Le compter sur la seule période ferait démarrer le
   * rapport de Santchou à la version 4 parce que trois autres arrondissements
   * ont produit le leur avant — un numéro qui ne voudrait rien dire pour lui.
   */
  const precedent = await db.exportDocument.findFirst({
    where: { periodeId, type, arrondissementId: o.arrondissementId },
    orderBy: { version: "desc" },
    select: { version: true, hashSha256: true },
  });

  const cree = await db.exportDocument.create({
    data: {
      type,
      periodeId,
      auteurId: o.auteurId,
      arrondissementId: o.arrondissementId,
      version: (precedent?.version ?? 0) + 1,
      cheminFichier: o.nomFichier,
      contenu: o.buffer,
      hashSha256: hash,
    },
    select: { id: true, version: true },
  });

  return { ...cree, identiqueAuPrecedent: precedent?.hashSha256 === hash };
}

/**
 * Les zones de texte analytiques du rapport trimestriel : lecture, écriture,
 * et la période à laquelle les rattacher.
 *
 * Avant ce module, les 41 zones du canevas sortaient toutes en consigne grise
 * entre crochets. Le Délégué téléchargeait le document, puis retapait ses
 * analyses dans Word — hors du système. Rien n'en restait : ni trace, ni
 * reprise d'un trimestre à l'autre, ni possibilité de préparer le texte avant
 * que les chiffres soient complets.
 */
import type { PrismaClient } from "@prisma/client";
import type { Transactionnelle } from "@/lib/dbCloisonne";
import { type Periode, libelleOfficiel, moisDeLaPeriode } from "../periodes/calendrier";

/**
 * La ligne `PeriodeReporting` d'un trimestre, créée si elle n'existe pas.
 *
 * Les périodes trimestrielles n'existaient pas en base : le consolidateur
 * travaille sur un objet `Periode` calculé, et lit les mois. Mais une rubrique
 * narrative doit se rattacher à quelque chose de durable, et un document
 * archivé aussi. On matérialise donc le trimestre au premier besoin.
 *
 * Les échéances ne sont pas celles d'une collecte mensuelle : un trimestre ne
 * se saisit pas, il se rédige. Elles sont posées à la fin du trimestre pour que
 * les colonnes obligatoires du modèle portent une valeur sensée, et ne
 * commandent aucun verrouillage.
 */
export async function periodeTrimestrielle(db: PrismaClient, p: Periode): Promise<string> {
  const trimestre = Math.floor((moisDeLaPeriode(p)[0].mois - 1) / 3) + 1;
  const existante = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: p.annee, trimestre },
    select: { id: true },
  });
  if (existante) return existante.id;

  const dernierMois = moisDeLaPeriode(p).at(-1)!;
  const finDuTrimestre = new Date(Date.UTC(dernierMois.annee, dernierMois.mois, 0));
  const creee = await db.periodeReporting.create({
    data: {
      type: "TRIMESTRIEL",
      annee: p.annee,
      trimestre,
      dateOuverture: new Date(Date.UTC(dernierMois.annee, dernierMois.mois - 1, 1)),
      dateLimiteDA: finDuTrimestre,
      dateLimiteChef: finDuTrimestre,
      dateLimiteDD: finDuTrimestre,
    },
    select: { id: true },
  });
  return creee.id;
}

/** Les textes déjà rédigés pour une période, par clé de zone. */
export async function lireRubriques(
  db: PrismaClient,
  p: Periode,
  arrondissementId: string | null
): Promise<Map<string, string>> {
  const periode = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: p.annee, trimestre: Math.floor((moisDeLaPeriode(p)[0].mois - 1) / 3) + 1 },
    select: { id: true },
  });
  // Rien n'a encore été rédigé pour ce trimestre : ne pas créer la période pour
  // une simple lecture, sinon le moindre aperçu laisserait une ligne en base.
  if (!periode) return new Map();

  const lignes = await db.rubriqueNarrative.findMany({
    where: { periodeId: periode.id, arrondissementId },
    select: { cle: true, contenu: true },
  });
  const m = new Map<string, string>();
  for (const l of lignes) if (l.contenu?.trim()) m.set(l.cle, l.contenu);
  return m;
}

/**
 * Écrit une rubrique. Un contenu vide EFFACE la rubrique plutôt que d'enregistrer
 * une chaîne vide : la zone retrouve alors sa consigne, ce qui est l'état « pas
 * encore rédigé » — et non « rédigé, mais avec rien ».
 *
 * L'écriture n'utilise pas `upsert` : la clé unique des rubriques
 * départementales est un index PARTIEL, que Prisma ne sait pas viser. La
 * séquence est donc faite à la main dans une transaction, et l'index partiel
 * reste le garde-fou en cas d'écriture simultanée.
 *
 * `transaction` est celle de la session (`user.transaction`) : appeler
 * `db.$transaction` sur un client cloisonné ne tiendrait rien — chaque
 * opération du `tx` rouvrirait sa propre transaction, et la lecture puis
 * l'écriture ci-dessous cesseraient d'être solidaires.
 */
export async function ecrireRubrique(
  db: PrismaClient,
  transaction: Transactionnelle,
  p: Periode,
  arrondissementId: string | null,
  cle: string,
  contenu: string,
  auteurId: string
): Promise<{ enregistre: boolean }> {
  const periodeId = await periodeTrimestrielle(db, p);
  const texte = contenu.trim();

  return transaction(async (tx) => {
    const existante = await tx.rubriqueNarrative.findFirst({
      where: { periodeId, arrondissementId, cle },
      select: { id: true },
    });

    if (!texte) {
      if (existante) await tx.rubriqueNarrative.delete({ where: { id: existante.id } });
      return { enregistre: false };
    }
    if (existante) {
      await tx.rubriqueNarrative.update({
        where: { id: existante.id },
        data: { contenu: texte, auteurId },
      });
    } else {
      await tx.rubriqueNarrative.create({
        data: { periodeId, arrondissementId, cle, contenu: texte, auteurId },
      });
    }
    return { enregistre: true };
  });
}

/** Combien de zones sont rédigées, pour l'afficher au rédacteur. */
export async function compterRubriques(
  db: PrismaClient,
  p: Periode,
  arrondissementId: string | null
): Promise<number> {
  return (await lireRubriques(db, p, arrondissementId)).size;
}

/** Le libellé officiel de la période — pour les messages et l'audit. */
export const libellePeriode = libelleOfficiel;

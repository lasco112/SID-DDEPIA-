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
import { type Periode, libelleOfficiel, moisDeLaPeriode, periodeContenant, dernierMois } from "../periodes/calendrier";

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
  // Un semestre ou une année se matérialise de la même façon, sous SON type :
  // ses propres textes et corrections s'y rattachent.
  const existante = await ligneDePeriode(db, p);
  if (existante) return existante;

  const dernierMois = moisDeLaPeriode(p).at(-1)!;
  const finDeLaPeriode = new Date(Date.UTC(dernierMois.annee, dernierMois.mois, 0));
  const creee = await db.periodeReporting.create({
    data: {
      type: p.type,
      annee: p.annee,
      ...(p.type === "TRIMESTRIEL" ? { trimestre: p.rang } : p.type === "SEMESTRIEL" ? { semestre: p.rang } : {}),
      dateOuverture: new Date(Date.UTC(dernierMois.annee, dernierMois.mois - 1, 1)),
      dateLimiteDA: finDeLaPeriode,
      dateLimiteChef: finDeLaPeriode,
      dateLimiteDD: finDeLaPeriode,
    },
    select: { id: true },
  });
  return creee.id;
}

/** La ligne `PeriodeReporting` d'un trimestre, d'un semestre ou d'une année — sans la créer. */
export async function ligneDePeriode(db: PrismaClient, p: Periode): Promise<string | null> {
  const selon =
    p.type === "TRIMESTRIEL" ? { trimestre: p.rang } : p.type === "SEMESTRIEL" ? { semestre: p.rang } : p.type === "MENSUEL" ? { mois: p.rang } : {};
  const ligne = await db.periodeReporting.findFirst({ where: { type: p.type, annee: p.annee, ...selon }, select: { id: true } });
  return ligne?.id ?? null;
}

/**
 * Le trimestre qui CLÔT une période : le T2 pour le premier semestre, le T4
 * pour le second et pour l'année. Le semestre et l'année se produisent en même
 * temps que lui, en reprennent les textes et suivent son circuit (décisions du
 * Délégué, 28 septembre 2026).
 */
export function trimestreDeCloture(p: Periode): Periode {
  return periodeContenant("TRIMESTRIEL", p.annee, dernierMois(p));
}

async function rubriquesDe(db: PrismaClient, periodeId: string | null, arrondissementId: string | null) {
  const m = new Map<string, string>();
  if (!periodeId) return m;
  const lignes = await db.rubriqueNarrative.findMany({
    where: { periodeId, arrondissementId },
    select: { cle: true, contenu: true },
  });
  for (const l of lignes) if (l.contenu?.trim()) m.set(l.cle, l.contenu);
  return m;
}

/**
 * Les textes déjà rédigés pour une période, par clé de zone. Un semestre ou
 * une année part des textes du trimestre qui le clôt ; ce qui a été rédigé
 * pour lui-même l'emporte.
 */
export async function lireRubriques(
  db: PrismaClient,
  p: Periode,
  arrondissementId: string | null
): Promise<Map<string, string>> {
  // Rien n'a encore été rédigé pour une période absente : on ne la crée pas
  // pour une simple lecture, sinon le moindre aperçu laisserait une ligne en base.
  const propres = await rubriquesDe(db, await ligneDePeriode(db, p), arrondissementId);
  if (p.type === "TRIMESTRIEL") return propres;
  const repris = await rubriquesDe(db, await ligneDePeriode(db, trimestreDeCloture(p)), arrondissementId);
  propres.forEach((t, cle) => repris.set(cle, t));
  return repris;
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
  auteurId: string,
  /** Écrit hors ligne : la date de l'appareil. Une version plus récente sur le serveur est conservée. */
  modifieLe?: Date
): Promise<{ enregistre: boolean; ignoree?: boolean }> {
  const periodeId = await periodeTrimestrielle(db, p);
  const texte = contenu.trim();

  return transaction(async (tx) => {
    const existante = await tx.rubriqueNarrative.findFirst({
      where: { periodeId, arrondissementId, cle },
      select: { id: true, updatedAt: true },
    });
    if (existante && modifieLe && existante.updatedAt > modifieLe) return { enregistre: false, ignoree: true };

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

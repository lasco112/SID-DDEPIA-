/**
 * Recalcul des cases dérivées CÔTÉ SERVEUR.
 *
 * L'appareil calcule déjà ces cases à la saisie (lib/derivationLocale.ts).
 * Le serveur doit refaire le calcul dans deux situations où l'appareil n'est
 * pas dans la boucle :
 *
 *  1. après réception d'un lot de synchronisation touchant 1.4 ou 1.5 —
 *     plusieurs appareils peuvent alimenter le même arrondissement ;
 *  2. après une correction d'un chef de section ou du DD sur 1.4 ou 1.5 :
 *     sans recalcul, le tableau 1.2 resterait sur l'ancienne somme et le
 *     rapport se contredirait lui-même.
 *
 * Dans le second cas la modification est tracée comme n'importe quelle
 * correction : le DD doit pouvoir constater qu'une case a bougé, et pourquoi.
 */
import type { PrismaClient } from "@prisma/client";
import { CHAMPS_DERIVES, reglesAlimenteesPar, type RegleChampDerive } from "@/lib/champsDerives";

interface Options {
  /** Auteur à qui imputer la trace, si une correction doit être enregistrée. */
  auteurId?: string;
  /** Motif de la trace. Sans motif, la valeur est mise à jour sans ligne de correction. */
  motif?: string;
}

/** Recalcule les cases alimentées par un tableau donné, pour un rapport. */
export async function recalculerDerivesPourTemplate(
  db: PrismaClient,
  rapportId: string,
  templateCodeSource: string,
  options: Options = {}
): Promise<void> {
  const regles = reglesAlimenteesPar(templateCodeSource);
  for (const regle of regles) await appliquer(db, rapportId, regle, options);
}

/** Recalcule toutes les cases dérivées d'un rapport. */
export async function recalculerTousLesDerives(db: PrismaClient, rapportId: string, options: Options = {}): Promise<void> {
  for (const regle of CHAMPS_DERIVES) await appliquer(db, rapportId, regle, options);
}

async function appliquer(db: PrismaClient, rapportId: string, regle: RegleChampDerive, options: Options): Promise<void> {
  const lignes = await db.saisieNominative.findMany({
    where: { rapportId, fieldCode: regle.champSource, nonRenseigne: false },
    select: { valeur: true },
  });
  if (lignes.length === 0) return; // pas de source : on n'invente pas un zéro

  const total = lignes.reduce((s, l) => s + Number(l.valeur ?? 0), 0);

  const existante = await db.saisieMatrice.findUnique({
    where: { rapportId_fieldCode: { rapportId, fieldCode: regle.champCible } },
  });
  if (existante && Number(existante.valeur ?? NaN) === total && !existante.nonRenseigne) return;

  const maintenant = new Date();
  const misAJour = existante
    ? await db.saisieMatrice.update({
        where: { id: existante.id },
        data: { valeur: total, nonRenseigne: false, motifNonRenseigne: null, modifieLe: maintenant },
      })
    : await db.saisieMatrice.create({
        data: {
          rapportId,
          fieldCode: regle.champCible,
          valeur: total,
          nonRenseigne: false,
          // Identifiant déterministe : ce n'est pas une saisie d'appareil, et
          // deux recalculs successifs ne doivent pas créer deux lignes.
          clientId: `derive:${rapportId}:${regle.champCible}`,
          modifieLe: maintenant,
        },
      });

  if (options.auteurId && options.motif) {
    await db.correction.create({
      data: {
        saisieMatriceId: misAJour.id,
        valeurAvant: JSON.stringify({ valeur: existante?.valeur ?? null, nonRenseigne: existante?.nonRenseigne ?? false }),
        valeurApres: JSON.stringify({ valeur: misAJour.valeur, nonRenseigne: false }),
        motif: options.motif,
        auteurId: options.auteurId,
      },
    });
  }
}

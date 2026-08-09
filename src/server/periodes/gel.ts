/**
 * Gel d'une période clôturée (CDC §13).
 *
 * Une fois le rapport départemental produit et la période clôturée, les
 * données du mois sont figées : plus aucune modification ordinaire n'est
 * possible. La consultation et le téléchargement, eux, restent ouverts —
 * c'est tout l'intérêt de l'archivage.
 *
 * Seul le DD peut rouvrir la période, avec un motif obligatoire.
 */
import type { PrismaClient } from "@prisma/client";

export class PeriodeGeleeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeriodeGeleeError";
  }
}

/** Statut d'une période clôturée. Voir CLAUDE.md : `ARCHIVEE` = clôturée. */
export const STATUT_CLOTUREE = "ARCHIVEE" as const;

/**
 * Lève si la période est clôturée. À appeler dans toute route qui ÉCRIT une
 * donnée rattachée à une période : saisie, correction, validation, soumission.
 */
export async function assertPeriodeModifiable(
  db: Pick<PrismaClient, "periodeReporting">,
  periodeId: string
): Promise<void> {
  const periode = await db.periodeReporting.findUnique({
    where: { id: periodeId },
    select: { statut: true, mois: true, annee: true },
  });
  if (!periode) return; // l'absence de période est traitée par l'appelant
  if (periode.statut === STATUT_CLOTUREE) {
    throw new PeriodeGeleeError(
      `La période ${String(periode.mois ?? "").padStart(2, "0")}/${periode.annee} est clôturée : ses données sont figées. Le Délégué Départemental doit la rouvrir avant toute modification.`
    );
  }
}

/** Vrai si la période est clôturée — pour un affichage, sans lever d'erreur. */
export async function periodeEstCloturee(
  db: Pick<PrismaClient, "periodeReporting">,
  periodeId: string
): Promise<boolean> {
  const p = await db.periodeReporting.findUnique({ where: { id: periodeId }, select: { statut: true } });
  return p?.statut === STATUT_CLOTUREE;
}

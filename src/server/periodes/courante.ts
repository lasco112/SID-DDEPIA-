/**
 * Période de travail (CDC §1 et §15.1).
 *
 * Le SID ne travaille plus implicitement sur « le dernier mois » : chaque
 * utilisateur choisit sa période de travail, y compris un mois antérieur à la
 * mise en service du système, et ce choix s'applique à toutes les pages.
 *
 * Le choix est mémorisé dans un cookie plutôt que dans l'URL : il doit suivre
 * l'utilisateur d'un écran à l'autre sans que chaque lien ait à le transporter,
 * et rester lisible par les Server Components.
 */
import { cookies } from "next/headers";
import type { PrismaClient } from "@prisma/client";

export const COOKIE_PERIODE = "sid_periode";

const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

export function libellePeriode(p: { mois: number | null; annee: number }): string {
  return `${MOIS_FR[(p.mois ?? 1) - 1] ?? "?"} ${p.annee}`;
}

/**
 * Période de travail effective.
 *
 * `demandee` (paramètre d'URL ou corps de requête) l'emporte toujours : une
 * route qui reçoit un periodeId explicite ne doit jamais lui préférer le
 * cookie. À défaut : la période choisie par l'utilisateur, sinon la plus
 * récente encore ouverte, sinon la plus récente tout court.
 */
export async function resoudrePeriode(
  db: Pick<PrismaClient, "periodeReporting">,
  demandee?: string | null
) {
  if (demandee) {
    const p = await db.periodeReporting.findUnique({ where: { id: demandee } });
    if (p && p.type === "MENSUEL") return p;
  }

  const choisie = cookies().get(COOKIE_PERIODE)?.value;
  if (choisie) {
    const p = await db.periodeReporting.findUnique({ where: { id: choisie } });
    // Une période supprimée ou d'un autre type : on retombe silencieusement
    // sur le défaut plutôt que d'afficher une page vide.
    if (p && p.type === "MENSUEL") return p;
  }

  return (
    (await db.periodeReporting.findFirst({
      where: { type: "MENSUEL", statut: { not: "ARCHIVEE" } },
      orderBy: [{ annee: "desc" }, { mois: "desc" }],
    })) ??
    (await db.periodeReporting.findFirst({
      where: { type: "MENSUEL" },
      orderBy: [{ annee: "desc" }, { mois: "desc" }],
    }))
  );
}

/** Liste des périodes mensuelles, de la plus récente à la plus ancienne. */
export async function listerPeriodes(db: Pick<PrismaClient, "periodeReporting">) {
  return db.periodeReporting.findMany({
    where: { type: "MENSUEL" },
    orderBy: [{ annee: "desc" }, { mois: "desc" }],
  });
}

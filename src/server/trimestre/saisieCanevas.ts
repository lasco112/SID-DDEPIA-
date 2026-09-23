/**
 * La saisie des tableaux du canevas, cellule par cellule.
 *
 * À quoi cela sert
 * ----------------
 * Ce qu'aucun mois ne collecte — les tableaux du BAC, le détail des cheptels
 * par catégorie, les infrastructures, la pêche, les listes du BIP ou des
 * vétérinaires — se saisit une fois par trimestre (décision D9 du Délégué).
 *
 * Pourquoi cela n'enfreint pas « une donnée est saisie une seule fois »
 * --------------------------------------------------------------------
 * L'invariant interdit de redemander ce que les mois portent déjà — un
 * cheptel, des abattages. La règle n'est plus une liste de tableaux mais une
 * règle de CASE, dans saisieTrimestrielle.ts : une case que le SID calcule à
 * partir du mensuel, ou un total, ne se saisit jamais. Les routes vérifient
 * cette règle AVANT d'appeler ecrireSaisieCanevas.
 *
 * Le repérage
 * -----------
 * Une cellule est repérée par ses coordonnées DANS LE CANEVAS : numéro de
 * tableau, libellé de ligne, libellé de colonne. Le canevas décrit déjà ces
 * tableaux et sait les rendre ; il devient sa propre grille de saisie. Aucune
 * structure parallèle ne peut donc diverger de lui — y compris la colonne
 * « DDEPIA », la régie départementale, que le canevas gère déjà.
 */
import type { PrismaClient } from "@prisma/client";
import type { Transactionnelle } from "@/lib/dbCloisonne";


export interface CelluleCanevas {
  numeroTableau: number;
  ligne: string;
  colonne: string;
}

/** La clé d'une cellule dans les tables de lecture rapide. */
export function cleCellule(c: CelluleCanevas): string {
  return `${c.numeroTableau} | ${c.ligne} | ${c.colonne}`;
}

export interface ValeurCellule {
  valeur: number | null;
  texte: string | null;
}

/**
 * Toutes les cellules saisies pour une période, prêtes à être consultées par
 * coordonnées. Une seule requête, quel que soit le nombre de tableaux.
 */
export async function lireSaisiesCanevas(
  db: PrismaClient,
  periodeId: string
): Promise<Map<string, ValeurCellule>> {
  const lignes = await db.saisieCanevas.findMany({
    where: { periodeId },
    select: { numeroTableau: true, ligne: true, colonne: true, valeur: true, valeurTexte: true },
  });

  const m = new Map<string, ValeurCellule>();
  for (const l of lignes) {
    m.set(cleCellule(l), {
      valeur: l.valeur == null ? null : Number(l.valeur),
      texte: l.valeurTexte,
    });
  }
  return m;
}

/**
 * Écrit une cellule. Un contenu vide EFFACE la cellule plutôt que d'enregistrer
 * un zéro : une case vide est « pas encore saisi », un zéro est « mesuré et
 * nul ». Les confondre fausserait les totaux — c'est l'invariant des trois
 * états (`0`, `null`, `NA`).
 *
 * `transaction` est celle de la session (`user.transaction`) : la lecture puis
 * l'écriture doivent être solidaires, faute de quoi deux saisies simultanées de
 * la même cellule en créeraient deux.
 */
export async function ecrireSaisieCanevas(
  db: PrismaClient,
  transaction: Transactionnelle,
  periodeId: string,
  cellule: CelluleCanevas,
  saisie: { valeur?: number | null; texte?: string | null },
  auteurId: string
): Promise<{ enregistre: boolean }> {

  const texte = saisie.texte?.trim() || null;
  const valeur = saisie.valeur ?? null;
  const vide = valeur == null && !texte;

  return transaction(async (tx) => {
    const existante = await tx.saisieCanevas.findFirst({
      where: {
        periodeId,
        numeroTableau: cellule.numeroTableau,
        ligne: cellule.ligne,
        colonne: cellule.colonne,
      },
      select: { id: true },
    });

    if (vide) {
      if (existante) await tx.saisieCanevas.delete({ where: { id: existante.id } });
      return { enregistre: false };
    }

    if (existante) {
      await tx.saisieCanevas.update({
        where: { id: existante.id },
        data: { valeur, valeurTexte: texte, auteurId },
      });
    } else {
      await tx.saisieCanevas.create({
        data: {
          periodeId,
          numeroTableau: cellule.numeroTableau,
          ligne: cellule.ligne,
          colonne: cellule.colonne,
          valeur,
          valeurTexte: texte,
          auteurId,
        },
      });
    }
    return { enregistre: true };
  });
}

/** Combien de cellules sont renseignées, par tableau — pour l'afficher au chef BAC. */
export async function compterSaisiesParTableau(
  db: PrismaClient,
  periodeId: string
): Promise<Map<number, number>> {
  const groupes = await db.saisieCanevas.groupBy({
    by: ["numeroTableau"],
    where: { periodeId },
    _count: true,
  });
  return new Map(groupes.map((g) => [g.numeroTableau, g._count]));
}

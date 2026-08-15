/**
 * arrondissements.ts — les arrondissements viennent de la BASE, jamais du code.
 *
 * Pourquoi ce module
 * ------------------
 * Les six arrondissements de la Menoua étaient écrits en dur à quatre endroits :
 * le générateur du rapport mensuel, le fabricant des gabarits, l'export vers la
 * DREPIA et le remplissage trimestriel. Un autre département qui aurait généré
 * son rapport aurait reçu six colonnes intitulées DSCHANG, FOKOUE, FONGO TONGO…
 * — celles d'un territoire qui n'est pas le sien — et TOUTES VIDES : le code
 * cherchait ses chiffres sous des codes d'arrondissement qui n'existent pas
 * chez lui.
 *
 * La table `Arrondissement` est la source de vérité. Elle est cloisonnée par
 * département (lot 19) : la lire avec le client d'une session, c'est obtenir les
 * arrondissements de CE département, dans son ordre, sans qu'aucune ligne de
 * code ne les nomme.
 *
 * Ce module ne touche pas au canevas. L'ordre, les intitulés et la structure des
 * tableaux restent ceux du document officiel ; seule la liste des territoires
 * cesse d'être figée.
 */
import type { PrismaClient } from "@prisma/client";

export interface ArrondissementDuRapport {
  id: string;
  code: string;
  /** Le nom tel qu'il est saisi : « Fongo-Tongo ». */
  nom: string;
  /** Le nom tel que le canevas l'imprime : « FONGO TONGO ». */
  nomCanevas: string;
}

/**
 * La graphie du canevas officiel : majuscules, sans accent ni tiret.
 *
 * Elle était recopiée à la main dans deux tables de correspondance. Elle se
 * déduit du nom, et la déduction a été vérifiée sur les six arrondissements de
 * la Menoua — c'est l'objet d'un test, pas d'une confiance :
 *
 *   Dschang      → DSCHANG
 *   Fokoué       → FOKOUE
 *   Fongo-Tongo  → FONGO TONGO
 *   Nkong-Ni     → NKONG NI
 *   Penka-Michel → PENKA MICHEL
 *   Santchou     → SANTCHOU
 */
export function graphieCanevas(nom: string): string {
  return nom
    .normalize("NFD")
    // Les diacritiques décomposés par NFD : « é » devient « e » + accent.
    .replace(/[̀-ͯ]/g, "")
    // Le canevas sépare par une espace là où le nom porte un tiret.
    .replace(/[-‐-―]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Les arrondissements du département, dans l'ordre du canevas.
 *
 * `db` est le client de la session ou de la tâche appelante : c'est lui qui
 * détermine de quel département il s'agit.
 */
export async function listerArrondissements(db: PrismaClient): Promise<ArrondissementDuRapport[]> {
  const lignes = await db.arrondissement.findMany({
    orderBy: { ordre: "asc" },
    select: { id: true, code: true, nom: true },
  });
  return lignes.map((a) => ({ ...a, nomCanevas: graphieCanevas(a.nom) }));
}

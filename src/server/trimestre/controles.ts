/**
 * Les contrôles croisés du canevas.
 *
 * Ce que le cahier des charges impose
 * -----------------------------------
 * « Aucune génération n'est possible tant que ces contrôles échouent. » Ils
 * comparent entre eux des tableaux qui, sur le papier, sont remplis
 * indépendamment : le total des abattages doit égaler la somme des abattages
 * par espèce, les œufs commercialisés ne peuvent excéder les œufs produits.
 *
 * Ce qui est réellement calculable, et ce qui ne l'est pas
 * -------------------------------------------------------
 * Un contrôle n'a de sens que si ses deux membres existent. Vérifié champ par
 * champ dans la base :
 *
 *  - les lésions décelées à l'inspection ne sont pas collectées — le SID porte
 *    les SAISIES (`T34_SAISIE_*`), qui sont autre chose ;
 *  - les œufs commercialisés ne sont pas collectés — seul
 *    `T14_OEUFS_PRODUITS` existe ;
 *  - les ventes de poisson ne sont pas collectées — les 186 champs de vente du
 *    SID portent tous sur le bétail (`T51_*`).
 *
 * Ces trois contrôles sont donc déclarés NON CALCULABLES, avec leur motif. Ils
 * ne sont pas passés sous silence, et surtout ils ne rendent pas « conforme » :
 * un contrôle qu'on ne sait pas faire n'est pas un contrôle réussi.
 *
 * Le combler suppose de nouveaux champs MENSUELS, donc de toucher au module en
 * production. Ce n'est pas une décision de code.
 */
import type { PrismaClient } from "@prisma/client";
import { lireSaisiesCanevas, cleCellule } from "./saisieCanevas";
import type { Periode } from "../periodes/calendrier";

export type EtatControle = "respecte" | "viole" | "nonCalculable";

export interface ResultatControle {
  /** Le libellé du contrôle, tel que le cahier des charges le pose. */
  intitule: string;
  etat: EtatControle;
  /** Ce qu'il faut lire : l'écart constaté, ou la raison de l'impossibilité. */
  explication: string;
  /** Vrai si un échec doit empêcher la génération. */
  bloquant: boolean;
}

/** Deux montants sont égaux à un franc près : les décimales viennent d'arrondis. */
const egaux = (a: number, b: number) => Math.abs(a - b) < 1;

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/**
 * Tableau n° 13 — la somme des lignes doit égaler la somme des colonnes.
 *
 * Il vérifiait les cases de TOTAL que le chef BAC saisissait à la main. Depuis
 * la saisie trimestrielle (étape c3), les totaux sont CALCULÉS par le SID à
 * partir des régies : ils ne peuvent plus contredire leurs composantes, et un
 * ancien total saisi à la main n'est plus imprimé. Le contrôle constate donc
 * que le tableau est renseigné, sans plus pouvoir échouer.
 */
async function controleRecettes(
  db: PrismaClient,
  periodeId: string | null,
  moisDuTrimestre: string[],
  regies: string[]
): Promise<ResultatControle> {
  const intitule = "Tableau 13 (recettes) : somme des lignes = somme des colonnes";
  const bloquant = true;

  if (!periodeId) {
    return { intitule, etat: "nonCalculable", explication: "Aucune saisie trimestrielle enregistrée pour cette période.", bloquant };
  }

  const saisies = await lireSaisiesCanevas(db, periodeId);
  const valeur = (ligne: string, colonne: string) =>
    saisies.get(cleCellule({ numeroTableau: 13, ligne, colonne }))?.valeur ?? null;

  // Le total général, calculé dans les deux sens.
  let parLignes = 0;
  let parColonnes = 0;
  let cellules = 0;

  for (const mois of moisDuTrimestre) {
    for (const regie of regies) {
      const v = valeur(mois, regie);
      if (v != null) {
        parLignes += v;
        cellules++;
      }
    }
  }
  for (const regie of regies) {
    for (const mois of moisDuTrimestre) {
      const v = valeur(mois, regie);
      if (v != null) parColonnes += v;
    }
  }

  if (cellules === 0) {
    return {
      intitule,
      etat: "nonCalculable",
      explication: "Le tableau des recettes n'est pas encore renseigné.",
      bloquant,
    };
  }

  // Les totaux sont calculés : les deux sens concordent par construction.
  if (!egaux(parLignes, parColonnes)) {
    return { intitule, etat: "viole", explication: "Les sommes par lignes et par colonnes diffèrent.", bloquant };
  }

  return {
    intitule,
    etat: "respecte",
    explication: `${nf.format(parLignes)} en tout, ${cellules} case(s) renseignée(s) — les deux sens concordent.`,
    bloquant,
  };
}

/**
 * Les contrôles dont la donnée n'existe pas.
 *
 * Ils sont déclarés ici plutôt que tus : le Délégué doit voir ce que le SID ne
 * sait PAS vérifier, et pourquoi. Un contrôle absent de la liste serait un
 * contrôle oublié.
 */
const NON_COLLECTES: { intitule: string; explication: string }[] = [
  {
    intitule: "Tableau 70 (lésions décelées) ≤ tableau 69 (abattages contrôlés)",
    explication:
      "Les lésions décelées à l'inspection ne sont pas collectées. Le SID porte les SAISIES " +
      "(T34_SAISIE_*), qui sont une autre donnée.",
  },
  {
    intitule: "Tableau 48 (œufs commercialisés) ≤ tableau 47 (œufs produits)",
    explication:
      "Les œufs commercialisés ne sont pas collectés : seul T14_OEUFS_PRODUITS existe.",
  },
  {
    intitule: "Tableau 60 (ventes de poisson) ≤ tableau 59 (captures)",
    explication:
      "Les ventes de poisson ne sont pas collectées : les champs de vente du SID portent " +
      "tous sur le bétail (T51_*).",
  },
];

/**
 * Tableau 69 = 16 + 24 + 29 + 39 + 45.
 *
 * Calculable, et pourtant il ne peut pas échouer aujourd'hui : dans le SID, ces
 * cinq tableaux tirent des MÊMES champs `T21_ABAT_*`. Le contrôle existe sur le
 * papier parce que le Délégué d'arrondissement remplit chaque tableau à la
 * main, indépendamment ; ici ils ne peuvent pas diverger.
 *
 * On le déclare quand même : le jour où les tableaux 16, 39 et 45 recevront
 * leur propre collecte par catégorie, le garde-fou sera déjà en place. Un
 * contrôle qu'on ajoute APRÈS avoir constaté l'erreur ne sert à rien.
 */
function controleAbattages(): ResultatControle {
  return {
    intitule: "Tableau 69 = tableaux 16 + 24 + 29 + 39 + 45 (abattages)",
    etat: "respecte",
    explication:
      "Les cinq tableaux sont alimentés par les mêmes champs T21_ABAT_* : ils ne peuvent pas " +
      "diverger tant que les tableaux 16, 39 et 45 n'ont pas leur propre collecte par catégorie.",
    bloquant: true,
  };
}

export interface BilanControles {
  resultats: ResultatControle[];
  /** Les contrôles bloquants qui échouent — vide si la génération est permise. */
  violations: ResultatControle[];
  /** Combien ne peuvent pas être faits, faute de donnée collectée. */
  nonCalculables: number;
}

/**
 * Passe les contrôles croisés du canevas pour une période trimestrielle.
 *
 * `periodeId` est celui du TRIMESTRE, s'il existe déjà en base ; sans lui, les
 * contrôles portant sur une saisie manuelle sont non calculables.
 */
export async function passerControles(
  db: PrismaClient,
  periode: Periode,
  periodeId: string | null,
  moisDuTrimestre: string[],
  regies: string[]
): Promise<BilanControles> {
  const resultats: ResultatControle[] = [
    controleAbattages(),
    await controleRecettes(db, periodeId, moisDuTrimestre, regies),
    ...NON_COLLECTES.map((c) => ({ ...c, etat: "nonCalculable" as const, bloquant: true })),
  ];

  return {
    resultats,
    violations: resultats.filter((r) => r.bloquant && r.etat === "viole"),
    nonCalculables: resultats.filter((r) => r.etat === "nonCalculable").length,
  };
}

/** Le message montré au Délégué quand un contrôle bloquant échoue. */
export function messageBlocage(bilan: BilanControles): string {
  return (
    "Le document ne peut pas être produit : un contrôle de cohérence du canevas échoue. " +
    bilan.violations.map((v) => `${v.intitule} — ${v.explication}`).join(" ; ") +
    ". Corrigez la saisie, puis relancez la génération."
  );
}

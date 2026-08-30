/**
 * Remplissage des tableaux du canevas avec les valeurs consolidées.
 *
 * Fait le joint entre trois choses déjà construites et éprouvées :
 *   - le CANEVAS, qui dit quelles cases existent (canevas/) ;
 *   - la LIAISON, qui dit quel champ du SID alimente quelle case (liaison.ts) ;
 *   - le MOTEUR, qui dit combien vaut ce champ sur la période (agregation.ts).
 *
 * Aucune de ces trois pièces ne devine : une case n'est remplie que si sa
 * liaison a été écrite explicitement, et que le moteur a une valeur. Sinon la
 * case reste vide — jamais un zéro inventé, qui se confondrait avec un zéro
 * mesuré.
 */
import type { PrismaClient } from "@prisma/client";
import { type Periode, memePeriodeAnneePrecedente } from "../periodes/calendrier";
import { agreger, type ValeurAgregee } from "./agregation";
import { liaisonDe } from "./liaison";
import type { FournisseurValeur } from "./canevas/rendu";
import type { ContexteCanevas } from "./canevas/types";
import { listerArrondissements, graphieCanevas } from "../../lib/arrondissements";
import { lireSaisiesCanevas, cleCellule, type ValeurCellule } from "./saisieCanevas";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

export interface DonneesRemplissage {
  /** champ → arrondissement (ou null pour le département) → valeur */
  valeurs: Map<string, Map<string | null, number | null>>;
  /** Les mêmes, pour la même période de l'année précédente. */
  valeursN1: Map<string, Map<string | null, number | null>>;
  /** Nombre de cases que le moteur a su renseigner. */
  renseignees: number;
  /**
   * Nom d'arrondissement en graphie canevas → code du SID.
   *
   * Le canevas nomme les territoires, la consolidation les code : il faut faire
   * le joint. Il se faisait par POSITION, contre une liste des six codes de la
   * Menoua écrite en dur — ce qui supposait que le canevas et la base rangent
   * les arrondissements dans le même ordre, et n'avait aucun sens pour un autre
   * département. On apparie désormais sur le nom, quel que soit l'ordre.
   */
  codeParNom: Map<string, string>;
  /**
   * Les cellules saisies à la main — les treize tableaux du BAC. Vide tant que
   * la période trimestrielle n'existe pas encore en base.
   */
  saisies: Map<string, ValeurCellule>;
}

/**
 * Consolide la période et range les valeurs par champ et par arrondissement.
 * Ne calcule que les champs effectivement mobilisés par les liaisons : inutile
 * d'agréger 413 champs pour en placer une trentaine.
 */
export async function preparer(
  db: PrismaClient,
  periode: Periode,
  champs: string[],
  options: { autoriserIncomplet?: boolean; arrondissementId?: string } = {}
): Promise<DonneesRemplissage> {
  const vide = () => new Map<string, Map<string | null, number | null>>();

  // Les arrondissements du département de l'appelant — `db` porte le
  // cloisonnement, la liste est donc la sienne.
  const codeParNom = new Map(
    (await listerArrondissements(db)).map((a) => [a.nomCanevas, a.code] as const)
  );

  /*
   * Les cellules saisies à la main, si le trimestre existe déjà en base. On ne
   * le CRÉE pas ici : produire un aperçu ne doit pas matérialiser une période.
   */
  const trimestre = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: periode.annee, trimestre: periode.rang },
    select: { id: true },
  });
  const saisies = trimestre ? await lireSaisiesCanevas(db, trimestre.id) : new Map<string, ValeurCellule>();

  if (champs.length === 0) {
    return { valeurs: vide(), valeursN1: vide(), renseignees: 0, codeParNom, saisies };
  }

  const ranger = (agregees: ValeurAgregee[]) => {
    const m = vide();
    let n = 0;
    for (const v of agregees) {
      const parArr = m.get(v.fieldCode) ?? new Map<string | null, number | null>();
      m.set(v.fieldCode, parArr);
      parArr.set(v.arrondissementCode, v.valeur);
      if (v.valeur != null) n++;
    }
    return { m, n };
  };

  const courant = await agreger(db, periode, {
    champs,
    autoriserIncomplet: options.autoriserIncomplet,
    arrondissementId: options.arrondissementId,
  });

  // L'absence de l'année précédente ne doit pas empêcher de produire la période :
  // elle prive seulement le rapport de sa colonne et de sa ligne de comparaison.
  let precedent: ValeurAgregee[] = [];
  try {
    precedent = (await agreger(db, memePeriodeAnneePrecedente(periode), { champs, autoriserIncomplet: true })).valeurs;
  } catch {
    precedent = [];
  }

  const a = ranger(courant.valeurs);
  const b = ranger(precedent);
  return { valeurs: a.m, valeursN1: b.m, renseignees: a.n, codeParNom, saisies };
}

/**
 * Fournisseur de valeurs pour le rendu du canevas.
 *
 * Il doit répondre à une question simple — « que vaut la case (ligne, colonne)
 * du tableau n° X ? » — et connaître pour cela l'orientation du tableau :
 * selon que les arrondissements sont en lignes ou en colonnes, c'est la ligne
 * ou la colonne qui porte le territoire, et l'autre qui porte la catégorie.
 */
export function fournisseur(donnees: DonneesRemplissage, ctx: ContexteCanevas): FournisseurValeur {
  /** Nom d'arrondissement → code, pour retrouver la valeur consolidée. */
  const codeDe = new Map<string, string>();
  // Appariement par le NOM, ramené à la graphie du canevas de part et d'autre.
  // L'appariement par position exigeait que le canevas et la base rangent les
  // arrondissements dans le même ordre, et reposait sur les six codes de la
  // Menoua écrits en dur.
  ctx.arrondissements.forEach((nom) => codeDe.set(nom, donnees.codeParNom.get(graphieCanevas(nom)) ?? nom));

  const totalN1 = `TOTAL ${ctx.periodeCourtN1}`;
  const totalCourant = `TOTAL ${ctx.periodeCourt}`;

  /** La valeur d'un champ pour un territoire, dans la période demandée. */
  const lire = (champ: string, arr: string | null, n1: boolean): number | null =>
    (n1 ? donnees.valeursN1 : donnees.valeurs).get(champ)?.get(arr) ?? null;

  return ({ numeroTableau, ligne, colonne }) => {
    // Les tableaux du BAC sont saisis à la main : ils ne viennent d'aucun mois,
    // et rien ne les alimenterait autrement. On les sert AVANT la liaison —
    // sans conflit possible, puisqu'un tableau saisi à la main n'en a pas.
    if (numeroTableau != null) {
      const saisie = donnees.saisies.get(cleCellule({ numeroTableau, ligne, colonne }));
      if (saisie) {
        // Même format que les valeurs consolidées : le lecteur ne doit pas voir
        // à l'œil quelles cases ont été saisies et lesquelles sont calculées.
        if (saisie.valeur != null) return nf.format(saisie.valeur);
        if (saisie.texte) return saisie.texte;
      }
    }

    const liaison = liaisonDe(numeroTableau);
    if (!liaison) return null;

    const territoire = liaison.orientation === "lignes" ? ligne : colonne;
    const categorie = liaison.orientation === "lignes" ? colonne : ligne;

    // --- Colonnes (ou lignes) de total : la somme des catégories liées ------
    // Le canevas place « TOTAL {période} » en bout de tableau. Ce n'est pas une
    // catégorie : c'est la somme de celles de la ligne. La sommer sur les seules
    // catégories LIÉES serait trompeur si d'autres ne le sont pas encore ; on ne
    // la calcule donc que si TOUTES les catégories du tableau ont un champ.
    const toutesLiees = liaison.correspondances.every((c) => c.champ);
    if (categorie === totalCourant || categorie === totalN1) {
      if (!toutesLiees) return null;
      // L'année de référence peut venir de la COLONNE (« TOTAL {P-1} » en bout
      // de ligne) comme de la LIGNE (le pied « TOTAL {P-1} »). Croiser les deux
      // doit donner l'an passé, pas l'année courante.
      const n1 = categorie === totalN1 || territoire === totalN1;
      const arr = /^TOTAL/i.test(territoire) ? null : (codeDe.get(territoire) ?? null);
      if (!arr && !/^TOTAL/i.test(territoire)) return null;
      let somme: number | null = null;
      for (const c of liaison.correspondances) {
        const v = lire(c.champ!, arr, n1);
        if (v != null) somme = (somme ?? 0) + v;
      }
      return somme == null ? null : nf.format(somme);
    }

    const corr = liaison.correspondances.find((c) => c.libelle === categorie);
    if (!corr?.champ) return null;

    // --- Lignes de total, d'écart, et de comparaison N-1 --------------------
    if (territoire === totalN1) {
      const v = lire(corr.champ, null, true);
      return v == null ? null : nf.format(v);
    }
    if (territoire === totalCourant || /^TOTAL/i.test(territoire)) {
      const v = lire(corr.champ, null, false);
      return v == null ? null : nf.format(v);
    }
    if (/^ÉCART/i.test(territoire)) {
      const a = lire(corr.champ, null, false);
      const b = lire(corr.champ, null, true);
      if (a == null || b == null || b === 0) return null;
      const ecart = ((a - b) / b) * 100;
      const signe = ecart > 0 ? "+" : ecart < 0 ? "−" : "";
      return `${signe}${nf.format(Math.round(Math.abs(ecart) * 10) / 10)} %`;
    }

    const code = codeDe.get(territoire);
    if (!code) return null;
    const v = lire(corr.champ, code, false);
    return v == null ? null : nf.format(v);
  };
}

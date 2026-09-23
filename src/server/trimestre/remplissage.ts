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
import { liaisonDe, evaluer, estLiee, type Correspondance, type Formule } from "./liaison";
import { colonnesDe, type FournisseurValeur } from "./canevas/rendu";
import { clesLignes, estTotal, estEcart } from "./canevas/structure";
import { repriseDe } from "./canevas/reprises";
import type { Bloc, ContexteCanevas } from "./canevas/types";
import { listerArrondissements, graphieCanevas } from "../../lib/arrondissements";
import { saisiesVues, cleCellule, type ValeurCellule } from "./saisieCanevas";
import { numerosSansMaille } from "./canevas/sections";
import { preparerEvenements, liaisonEvenementDe, type DonneesEvenements } from "./evenements";

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });

/** Une case formatée à la française redevient un nombre ; un pourcentage n'en est pas un. */
export function versNombre(s: string | null | undefined): number | null {
  if (s == null || /%/.test(s)) return null;
  const n = Number(s.replace(/[\s\u202f\u00a0]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Écart relatif à l'an passé, en pourcentage signé. Vide si l'an passé manque ou vaut zéro. */
function ecartEnPourcentage(a: number | null, b: number | null): string | null {
  if (a == null || b == null || b === 0) return null;
  const ecart = ((a - b) / b) * 100;
  const signe = ecart > 0 ? "+" : ecart < 0 ? "−" : "";
  return `${signe}${nf.format(Math.round(Math.abs(ecart) * 10) / 10)} %`;
}

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
  /** Les mêmes, pour le même trimestre de l'an passé : elles nourrissent les totaux N-1. */
  saisiesN1: Map<string, ValeurCellule>;
  /** Les listes du mensuel additionnées : vaccinations, cliniques, circulation. */
  evenements: DonneesEvenements;
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
  options: {
    autoriserIncomplet?: boolean;
    arrondissementId?: string;
    /**
     * Ne pas consolider les mois. L'écran de saisie d'un tableau purement
     * saisi n'a besoin que des saisies : inutile d'agréger tout le trimestre.
     */
    sansAgregation?: boolean;
  } = {}
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
  // Le rapport d'un arrondissement lit SA version des tableaux sans maille.
  const sansMaille = numerosSansMaille();
  const saisies = trimestre
    ? await saisiesVues(db, trimestre.id, options.arrondissementId, sansMaille)
    : new Map<string, ValeurCellule>();
  const n1 = memePeriodeAnneePrecedente(periode);
  const trimestreN1 = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: n1.annee, trimestre: n1.rang },
    select: { id: true },
  });
  const saisiesN1 = trimestreN1
    ? await saisiesVues(db, trimestreN1.id, options.arrondissementId, sansMaille)
    : new Map<string, ValeurCellule>();

  if (options.sansAgregation) {
    const aucun: DonneesEvenements = { courant: new Map(), precedent: new Map(), nonClassees: [] };
    return { valeurs: vide(), valeursN1: vide(), renseignees: 0, codeParNom, saisies, saisiesN1, evenements: aucun };
  }

  const evenements = await preparerEvenements(db, periode, { arrondissementId: options.arrondissementId });

  if (champs.length === 0) {
    return { valeurs: vide(), valeursN1: vide(), renseignees: 0, codeParNom, saisies, saisiesN1, evenements };
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
  return { valeurs: a.m, valeursN1: b.m, renseignees: a.n, codeParNom, saisies, saisiesN1, evenements };
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

  /**
   * Une case d'un tableau alimenté par les listes du mensuel (evenements.ts).
   * Même logique de territoires, de totaux et d'écart que les autres tableaux.
   */
  const valeurEvenement = (
    numero: number,
    orientation: "lignes" | "colonnes",
    ligne: string,
    colonne: string
  ): string | null => {
    const territoire = orientation === "lignes" ? ligne : colonne;
    const categorie = orientation === "lignes" ? colonne : ligne;
    const cases = (n1: boolean) => (n1 ? donnees.evenements.precedent : donnees.evenements.courant).get(numero);
    const total = (arr: string | null, n1: boolean) => cases(n1)?.totaux.get(arr) ?? null;
    const nombre = (cat: string, arr: string | null, n1: boolean) => cases(n1)?.nombres.get(cat)?.get(arr) ?? null;
    const format = (v: number | null) => (v == null ? null : nf.format(v));

    // Le territoire : un arrondissement, le département (lignes TOTAL), ou l'écart.
    const estEcart = /^ÉCART/i.test(territoire);
    const n1Ligne = territoire === totalN1;
    const arr = /^TOTAL/i.test(territoire) || estEcart ? null : (codeDe.get(territoire) ?? undefined);
    if (arr === undefined) return null;

    // Colonne (ou ligne) TOTAL : toutes les lignes de la source.
    if (/^TOTAL/i.test(categorie)) {
      if (estEcart) return categorie === totalN1 ? null : ecartEnPourcentage(total(null, false), total(null, true));
      return format(total(arr, categorie === totalN1 || n1Ligne));
    }
    // Case de texte : les valeurs distinctes, dans l'ordre alphabétique.
    const textes = cases(false)?.textes.get(categorie);
    if (textes) {
      if (arr === null) return null;
      const s = textes.get(arr);
      return s && s.size ? Array.from(s).sort((a, b) => a.localeCompare(b, "fr")).join(" ; ") : null;
    }
    if (estEcart) return ecartEnPourcentage(nombre(categorie, null, false), nombre(categorie, null, true));
    return format(nombre(categorie, arr, n1Ligne));
  };

  /** La valeur d'une formule pour un territoire. */
  const calculer = (f: Formule, arr: string | null, n1: boolean) => evaluer(f, (champ) => lire(champ, arr, n1));

  /** Code d'arrondissement → nom, pour relire une saisie (repérée par le nom). */
  const nomDe = new Map(Array.from(codeDe.entries()).map(([nom, code]) => [code, nom] as const));

  /**
   * Une case tirée d'une SAISIE d'un autre tableau — la viande d'une catégorie,
   * à partir de ses abattages. Au département, la somme des arrondissements.
   */
  const depuisSaisie = (d: NonNullable<Correspondance["depuisSaisie"]>, arr: string | null, n1: boolean): number | null => {
    const source = n1 ? donnees.saisiesN1 : donnees.saisies;
    const noms = arr == null ? ctx.arrondissements : [nomDe.get(arr) ?? arr];
    let somme: number | null = null;
    for (const nom of noms) {
      const v = source.get(cleCellule({ numeroTableau: d.tableau, ligne: nom, colonne: d.colonne }))?.valeur;
      if (v != null) somme = (somme ?? 0) + v;
    }
    return somme == null ? null : Math.round(somme * d.facteur * 1e9) / 1e9;
  };

  /** La valeur d'une case liée : son champ, sa formule, ou une saisie d'un autre tableau. */
  const valeurDe = (c: Correspondance, arr: string | null, n1: boolean): number | null =>
    c.depuisSaisie
      ? depuisSaisie(c.depuisSaisie, arr, n1)
      : c.formule
        ? calculer(c.formule, arr, n1)
        : c.champ
          ? lire(c.champ, arr, n1)
          : null;

  /** Une case saisie, telle qu'elle s'affiche — ou, à défaut, reprise d'un autre tableau. */
  const saisieAffichee = (numeroTableau: number, ligne: string, colonne: string): string | null => {
    const saisie = donnees.saisies.get(cleCellule({ numeroTableau, ligne, colonne }));
    // Même format que les valeurs consolidées : le lecteur ne doit pas voir
    // à l'œil quelles cases ont été saisies et lesquelles sont calculées.
    if (saisie?.valeur != null) return nf.format(saisie.valeur);
    if (saisie?.texte) return saisie.texte;
    const r = valeurReprise(donnees.saisies, numeroTableau, ligne, colonne);
    return r == null ? null : nf.format(r);
  };

  /**
   * Les TOTAUX d'un tableau saisi : la somme des cases qui les précèdent sur
   * leur axe (les régies avant la colonne TOTAL, les arrondissements avant la
   * ligne TOTAL), et l'écart entre les deux années. Un total n'est jamais saisi.
   *
   * Rend `undefined` si le total mêle des cases saisies et des cases
   * calculées : additionner des animaux vendus et des tonnes de viande, au
   * motif qu'elles partagent une ligne, ne donnerait rien de juste.
   */
  const totalDesSaisies = (
    bloc: Extract<Bloc, { type: "tableau" }>,
    ligne: string,
    colonne: string
  ): string | null | undefined => {
    const numero = bloc.numero!;
    const lignes = clesLignes(bloc, ctx);
    const colonnes = colonnesDe(bloc, ctx).slice(1);
    const IMPUR = "impur" as const;
    type Resultat = number | null | typeof IMPUR;

    const saisi = (l: string, c: string, n1: boolean): Resultat => {
      const source = n1 ? donnees.saisiesN1 : donnees.saisies;
      return source.get(cleCellule({ numeroTableau: numero, ligne: l, colonne: c }))?.valeur ?? valeurReprise(source, numero, l, c);
    };
    const mixtes = Boolean(liaisonEvenementDe(numero)?.totauxMixtes);

    const cellule = (l: string, c: string, n1: boolean): Resultat => {
      if (estTotal(l) || estTotal(c)) return total(l, c, n1);
      if (estCaseCalculee(numero, l, c, ctx)) {
        // Des cas comptés et des cas saisis sont de même nature : ils
        // s'additionnent. Des animaux et des tonnes, non.
        if (!mixtes || n1) return IMPUR;
        return versNombre(valeurCalculee(numero, l, c));
      }
      return saisi(l, c, n1);
    };

    function total(l: string, c: string, n1: boolean): Resultat {
      if (estEcart(l) || estEcart(c)) return null;
      const surLigne = estTotal(l);
      const axe = surLigne ? lignes : colonnes;
      const repere = surLigne ? l : c;
      const composantes = axe.slice(0, Math.max(0, axe.indexOf(repere))).filter((x) => !estTotal(x));
      const annee = n1 || repere === totalN1;
      let somme: number | null = null;
      for (const x of composantes) {
        const v = surLigne ? cellule(x, c, annee) : cellule(l, x, annee);
        if (v === IMPUR) return IMPUR;
        if (v != null) somme = (somme ?? 0) + v;
      }
      return somme;
    }

    // L'écart compare les deux lignes (ou colonnes) de total de la période.
    const ecart = (a: Resultat, b: Resultat) => (a === IMPUR || b === IMPUR ? undefined : ecartEnPourcentage(a, b));
    if (estEcart(ligne)) return ecart(total(totalCourant, colonne, false), total(totalN1, colonne, true));
    if (estEcart(colonne)) return ecart(total(ligne, totalCourant, false), total(ligne, totalN1, true));

    const v = total(ligne, colonne, false);
    if (v === IMPUR) return undefined;
    return v == null ? null : nf.format(v);
  };

  /**
   * Une case que le SID calcule à partir du mensuel. Un tableau peut tirer une
   * même case de DEUX sources — les saisies des marchés (champs du tableau
   * 3.4) et celles des abattoirs (liste du tableau 3.5) : elles s'additionnent.
   */
  function valeurCalculee(numeroTableau: number, ligne: string, colonne: string): string | null {
    const evenement = liaisonEvenementDe(numeroTableau);
    const deLaListe = evenement && couvreEvenement(evenement, ligne, colonne)
      ? valeurEvenement(evenement.numero, evenement.orientation, ligne, colonne)
      : null;
    const liaison = liaisonDe(numeroTableau);
    const desChamps = liaison && couvreLiaison(liaison, ligne, colonne, ctx) ? valeurLiee(numeroTableau, ligne, colonne) : null;
    if (deLaListe == null) return desChamps;
    if (desChamps == null) return deLaListe;
    const a = versNombre(deLaListe), b = versNombre(desChamps);
    return a == null || b == null ? deLaListe : nf.format(Math.round((a + b) * 1e9) / 1e9);
  }

  /** Une case d'un tableau lié à des champs du mensuel. */
  function valeurLiee(numeroTableau: number, ligne: string, colonne: string): string | null {
    const liaison = liaisonDe(numeroTableau);
    if (!liaison) return null;

    const territoire = liaison.orientation === "lignes" ? ligne : colonne;
    const categorie = liaison.orientation === "lignes" ? colonne : ligne;

    // --- Colonnes (ou lignes) de total : la somme des catégories liées ------
    // Le canevas place « TOTAL {période} » en bout de tableau. Ce n'est pas une
    // catégorie : c'est la somme de celles de la ligne. La sommer sur les seules
    // catégories LIÉES serait trompeur si d'autres ne le sont pas encore ; on ne
    // la calcule donc que si TOUTES les catégories du tableau ont un champ.
    // Quand le mensuel porte le TOTAL sans le détail (cheptel bovin : l'effectif,
    // pas les catégories), la liaison le dit par `total` et c'est lui qui sert.
    const toutesLiees = liaison.correspondances.every(estLiee);
    if (categorie === totalCourant || categorie === totalN1) {
      if (!liaison.total && !toutesLiees) return null;
      // Le total, au département, d'une année donnée.
      const totalDepartement = (n1: boolean): number | null => {
        if (liaison.total) return calculer(liaison.total, null, n1);
        let s: number | null = null;
        for (const c of liaison.correspondances) {
          const v = valeurDe(c, null, n1);
          if (v != null) s = (s ?? 0) + v;
        }
        return s;
      };
      // Croisement de la colonne TOTAL et de la ligne ÉCART.
      if (/^ÉCART/i.test(territoire)) {
        return categorie === totalCourant ? ecartEnPourcentage(totalDepartement(false), totalDepartement(true)) : null;
      }
      // L'année de référence peut venir de la COLONNE (« TOTAL {P-1} » en bout
      // de ligne) comme de la LIGNE (le pied « TOTAL {P-1} »). Croiser les deux
      // doit donner l'an passé, pas l'année courante.
      const n1 = categorie === totalN1 || territoire === totalN1;
      const arr = /^TOTAL/i.test(territoire) ? null : (codeDe.get(territoire) ?? null);
      if (!arr && !/^TOTAL/i.test(territoire)) return null;
      if (liaison.total) {
        const v = calculer(liaison.total, arr, n1);
        return v == null ? null : nf.format(v);
      }
      let somme: number | null = null;
      for (const c of liaison.correspondances) {
        const v = valeurDe(c, arr, n1);
        if (v != null) somme = (somme ?? 0) + v;
      }
      return somme == null ? null : nf.format(somme);
    }

    const corr = liaison.correspondances.find((c) => c.libelle === categorie);
    if (!corr || !estLiee(corr)) return null;

    // --- Lignes de total, d'écart, et de comparaison N-1 --------------------
    if (territoire === totalN1) {
      const v = valeurDe(corr, null, true);
      return v == null ? null : nf.format(v);
    }
    if (territoire === totalCourant || /^TOTAL/i.test(territoire)) {
      const v = valeurDe(corr, null, false);
      return v == null ? null : nf.format(v);
    }
    if (/^ÉCART/i.test(territoire)) {
      return ecartEnPourcentage(valeurDe(corr, null, false), valeurDe(corr, null, true));
    }

    const code = codeDe.get(territoire);
    if (!code) return null;
    const v = valeurDe(corr, code, false);
    return v == null ? null : nf.format(v);
  };

  return ({ numeroTableau, ligne, colonne, bloc }) => {
    if (numeroTableau == null) return null;
    // 1. Ce que le SID calcule à partir du mensuel ne se saisit pas.
    if (estCaseCalculee(numeroTableau, ligne, colonne, ctx)) return valeurCalculee(numeroTableau, ligne, colonne);
    // 2. Les totaux et écarts des cases saisies se calculent.
    if (bloc && (estTotal(ligne) || estTotal(colonne))) {
      const t = totalDesSaisies(bloc, ligne, colonne);
      if (t !== undefined && t !== null) return t;
    }
    // 3. Le reste est saisi — y compris, faute de mieux, un total saisi à la
    //    main avant que les totaux ne soient calculés.
    return saisieAffichee(numeroTableau, ligne, colonne);
  };
}

/**
 * La case est-elle calculée par le SID à partir du mensuel ? Elle ne se
 * saisit alors pas : la saisir créerait deux sources pour un même chiffre.
 *
 *  - un tableau alimenté par les listes du mensuel l'est entièrement ;
 *  - dans un tableau lié, la catégorie liée l'est, et sa colonne TOTAL si le
 *    mensuel porte le total ou si toutes les catégories sont liées.
 */
export function estCaseCalculee(numeroTableau: number, ligne: string, colonne: string, ctx: ContexteCanevas): boolean {
  const evenement = liaisonEvenementDe(numeroTableau);
  if (evenement && couvreEvenement(evenement, ligne, colonne)) return true;
  const liaison = liaisonDe(numeroTableau);
  if (!liaison) return false;
  if (liaison.entierementCalcule) return true;
  return couvreLiaison(liaison, ligne, colonne, ctx);
}

/** La liste du mensuel alimente-t-elle cette case ? Toutes, sauf si elle n'en alimente qu'une partie. */
function couvreEvenement(e: NonNullable<ReturnType<typeof liaisonEvenementDe>>, ligne: string, colonne: string): boolean {
  if (!e.categoriesProduites) return true;
  return e.categoriesProduites.includes(e.orientation === "lignes" ? colonne : ligne);
}

/** Les champs du mensuel alimentent-ils cette case ? */
function couvreLiaison(liaison: NonNullable<ReturnType<typeof liaisonDe>>, ligne: string, colonne: string, ctx: ContexteCanevas): boolean {
  const categorie = liaison.orientation === "lignes" ? colonne : ligne;
  const totaux = [`TOTAL ${ctx.periodeCourt}`, `TOTAL ${ctx.periodeCourtN1}`];
  if (totaux.includes(categorie)) return Boolean(liaison.total) || liaison.correspondances.every(estLiee);
  const corr = liaison.correspondances.find((c) => c.libelle === categorie);
  return Boolean(corr && estLiee(corr));
}

/**
 * La valeur REPRISE d'un autre tableau (reprises.ts) : les infrastructures du
 * BAC, recopiées dans celles de l'élevage bovin. Null si rien n'y est saisi.
 */
export function valeurReprise(
  saisies: Map<string, ValeurCellule>,
  numeroTableau: number,
  ligne: string,
  colonne: string
): number | null {
  const r = repriseDe(numeroTableau, ligne);
  if (!r) return null;
  let somme: number | null = null;
  for (const l of r.lignesSource) {
    const v = saisies.get(cleCellule({ numeroTableau: r.source, ligne: l, colonne }))?.valeur;
    if (v != null) somme = (somme ?? 0) + v;
  }
  return somme;
}

/**
 * Liaison entre les cases du canevas et les champs du SID.
 *
 * Le canevas dit où va la donnée ; le SID dit d'où elle vient. Ce fichier est
 * le pont entre les deux, et il est délibérément EXPLICITE : chaque case
 * remplie l'est parce qu'une correspondance a été écrite ici, jamais parce
 * qu'un nom ressemblait à un autre. Une case sans correspondance reste vide,
 * comme sur la fiche papier.
 *
 * DÉCISION DU DÉLÉGUÉ, 14 août 2026 : LE MENSUEL NE BOUGE PAS. Il fonctionne,
 * il est en production, et il ne sera pas étendu pour alimenter le trimestriel.
 * En particulier, la collecte des abattages par catégorie d'animal — que
 * réclame le tableau n° 16 — est abandonnée.
 *
 * CONSÉQUENCE : on lie tout ce que les champs EXISTANTS permettent de lier, et
 * pas une case de plus. Là où le canevas régional demande un détail que le
 * mensuel ne saisit pas — les abattages bovins par catégorie, les pisciculteurs,
 * les espèces de poisson, les ruches — la case reste vide et le Délégué la
 * remplit à la main. C'est un choix assumé, pas un travail inachevé.
 *
 * On ne remplit que ce dont on est sûr. Un chiffre placé dans la mauvaise case
 * est pire qu'une case vide : la case vide se voit, l'erreur non.
 */
import type { RegleAgregation } from "./reglesChamps";

/**
 * Une correspondance : un libellé du canevas — une catégorie en colonne ou en
 * ligne — et le champ du SID qui la porte.
 */
export interface Correspondance {
  /** Libellé exact tel qu'il figure au canevas. */
  libelle: string;
  /** Code du champ du SID, ou null si la donnée n'est pas collectée. */
  champ: string | null;
  /**
   * La case se CALCULE à partir de plusieurs champs — une somme, une norme de
   * carcasse, une conversion d'unité, un produit quantité × prix. Exclusif de
   * `champ`, qui vaut alors null.
   */
  formule?: Formule;
  /**
   * La case se calcule à partir d'une SAISIE TRIMESTRIELLE d'un autre tableau
   * — la viande d'une catégorie, à partir de ses abattages saisis. Même
   * territoire, colonne `colonne` du tableau `tableau`, multipliée par
   * `facteur`.
   */
  depuisSaisie?: { tableau: number; colonne: string; facteur: number; explication: string };
  /** Pourquoi il n'y a pas de champ, le cas échéant. */
  motif?: string;
}

/**
 * Le calcul d'une case à partir de champs du SID. Par défaut : la somme des
 * champs renseignés, multipliée par `facteur`. Une case dont AUCUN champ n'est
 * renseigné reste vide — jamais un zéro inventé.
 */
export interface Formule {
  /** Les champs lus. Ce sont aussi ceux que le moteur doit agréger. */
  champs: string[];
  /** Multiplicateur de la somme : norme de carcasse, conversion d'unité. */
  facteur?: number;
  /** Calcul particulier, quand une somme ne suffit pas. */
  calcul?: (lire: (champ: string) => number | null) => number | null;
  /** D'où vient le calcul, en clair. */
  explication: string;
}

/** Les champs dont dépend une correspondance. */
export function champsDe(c: Correspondance): string[] {
  if (c.formule) return c.formule.champs;
  return c.champ ? [c.champ] : [];
}

/** Une correspondance est liée si au moins un champ l'alimente. */
export const estLiee = (c: Correspondance) => champsDe(c).length > 0 || Boolean(c.depuisSaisie);

/** La valeur d'une formule, à partir d'un lecteur de champs agrégés. */
export function evaluer(f: Formule, lire: (champ: string) => number | null): number | null {
  return sansBruit(f.calcul ? f.calcul(lire) : sommeLue(f, lire));
}

function sommeLue(f: Formule, lire: (champ: string) => number | null): number | null {
  let somme: number | null = null;
  for (const champ of f.champs) {
    const v = lire(champ);
    if (v != null) somme = (somme ?? 0) + v;
  }
  return somme == null ? null : somme * (f.facteur ?? 1);
}

/**
 * Efface le bruit de la virgule flottante : 100 × 0,07 vaut 7,000000000000001
 * en machine. Neuf décimales suffisent largement à tout ce que publie le canevas.
 */
const sansBruit = (v: number | null) => (v == null ? null : Math.round(v * 1e9) / 1e9);

// ============================================================================
// OUTILS DE CALCUL
// ============================================================================

/**
 * Poids de carcasse par tête, en kg — NORMES DU DÉLÉGUÉ (23 septembre 2026) :
 * « un bovin, c'est 60 % de 250 kg ; pour un porc la carcasse pèse 70 kg ; pour
 * un petit ruminant c'est 20 kg ; pour la volaille c'est 2 kg ».
 *
 * La production de viande du canevas se CALCULE ainsi : abattages contrôlés ×
 * poids de carcasse. Le champ « viande » que l'agent saisit au tableau 2.2 du
 * mensuel n'est pas repris : deux sources pour un même chiffre finiraient par
 * se contredire.
 */
export const CARCASSE_KG = {
  bovin: 0.6 * 250,
  porc: 70,
  petitRuminant: 20,
  volaille: 2,
} as const;

/** Production de viande en tonnes : abattages × poids de carcasse. */
function viande(champAbattages: string, kgParTete: number): Formule {
  return {
    champs: [champAbattages],
    facteur: kgParTete / 1000,
    explication: `abattages contrôlés × ${kgParTete} kg de carcasse par tête (norme du Délégué), en tonnes`,
  };
}

/** Somme simple de champs, avec au besoin une conversion d'unité. */
function somme(champs: string[], explication: string, facteur?: number): Formule {
  return { champs, facteur, explication };
}

/**
 * Les champs « vendus » d'une catégorie, sur les trois destinations du mensuel
 * (D1, D2, D3). « MEV » — mis en vente — n'est pas repris : le canevas compte
 * ce qui est VENDU.
 */
const vendusDe = (prefixe: string, categorie: string) =>
  ["D1", "D2", "D3"].map((d) => `${prefixe}_${categorie}_VENDU_${d}`);

/** Nombre d'animaux vendus, toutes catégories et destinations confondues. */
function vendus(prefixe: string, categories: string[]): Formule {
  return somme(
    categories.flatMap((c) => vendusDe(prefixe, c)),
    "nombre d'animaux vendus au cours de la période, toutes destinations"
  );
}

/**
 * Ressources générées : pour chaque catégorie, nombre vendu × prix moyen, puis
 * la somme des catégories. Une catégorie VENDUE sans prix rend la case vide :
 * une somme qui l'omettrait serait fausse sans le dire.
 */
function ressources(prefixe: string, categories: string[], diviseur = 1): Formule {
  const champs = categories.flatMap((c) => [...vendusDe(prefixe, c), `${prefixe}_${c}_PRIX_MOYEN`]);
  return {
    champs,
    explication: "somme, par catégorie, du nombre vendu × prix moyen",
    calcul: (lire) => {
      let total: number | null = null;
      for (const c of categories) {
        const n = evaluer(somme(vendusDe(prefixe, c), ""), lire);
        if (n == null) continue;
        total = total ?? 0;
        if (n === 0) continue;
        const prix = lire(`${prefixe}_${c}_PRIX_MOYEN`);
        if (prix == null) return null;
        total += n * prix;
      }
      return total == null ? null : total / diviseur;
    },
  };
}

/** Prix moyen pondéré : ressources générées ÷ nombre vendu. */
function prixMoyen(prefixe: string, categories: string[]): Formule {
  const r = ressources(prefixe, categories);
  const n = vendus(prefixe, categories);
  return {
    champs: r.champs,
    explication: "ressources générées ÷ nombre d'animaux vendus",
    calcul: (lire) => {
      const total = evaluer(r, lire);
      const effectif = evaluer(n, lire);
      return total == null || !effectif ? null : total / effectif;
    },
  };
}

/** Viande d'une catégorie : ses abattages saisis au trimestre × poids de carcasse. */
function viandeDeLaCategorie(libelle: string, tableauAbattages: number, colonneAbattages: string, kgParTete: number): Correspondance {
  return {
    libelle,
    champ: null,
    depuisSaisie: {
      tableau: tableauAbattages,
      colonne: colonneAbattages,
      facteur: kgParTete / 1000,
      explication: `abattages de la catégorie (tableau n° ${tableauAbattages}) × ${kgParTete} kg de carcasse, en tonnes`,
    },
  };
}

/** Correspondance non collectée par le mensuel. */
const nonCollecte = (libelle: string, motif: string): Correspondance => ({ libelle, champ: null, motif });
const PAR_CATEGORIE = "Le mensuel ne détaille pas par catégorie : saisie trimestrielle.";

/**
 * La liaison d'un tableau du canevas.
 *
 * `orientation` dit où sont les arrondissements :
 *   « lignes »   — un arrondissement par ligne, les catégories en colonnes ;
 *   « colonnes » — un arrondissement par colonne, les catégories en lignes.
 */
export interface LiaisonTableau {
  numero: number;
  titre: string;
  orientation: "lignes" | "colonnes";
  correspondances: Correspondance[];
  /**
   * La colonne (ou ligne) « TOTAL » de chaque territoire, quand le mensuel
   * porte le total sans le détail. Le cheptel bovin en est l'exemple : le
   * mensuel donne l'effectif, pas les catégories. Sans cela, le total ne se
   * calcule que si TOUTES les catégories sont liées.
   */
  total?: Formule;
  /**
   * Aucune case du tableau ne se saisit, même celles qu'aucune source
   * n'alimente : c'est le cas de la viande, que le Délégué veut uniquement
   * CALCULÉE à partir des abattages.
   */
  entierementCalcule?: boolean;
}

/**
 * Tableau n° 69 — Situation des abattages contrôlés.
 *
 * Le seul tableau du canevas dont TOUTES les catégories collectées se
 * retrouvent telles quelles dans le mensuel : le tableau 2.1 du canevas
 * mensuel porte une colonne par espèce, arrondissement par arrondissement.
 *
 * Équins et asins ne sont pas collectés : le tableau 2.1 ne les prévoit pas.
 * Leurs colonnes sortiront vides, et c'est exact — le SID ne sait pas.
 */
const ABATTAGES_CONTROLES: LiaisonTableau = {
  numero: 69,
  titre: "Situation des abattages contrôlés",
  orientation: "lignes",
  correspondances: [
    { libelle: "Bovins", champ: "T21_ABAT_BOVIN" },
    { libelle: "Ovins", champ: "T21_ABAT_OVIN" },
    { libelle: "Caprins", champ: "T21_ABAT_CAPRIN" },
    { libelle: "Porcins", champ: "T21_ABAT_PORCIN" },
    { libelle: "Equins", champ: null, motif: "Le tableau 2.1 du canevas mensuel ne porte pas d'équidés." },
    { libelle: "Volaille", champ: "T21_ABAT_VOLAILLE" },
    { libelle: "Asins", champ: null, motif: "Le tableau 2.1 du canevas mensuel ne porte pas d'asins." },
  ],
};

/**
 * Tableau n° 61 — Situation de l'aquaculture.
 * Le tableau 1.7 du mensuel porte le nombre d'étangs et la superficie ;
 * le reste — pisciculteurs, bacs hors sol, volume, stations d'alevinage —
 * n'est pas collecté.
 */
const AQUACULTURE: LiaisonTableau = {
  numero: 61,
  titre: "Situation de l’aquaculture",
  orientation: "lignes",
  correspondances: [
    { libelle: "Nombre de pisciculteurs", champ: null, motif: "Non collecté par le mensuel." },
    { libelle: "Nombre étangs actifs", champ: "T17_NB_ETANGS" },
    { libelle: "Superficie", champ: "T17_SUPERFICIE" },
    { libelle: "Bacs hors sol", champ: null, motif: "Non collecté par le mensuel." },
    { libelle: "Volume (m3)", champ: null, motif: "Non collecté par le mensuel." },
    { libelle: "Stations d’alevinage", champ: null, motif: "Non collecté par le mensuel." },
  ],
};

/**
 * Tableau n° 20 — Synthèse de l'exploitation du lait.
 * Le tableau 2.5 du mensuel porte le lait frais, le 2.6 les produits
 * transformés. Les quatre colonnes du canevas trouvent leur champ.
 */
const EXPLOITATION_LAIT: LiaisonTableau = {
  numero: 20,
  titre: "Synthèse de l’exploitation du lait",
  orientation: "lignes",
  correspondances: [
    { libelle: "Production de lait frais", champ: "T25_LAIT_FRAIS" },
    { libelle: "Lait caillé", champ: "T26_LAIT_CAILLE" },
    { libelle: "Production de beurre", champ: "T26_BEURRE" },
    { libelle: "Production de Yaourt", champ: "T26_YAOURT" },
  ],
};

/**
 * Tableau n° 59 — Situation générale des captures en tonnes.
 * Le tableau 1.6 du mensuel distingue la pêche continentale de la maritime,
 * poissons et crevettes — mais pas les espèces que demande le canevas.
 * Seule la colonne « Capture » trouve une correspondance : le total
 * continental, qui est ce que la Menoua produit.
 */
const CAPTURES: LiaisonTableau = {
  numero: 59,
  titre: "Situation générale des captures en tonnes",
  orientation: "lignes",
  correspondances: [
    { libelle: "Hemichromis", champ: null, motif: "Le tableau 1.6 ne détaille pas les espèces." },
    { libelle: "Silures", champ: null, motif: "Le tableau 1.6 ne détaille pas les espèces." },
    { libelle: "Tilapia", champ: null, motif: "Le tableau 1.6 ne détaille pas les espèces." },
    { libelle: "Carpes", champ: null, motif: "Le tableau 1.6 ne détaille pas les espèces." },
    { libelle: "Capture", champ: "T16_POISSON_CONTINENTALE" },
  ],
};

// ============================================================================
// LES CHEPTELS — tableau 1.1 du mensuel, une colonne par espèce
// ============================================================================

/**
 * Tableau n° 28 — Situation du cheptel caprin.
 * Le canevas n'y met qu'une seule colonne de données, « Catégorie », sans la
 * détailler : le total caprin du tableau 1.1 lui correspond exactement.
 */
const CHEPTEL_CAPRIN: LiaisonTableau = {
  numero: 28,
  titre: "Situation du cheptel caprin par arrondissement",
  orientation: "lignes",
  correspondances: [{ libelle: "Catégorie", champ: "T11_CHEPTEL_CAPRIN" }],
};

/**
 * Tableau n° 33 — Cheptels de camélidés et d'équidés.
 * Trois des quatre espèces sont au tableau 1.1. Les mulets n'y figurent pas.
 */
const CHEPTEL_EQUIDES: LiaisonTableau = {
  numero: 33,
  titre: "Situation des cheptels de camélidés et d’équidés",
  orientation: "lignes",
  correspondances: [
    { libelle: "Anes", champ: "T11_CHEPTEL_ASIN" },
    { libelle: "Chameaux", champ: "T11_CHEPTEL_CAMELIN" },
    { libelle: "Chevaux", champ: "T11_CHEPTEL_EQUIN" },
    { libelle: "Mulets", champ: null, motif: "Le tableau 1.1 ne porte pas de mulets." },
  ],
};

/**
 * Tableau n° 51 — Élevages non conventionnels.
 * Le tableau 1.1 porte aulacodes, lapins et cobayes. Le canevas régional
 * distingue en outre « Cochons d'inde » des « Cobayes » — ce sont le même
 * animal, et le mensuel n'en tient qu'une colonne : on la place sous
 * « Cobayes », son nom au tableau 1.1.
 */
const NON_CONVENTIONNELS: LiaisonTableau = {
  numero: 51,
  titre: "Situation des cheptels d’élevage non conventionnels",
  orientation: "lignes",
  correspondances: [
    { libelle: "Aulacodes", champ: "T11_CHEPTEL_AULACODE" },
    { libelle: "Lapins", champ: "T11_CHEPTEL_LAPIN" },
    { libelle: "Cochons d’inde", champ: null, motif: "Même animal que « Cobayes », compté une seule fois." },
    { libelle: "Rat de Gambie", champ: null, motif: "Non collecté par le tableau 1.1." },
    { libelle: "Cobayes", champ: "T11_CHEPTEL_COBAYE" },
    { libelle: "Escargots", champ: null, motif: "Non collecté par le tableau 1.1." },
    { libelle: "Autres (à préciser)", champ: null, motif: "Rubrique libre." },
  ],
};

/** Tableau n° 54 — Cheptels canins, félins et animaux de compagnie. */
const ANIMAUX_COMPAGNIE: LiaisonTableau = {
  numero: 54,
  titre: "Situation des cheptels des élevages canins et félins et autres animaux de compagnie",
  orientation: "lignes",
  correspondances: [
    { libelle: "Canins", champ: "T11_CHEPTEL_CANIN" },
    { libelle: "Félins", champ: "T11_CHEPTEL_FELIN" },
    { libelle: "Porc-épic", champ: null, motif: "Non collecté par le tableau 1.1." },
    { libelle: "Singes", champ: null, motif: "Le tableau 1.1 porte « Primates », rubrique plus large." },
    { libelle: "Crocodiles", champ: null, motif: "Non collecté par le tableau 1.1." },
  ],
};

// ============================================================================
// ABATTAGES ET VIANDE PAR ESPÈCE — tableaux 2.1 et 2.2 du mensuel
// ============================================================================

/** Tableau n° 24 — Abattages d'ovins. Une seule colonne, qui correspond. */
const ABATTAGES_OVINS: LiaisonTableau = {
  numero: 24,
  titre: "Situation des abattages d’ovins par arrondissement",
  orientation: "lignes",
  correspondances: [{ libelle: "Ovins", champ: "T21_ABAT_OVIN" }],
};

/**
 * Tableau n° 25 — Production de viande ovine en tonnes : abattages × norme de
 * carcasse. Le champ « viande » saisi au tableau 2.2 du mensuel n'est plus
 * repris : le canevas veut la production CALCULÉE (voir CARCASSE_KG).
 */
const VIANDE_OVINE: LiaisonTableau = {
  numero: 25,
  titre: "Etat de la production de viande ovine en tonnes",
  orientation: "lignes",
  correspondances: [{ libelle: "Quantité en tonnes", champ: null, formule: viande("T21_ABAT_OVIN", CARCASSE_KG.petitRuminant) }],
};

/** Tableau n° 29 — Abattages de caprins. */
const ABATTAGES_CAPRINS: LiaisonTableau = {
  numero: 29,
  titre: "Situation des abattages de caprins",
  orientation: "lignes",
  correspondances: [{ libelle: "Quantité (en nombre de têtes)", champ: "T21_ABAT_CAPRIN" }],
};

/** Tableau n° 30 — Production de viande caprine en tonnes. */
const VIANDE_CAPRINE: LiaisonTableau = {
  numero: 30,
  titre: "Situation de la production de viande de caprins en tonnes",
  orientation: "lignes",
  correspondances: [{ libelle: "Quantité de viande (en tonnes)", champ: null, formule: viande("T21_ABAT_CAPRIN", CARCASSE_KG.petitRuminant) }],
};

/**
 * Tableau n° 21 — Production et commercialisation des cuirs.
 * Le tableau 2.5 du mensuel porte les peaux de bovins ; le prix, les ressources
 * et les destinations ne sont pas collectés.
 */
const CUIRS: LiaisonTableau = {
  numero: 21,
  titre: "Synthèse de la production et de la commercialisation des cuirs",
  orientation: "lignes",
  correspondances: [
    { libelle: "Quantité (En unité)", champ: "T25_PEAUX_BOVIN" },
    { libelle: "Prix moyen FCFA/Unité", champ: null, motif: "Non collecté par le mensuel." },
    { libelle: "Ressources générées (en millions FCFA)", champ: null, motif: "Non collecté par le mensuel." },
    { libelle: "Principales destinations", champ: null, motif: "Rubrique de texte libre." },
  ],
};

// ============================================================================
// ÉTAPE C1 — liaisons ajoutées le 23 septembre 2026
// ============================================================================

const BOVINS = ["TAURILLON", "GENISSE", "CASTRE", "TAUREAU", "VACHE", "VEAU"];
const CATEGORIES_BOVINES = ["Taurillon", "Génisse", "Castré", "Taureau", "Vache", "Veau"].map((l) =>
  nonCollecte(l, PAR_CATEGORIE)
);
const PORCINS = ["VERRAT", "TRUIE", "CASTRE", "PORCELET"];
const VIANDE_NON_COLLECTEE = nonCollecte("Viande", "La viande commercialisée n'est pas collectée par le mensuel.");

/** Tableau n° 14 — Cheptel bovin : le total du tableau 1.1, sans les catégories. */
const CHEPTEL_BOVIN: LiaisonTableau = {
  numero: 14,
  titre: "Répartition du cheptel bovin par catégorie et par arrondissement",
  orientation: "lignes",
  correspondances: CATEGORIES_BOVINES,
  total: somme(["T11_CHEPTEL_BOVIN"], "effectif bovin du tableau 1.1"),
};

/** Tableau n° 16 — Abattages bovins : le total du tableau 2.1. */
const ABATTAGES_BOVINS: LiaisonTableau = {
  numero: 16,
  titre: "Les abattages contrôlés",
  orientation: "lignes",
  correspondances: CATEGORIES_BOVINES,
  total: somme(["T21_ABAT_BOVIN"], "bovins abattus, tableau 2.1"),
};

/** Tableau n° 18 — Viande bovine : abattages × 150 kg (60 % de 250 kg). */
const VIANDE_BOVINE: LiaisonTableau = {
  numero: 18,
  titre: "Production de viande en tonnes",
  orientation: "lignes",
  // Chaque catégorie : ses abattages saisis au tableau n° 16 × 150 kg.
  correspondances: ["Taurillon", "Génisse", "Castré", "Taureau", "Vache", "Veau"].map((l) =>
    viandeDeLaCategorie(l, 16, l, CARCASSE_KG.bovin)
  ),
  total: viande("T21_ABAT_BOVIN", CARCASSE_KG.bovin),
  entierementCalcule: true,
};

/** Tableau n° 19 — Commercialisation bovine : animaux vendus, tableau 5.1. */
const COMMERCE_BOVINS: LiaisonTableau = {
  numero: 19,
  titre: "Synthèse des activités de commercialisation",
  orientation: "lignes",
  correspondances: [
    { libelle: "Animaux sur pied", champ: null, formule: vendus("T51_BOVIN", BOVINS) },
    VIANDE_NON_COLLECTEE,
  ],
};

/** Tableau n° 23 — Cheptel ovin : le total du tableau 1.1. */
const CHEPTEL_OVIN: LiaisonTableau = {
  numero: 23,
  titre: "Situation du cheptel ovin",
  orientation: "lignes",
  correspondances: ["Béliers", "Brebis", "Castrés", "Agneaux"].map((l) => nonCollecte(l, PAR_CATEGORIE)),
  total: somme(["T11_CHEPTEL_OVIN"], "effectif ovin du tableau 1.1"),
};

/** Tableau n° 26 — Commercialisation ovine : animaux vendus, tableau 5.2. */
const COMMERCE_OVINS: LiaisonTableau = {
  numero: 26,
  titre: "Etat de la commercialisation des animaux et de la viande",
  orientation: "lignes",
  correspondances: [
    { libelle: "Animaux sur pied", champ: null, formule: vendus("T52_OVIN", ["BELIER", "BREBIS", "CASTRE", "AGNEAU"]) },
    VIANDE_NON_COLLECTEE,
  ],
};

/** Tableau n° 31 — Commercialisation caprine : effectifs, prix, ressources, tableau 5.3. */
const CAPRINS = ["BOUC", "CHEVRE", "CASTRE", "CHEVREAU"];
const COMMERCE_CAPRINS: LiaisonTableau = {
  numero: 31,
  titre: "Situation de la commercialisation des animaux sur pied",
  orientation: "lignes",
  correspondances: [
    { libelle: "Effectifs (en têtes)", champ: null, formule: vendus("T53_CAPRIN", CAPRINS) },
    { libelle: "Prix moyen(en FCFA)", champ: null, formule: prixMoyen("T53_CAPRIN", CAPRINS) },
    {
      libelle: "Ressources générées(en M FCFA)",
      champ: null,
      formule: {
        ...ressources("T53_CAPRIN", CAPRINS, 1_000_000),
        explication: "nombre vendu × prix moyen, en millions de FCFA",
      },
    },
    VIANDE_NON_COLLECTEE,
  ],
};

/** Tableau n° 36 — Commercialisation des équidés : tableau 5.6. */
const COMMERCE_EQUIDES: LiaisonTableau = {
  numero: 36,
  titre: "Situation de la commercialisation d’animaux sur pied dans les élevages d’équidés",
  orientation: "lignes",
  correspondances: [
    { libelle: "Anes", champ: null, formule: vendus("T56", ["ANE"]) },
    // Étalons, juments et poulains sont tous des chevaux.
    { libelle: "Chevaux", champ: null, formule: vendus("T56", ["ETALON", "JUMENT", "POULAIN"]) },
  ],
};

/** Tableau n° 37 — Cheptel porcin : le total du tableau 1.1. */
const CHEPTEL_PORCIN: LiaisonTableau = {
  numero: 37,
  titre: "Situation du cheptel porcin par arrondissement",
  orientation: "lignes",
  correspondances: ["Verrats", "Truies", "Castrés", "Porcelets"].map((l) => nonCollecte(l, PAR_CATEGORIE)),
  total: somme(["T11_CHEPTEL_PORCIN"], "effectif porcin du tableau 1.1"),
};

const CATEGORIES_ABATTAGE_PORCINES = ["Verrats", "Truies", "Castrés"].map((l) => nonCollecte(l, PAR_CATEGORIE));

/** Tableau n° 39 — Abattages porcins : le total du tableau 2.1. */
const ABATTAGES_PORCINS: LiaisonTableau = {
  numero: 39,
  titre: "Situation des abattages de porcins",
  orientation: "lignes",
  correspondances: CATEGORIES_ABATTAGE_PORCINES,
  total: somme(["T21_ABAT_PORCIN"], "porcins abattus, tableau 2.1"),
};

/** Tableau n° 40 — Viande porcine : abattages × 70 kg. */
const VIANDE_PORCINE: LiaisonTableau = {
  numero: 40,
  titre: "Situation de la production de viande de porcins en tonnes",
  orientation: "lignes",
  // Chaque catégorie : ses abattages saisis au tableau n° 39 × 70 kg.
  correspondances: ["Verrats", "Truies", "Castrés"].map((l) => viandeDeLaCategorie(l, 39, l, CARCASSE_KG.porc)),
  total: viande("T21_ABAT_PORCIN", CARCASSE_KG.porc),
  entierementCalcule: true,
};

/** Tableau n° 41 — Commercialisation porcine : animaux vendus, tableau 5.4. */
const COMMERCE_PORCINS: LiaisonTableau = {
  numero: 41,
  titre: "Etat de la commercialisation des produits issus de l’élevage de porcins",
  orientation: "lignes",
  correspondances: [
    { libelle: "Animaux sur pied", champ: null, formule: vendus("T54_PORCIN", PORCINS) },
    VIANDE_NON_COLLECTEE,
  ],
};

/**
 * Tableau n° 42 — Situation des bandes : le tableau 1.2 du mensuel, élevages
 * moderne et traditionnel additionnés. Les poussins, coquelets, reproducteurs,
 * dindons et chapons n'y figurent pas.
 */
const volailles = (espece: string) =>
  somme([`T12_VOL_MOD_${espece}`, `T12_VOL_TRAD_${espece}`], "effectif du tableau 1.2, élevages moderne et traditionnel");
const PAS_AU_TABLEAU_12 = "Le tableau 1.2 du mensuel ne porte pas cette catégorie.";
const BANDES: LiaisonTableau = {
  numero: 42,
  titre: "Situation des bandes par arrondissement",
  orientation: "colonnes",
  correspondances: [
    nonCollecte("Poussins chair", PAS_AU_TABLEAU_12),
    nonCollecte("Poussins ponte", PAS_AU_TABLEAU_12),
    nonCollecte("Poussin coquelets", PAS_AU_TABLEAU_12),
    { libelle: "Poulets de chair", champ: null, formule: volailles("POULET_CHAIR") },
    { libelle: "Poules pondeuses", champ: null, formule: volailles("PONDEUSE") },
    nonCollecte("Poules reformées", PAS_AU_TABLEAU_12),
    nonCollecte("Coquelets", PAS_AU_TABLEAU_12),
    { libelle: "Poulets villageois", champ: null, formule: volailles("POULET_VILLAGEOIS") },
    nonCollecte("Reproducteur", PAS_AU_TABLEAU_12),
    { libelle: "Canards", champ: null, formule: volailles("CANARD") },
    { libelle: "Paons", champ: null, formule: volailles("PAON") },
    { libelle: "Pigeons", champ: null, formule: volailles("PIGEON") },
    { libelle: "Pintades", champ: null, formule: volailles("PINTADE") },
    nonCollecte("Dindons", PAS_AU_TABLEAU_12),
    { libelle: "Dindes", champ: null, formule: volailles("DINDE") },
    { libelle: "Cailles", champ: null, formule: volailles("CAILLE") },
    { libelle: "Oies", champ: null, formule: volailles("OIE") },
    nonCollecte("Chapons", PAS_AU_TABLEAU_12),
  ],
};

/** Oiseaux vendus d'une catégorie du tableau 5.5. */
const oiseauxVendus = (categorie: string) => vendus("T55_VOLAILLE", [categorie]);
const PAS_AU_TABLEAU_55 = "Le tableau 5.5 du mensuel ne porte pas cette catégorie.";

/** Tableau n° 43 — Oiseaux vendus sur pied, par arrondissement. */
const COMMERCE_OISEAUX: LiaisonTableau = {
  numero: 43,
  titre: "Etat de la commercialisation des oiseaux sur pied par arrondissement",
  orientation: "lignes",
  correspondances: [
    nonCollecte("Poussins chair", PAS_AU_TABLEAU_55),
    nonCollecte("Poussins ponte", PAS_AU_TABLEAU_55),
    { libelle: "Poulets chair", champ: null, formule: oiseauxVendus("POULET_CHAIR") },
    { libelle: "Poules pondeuses", champ: null, formule: oiseauxVendus("PONDEUSE") },
    nonCollecte("Coquelets", PAS_AU_TABLEAU_55),
    nonCollecte("Poules réformées", PAS_AU_TABLEAU_55),
    { libelle: "Poulets villageois", champ: null, formule: oiseauxVendus("POULET_VILLAGEOIS") },
    { libelle: "Canards", champ: null, formule: oiseauxVendus("CANARD") },
    { libelle: "Pigeons", champ: null, formule: oiseauxVendus("PIGEON") },
    { libelle: "Pintades", champ: null, formule: oiseauxVendus("PINTADE") },
    nonCollecte("paons", PAS_AU_TABLEAU_55),
    { libelle: "Dindes", champ: null, formule: oiseauxVendus("DINDE") },
    { libelle: "Cailles", champ: null, formule: oiseauxVendus("CAILLE") },
    nonCollecte("Dindons", PAS_AU_TABLEAU_55),
    { libelle: "Oies", champ: null, formule: oiseauxVendus("OIE") },
  ],
};

/** Tableau n° 44 — Les mêmes ventes, catégories en lignes. */
const COMMERCE_OISEAUX_CATEGORIES: LiaisonTableau = {
  numero: 44,
  titre: "Etat de la commercialisation des oiseaux sur pied par arrondissement et par catégorie",
  orientation: "colonnes",
  correspondances: [
    nonCollecte("Poussins. chair", PAS_AU_TABLEAU_55),
    nonCollecte("Poussins. ponte", PAS_AU_TABLEAU_55),
    { libelle: "P. de chair", champ: null, formule: oiseauxVendus("POULET_CHAIR") },
    { libelle: "Poules pondeuses", champ: null, formule: oiseauxVendus("PONDEUSE") },
    nonCollecte("Poulets réformés", PAS_AU_TABLEAU_55),
    nonCollecte("Coquelets", PAS_AU_TABLEAU_55),
    { libelle: "Poulets villageois", champ: null, formule: oiseauxVendus("POULET_VILLAGEOIS") },
    { libelle: "Canards", champ: null, formule: oiseauxVendus("CANARD") },
    { libelle: "Pigeons", champ: null, formule: oiseauxVendus("PIGEON") },
    { libelle: "Pintades", champ: null, formule: oiseauxVendus("PINTADE") },
    { libelle: "Cailles", champ: null, formule: oiseauxVendus("CAILLE") },
    nonCollecte("Dindons", PAS_AU_TABLEAU_55),
    { libelle: "Oies", champ: null, formule: oiseauxVendus("OIE") },
  ],
};

const PAR_CATEGORIE_VOLAILLE = "Le tableau 2.1 du mensuel ne distingue pas les catégories de volaille.";

/** Tableau n° 45 — Abattages de volaille : le total du tableau 2.1. */
const ABATTAGES_VOLAILLE: LiaisonTableau = {
  numero: 45,
  titre: "Situation des abattages contrôlés de volaille par arrondissement",
  orientation: "lignes",
  correspondances: ["Poulets de chair", "Poulets villageois", "Coquelets", "Autres(Poules de réforme etc.)"].map((l) =>
    nonCollecte(l, PAR_CATEGORIE_VOLAILLE)
  ),
  total: somme(["T21_ABAT_VOLAILLE"], "volailles abattues, tableau 2.1"),
};

/** Tableau n° 46 — Viande de volaille : abattages × 2 kg. */
const VIANDE_VOLAILLE: LiaisonTableau = {
  numero: 46,
  titre: "Etat de production de la viande de volaille par arrondissement",
  orientation: "lignes",
  // Chaque catégorie : ses abattages saisis au tableau n° 45 × 2 kg. Le
  // tableau des abattages n'a pas de colonne « Canards » : leur viande reste
  // vide, et ne se saisit pas.
  correspondances: [
    viandeDeLaCategorie("Poulet de chair", 45, "Poulets de chair", CARCASSE_KG.volaille),
    viandeDeLaCategorie("Poulets villageois", 45, "Poulets villageois", CARCASSE_KG.volaille),
    nonCollecte("Canards", "Le tableau des abattages de volaille ne porte pas de canards."),
    viandeDeLaCategorie("Coquelets", 45, "Coquelets", CARCASSE_KG.volaille),
    viandeDeLaCategorie("Autres (poules de réforme etc.)", 45, "Autres(Poules de réforme etc.)", CARCASSE_KG.volaille),
  ],
  total: viande("T21_ABAT_VOLAILLE", CARCASSE_KG.volaille),
  entierementCalcule: true,
};

/** Tableau n° 47 — Œufs : ceux des fermes de ponte, tableau 1.4. */
const OEUFS: LiaisonTableau = {
  numero: 47,
  titre: "Etat de la production des œufs par arrondissement",
  orientation: "lignes",
  correspondances: [
    { libelle: "Poules", champ: "T14_OEUFS_PRODUITS" },
    nonCollecte("Poules villageoises", "Le tableau 1.4 ne porte que les fermes de ponte."),
    nonCollecte("Cailles", "Le tableau 1.4 ne porte que les fermes de ponte."),
  ],
};

/** Tableau n° 52 — Apiculture : le miel du tableau 2.5, en litres comme au canevas. */
const APICULTURE: LiaisonTableau = {
  numero: 52,
  titre: "La situation de l’apiculture",
  orientation: "lignes",
  correspondances: [
    { libelle: "Quantité de miel récolté (en litres)", champ: "T25_MIEL" },
    ...[
      "Cire (en kg)",
      "Propolis (en kg)",
      "Gelée royale (en kg)",
      "Nombre de ruches",
      "Ruchers",
      "Nombre d'apiculteurs",
      "Nombre d'organisations",
    ].map((l) => nonCollecte(l, "Non collecté par le mensuel.")),
  ],
};

/**
 * Tableau n° 62 — Alevins : tableau 1.7. Le « Total » compte toutes les
 * espèces produites, kanga et hemichromis compris, que le canevas ne détaille
 * pas : il peut donc dépasser la somme des trois colonnes.
 */
const ESPECES_PISCICOLES = ["TILAPIA", "CLARIAS", "CARPE", "KANGA", "HEMICHROMIS"];
const ALEVINS: LiaisonTableau = {
  numero: 62,
  titre: "Production d’alevins",
  orientation: "lignes",
  correspondances: [
    { libelle: "Tilapia", champ: "T17_ALEVINS_TILAPIA" },
    { libelle: "Clarias", champ: "T17_ALEVINS_CLARIAS" },
    { libelle: "Carpe", champ: "T17_ALEVINS_CARPE" },
    {
      libelle: "Total",
      champ: null,
      formule: somme(
        ESPECES_PISCICOLES.map((e) => `T17_ALEVINS_${e}`),
        "toutes les espèces d'alevins du tableau 1.7"
      ),
    },
  ],
};

/** Tableau n° 63 — Poissons de table : tableau 1.7, unités converties. */
const POISSONS_DE_TABLE: LiaisonTableau = {
  numero: 63,
  titre: "Situation de la production de poissons de table",
  orientation: "lignes",
  correspondances: [
    nonCollecte("Nombre de pisciculteurs", "Non collecté par le mensuel."),
    { libelle: "Nombre étangs", champ: "T17_NB_ETANGS" },
    // Le mensuel saisit la superficie en m² ; le canevas la veut en hectares.
    {
      libelle: "Superficie en Ha",
      champ: null,
      formule: somme(["T17_SUPERFICIE"], "superficie du tableau 1.7, m² convertis en ha", 1 / 10_000),
    },
    nonCollecte("Bacs hors sol", "Non collecté par le mensuel."),
    nonCollecte("Volume", "Non collecté par le mensuel."),
    // Le mensuel saisit les poissons en tonnes ; le canevas les veut en kg.
    {
      libelle: "Qté de poissons (en kg)",
      champ: null,
      formule: somme(
        ESPECES_PISCICOLES.map((e) => `T17_POISSON_${e}`),
        "poissons de table du tableau 1.7, tonnes converties en kg",
        1000
      ),
    },
    nonCollecte("Prix moyen du Kg", "Non collecté par le mensuel."),
    nonCollecte("Ressources générées", "Non collecté par le mensuel."),
  ],
};

/**
 * Tableau n° 72 — Produits inspectés sur les marchés : quantités INSPECTÉES
 * du tableau 3.4. Seuls les produits dont l'unité du mensuel se convertit
 * exactement dans celle du canevas sont liés. Les autres (boîte contre kg,
 * pot contre boîte…) restent à saisir, et ne figurent pas ici.
 */
const inspecte = (produit: string, facteur = 1, conversion = "") =>
  somme([`T34_INSP_${produit}`], `quantité inspectée, tableau 3.4${conversion}`, facteur);
const T_EN_KG = ", tonnes converties en kg";
const INSPECTION_MARCHES: LiaisonTableau = {
  numero: 72,
  titre: "Récapitulatif des produits inspectés sur les marchés",
  orientation: "colonnes",
  correspondances: [
    { libelle: "Beurre (kg)", champ: null, formule: inspecte("BEURRE", 1, ", boîtes de 1 kg") },
    { libelle: "Crustacés et mollusques (kg)", champ: null, formule: inspecte("CRUSTACES") },
    { libelle: "Fromage en kg", champ: null, formule: inspecte("FROMAGES") },
    { libelle: "Gibier frais (kg)", champ: null, formule: inspecte("GIBIER_FRAIS", 1000, T_EN_KG) },
    { libelle: "Jambon (kg)", champ: null, formule: inspecte("JAMBON") },
    { libelle: "Gibier fumé (kg)", champ: null, formule: inspecte("GIBIER_FUME") },
    { libelle: "Lait caillé(l)", champ: null, formule: inspecte("LAIT_CAILLE") },
    { libelle: "Lait concentré (bte)", champ: null, formule: inspecte("LAIT_CONCENTRE") },
    { libelle: "Lait en poudre (kg)", champ: null, formule: inspecte("LAIT_POUDRE", 1000, T_EN_KG) },
    { libelle: "Lait liquide (L)", champ: null, formule: inspecte("LAIT_FRAIS") },
    { libelle: "Mayonnaise (boite)", champ: null, formule: inspecte("MAYONNAISE") },
    { libelle: "Miel (L)", champ: null, formule: inspecte("MIEL") },
    // Une alvéole porte 30 œufs.
    { libelle: "Œufs de table (unité)", champ: null, formule: inspecte("OEUFS", 30, ", alvéoles de 30 œufs") },
    { libelle: "Poisson frais (Kg)", champ: null, formule: inspecte("POISSON_FRAIS", 1000, T_EN_KG) },
    { libelle: "Poisson fumé (kg)", champ: null, formule: inspecte("POISSON_FUME", 1000, T_EN_KG) },
    { libelle: "Poisson congelé (kg)", champ: null, formule: inspecte("POISSON_CONGELE", 1000, T_EN_KG) },
    { libelle: "Viande de bœuf (t)", champ: null, formule: inspecte("VIANDE_BOVINE_FRAICHE") },
    { libelle: "Saucisse (kg", champ: null, formule: inspecte("SAUCISSES") },
    { libelle: "Viande de petits ruminants (kg)", champ: null, formule: inspecte("VIANDE_PETITS_RUM", 1000, T_EN_KG) },
    { libelle: "Viande de porc (kg)", champ: null, formule: inspecte("VIANDE_PORCINE", 1000, T_EN_KG) },
    { libelle: "Ecrevisses", champ: null, formule: inspecte("ECREVISSES") },
    { libelle: "Viande de volaille fraîche (kg)", champ: null, formule: inspecte("VIANDE_VOLAILLE", 1000, T_EN_KG) },
    { libelle: "Tourteau de coton", champ: null, formule: inspecte("TOURTEAU_COTON") },
    { libelle: "Tourteau d’arachide", champ: null, formule: inspecte("TOURTEAU_ARACHIDE") },
    { libelle: "Farine de poisson", champ: null, formule: inspecte("FARINE_POISSON") },
    { libelle: "Remoulage", champ: null, formule: inspecte("REMOULAGE") },
    { libelle: "Tourteau de soja", champ: null, formule: inspecte("TOURTEAU_SOJA") },
    { libelle: "Provende chair(tonne)", champ: null, formule: inspecte("PROVENDE_CHAIR") },
    { libelle: "Provende porc(tonne)", champ: null, formule: inspecte("PROVENDE_PORC") },
    { libelle: "Provende ponte(tonne)", champ: null, formule: inspecte("PROVENDE_PONTE") },
    { libelle: "Aliment poisson (tonne)", champ: null, formule: inspecte("ALIMENT_POISSON") },
    // Unités proches, acceptées par le Délégué : le pot vaut la boîte, le
    // paquet vaut le sachet.
    { libelle: "Yaourts (boites)", champ: null, formule: inspecte("YAOURT", 1, ", pots comptés comme boîtes") },
    { libelle: "Biscuits au lait((sachet)", champ: null, formule: inspecte("BISCUITS_LAIT", 1, ", paquets comptés comme sachets") },
  ],
};

/**
 * Tableau n° 71 — Saisies effectuées après inspection : quantités SAISIES du
 * tableau 3.4 (marchés et établissements), unités converties. Les saisies en
 * abattoir (tableau 3.5) s'y ajoutent, par evenements.ts.
 */
const saisi = (produit: string, facteur = 1, conversion = "") =>
  somme([`T34_SAISIE_${produit}`], `quantité saisie, tableau 3.4${conversion}`, facteur);
const SAISIES_EFFECTUEES: LiaisonTableau = {
  numero: 71,
  titre: "Récapitulatif des saisies effectuées après inspection",
  orientation: "colonnes",
  correspondances: [
    { libelle: "Abats bovins (Kg)", champ: null, formule: saisi("ABATS_BOVINS", 1000, T_EN_KG) },
    { libelle: "Chair de bovins (kg)", champ: null, formule: saisi("VIANDE_BOVINE_FRAICHE", 1000, T_EN_KG) },
    { libelle: "Viande porcine (kg)", champ: null, formule: saisi("VIANDE_PORCINE", 1000, T_EN_KG) },
    { libelle: "Viande de PR (kg)", champ: null, formule: saisi("VIANDE_PETITS_RUM", 1000, T_EN_KG) },
    { libelle: "Volailles (kg)", champ: null, formule: saisi("VIANDE_VOLAILLE", 1000, T_EN_KG) },
    { libelle: "Poisson frais (Kg)", champ: null, formule: saisi("POISSON_FRAIS", 1000, T_EN_KG) },
    { libelle: "Poisson fume (kg)", champ: null, formule: saisi("POISSON_FUME", 1000, T_EN_KG) },
    { libelle: "Poissons congelés (Kg)", champ: null, formule: saisi("POISSON_CONGELE", 1000, T_EN_KG) },
    { libelle: "Poisson en conserve (boite)", champ: null, formule: saisi("CONSERVES_POISSON") },
    { libelle: "Lait concentré sucré (boîte)", champ: null, formule: saisi("LAIT_CONCENTRE") },
    { libelle: "Lait en poudre (kg)", champ: null, formule: saisi("LAIT_POUDRE", 1000, T_EN_KG) },
    { libelle: "Lait liquide (L)", champ: null, formule: saisi("LAIT_FRAIS") },
    { libelle: "Beurre (boites)", champ: null, formule: saisi("BEURRE") },
    { libelle: "Œufs de table (unité)", champ: null, formule: saisi("OEUFS", 30, ", alvéoles de 30 œufs") },
    { libelle: "Gibier frais (kg)", champ: null, formule: saisi("GIBIER_FRAIS", 1000, T_EN_KG) },
    { libelle: "Gibier fumé (kg)", champ: null, formule: saisi("GIBIER_FUME") },
    { libelle: "Fromage (kg)", champ: null, formule: saisi("FROMAGES") },
    { libelle: "Yaourts (boites)", champ: null, formule: saisi("YAOURT", 1, ", pots comptés comme boîtes") },
  ],
};

/** Toutes les liaisons établies à ce jour, dans l'ordre du canevas. */
export const LIAISONS: LiaisonTableau[] = [
  CHEPTEL_BOVIN,
  ABATTAGES_BOVINS,
  VIANDE_BOVINE,
  COMMERCE_BOVINS,
  EXPLOITATION_LAIT,
  CUIRS,
  CHEPTEL_OVIN,
  ABATTAGES_OVINS,
  VIANDE_OVINE,
  COMMERCE_OVINS,
  CHEPTEL_CAPRIN,
  ABATTAGES_CAPRINS,
  VIANDE_CAPRINE,
  COMMERCE_CAPRINS,
  CHEPTEL_EQUIDES,
  COMMERCE_EQUIDES,
  CHEPTEL_PORCIN,
  ABATTAGES_PORCINS,
  VIANDE_PORCINE,
  COMMERCE_PORCINS,
  BANDES,
  COMMERCE_OISEAUX,
  COMMERCE_OISEAUX_CATEGORIES,
  ABATTAGES_VOLAILLE,
  VIANDE_VOLAILLE,
  OEUFS,
  NON_CONVENTIONNELS,
  APICULTURE,
  ANIMAUX_COMPAGNIE,
  CAPTURES,
  AQUACULTURE,
  ALEVINS,
  POISSONS_DE_TABLE,
  ABATTAGES_CONTROLES,
  SAISIES_EFFECTUEES,
  INSPECTION_MARCHES,
];

/** La liaison d'un tableau, s'il en a une. */
export function liaisonDe(numero: number | null): LiaisonTableau | undefined {
  if (numero == null) return undefined;
  return LIAISONS.find((l) => l.numero === numero);
}

/** Les champs du SID effectivement mobilisés par les liaisons. */
export function champsMobilises(): string[] {
  const s = new Set<string>();
  for (const l of LIAISONS) {
    for (const c of l.correspondances) for (const champ of champsDe(c)) s.add(champ);
    for (const champ of l.total?.champs ?? []) s.add(champ);
  }
  return Array.from(s).sort();
}

/** Compte ce qui est lié et ce qui ne l'est pas — pour le suivi. */
export function bilanLiaisons(): {
  tableaux: number;
  casesLiees: number;
  casesNonCollectees: number;
  parTableau: { numero: number; titre: string; liees: number; total: number }[];
} {
  const parTableau = LIAISONS.map((l) => ({
    numero: l.numero,
    titre: l.titre,
    liees: l.correspondances.filter(estLiee).length + (l.total ? 1 : 0),
    total: l.correspondances.length + (l.total ? 1 : 0),
  }));
  return {
    tableaux: LIAISONS.length,
    casesLiees: parTableau.reduce((s, t) => s + t.liees, 0),
    casesNonCollectees: parTableau.reduce((s, t) => s + (t.total - t.liees), 0),
    parTableau,
  };
}

/** Règle d'agrégation attendue pour un champ lié — utile aux vérifications. */
export type { RegleAgregation };

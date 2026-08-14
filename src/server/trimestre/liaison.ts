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
  /** Pourquoi il n'y a pas de champ, le cas échéant. */
  motif?: string;
}

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

/** Tableau n° 25 — Production de viande ovine en tonnes. */
const VIANDE_OVINE: LiaisonTableau = {
  numero: 25,
  titre: "Etat de la production de viande ovine en tonnes",
  orientation: "lignes",
  correspondances: [{ libelle: "Quantité en tonnes", champ: "T22_VIANDE_OVIN" }],
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
  correspondances: [{ libelle: "Quantité de viande (en tonnes)", champ: "T22_VIANDE_CAPRIN" }],
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

/** Toutes les liaisons établies à ce jour, dans l'ordre du canevas. */
export const LIAISONS: LiaisonTableau[] = [
  EXPLOITATION_LAIT,
  CUIRS,
  ABATTAGES_OVINS,
  VIANDE_OVINE,
  CHEPTEL_CAPRIN,
  ABATTAGES_CAPRINS,
  VIANDE_CAPRINE,
  CHEPTEL_EQUIDES,
  NON_CONVENTIONNELS,
  ANIMAUX_COMPAGNIE,
  CAPTURES,
  AQUACULTURE,
  ABATTAGES_CONTROLES,
];

/** La liaison d'un tableau, s'il en a une. */
export function liaisonDe(numero: number | null): LiaisonTableau | undefined {
  if (numero == null) return undefined;
  return LIAISONS.find((l) => l.numero === numero);
}

/** Les champs du SID effectivement mobilisés par les liaisons. */
export function champsMobilises(): string[] {
  const s = new Set<string>();
  for (const l of LIAISONS) for (const c of l.correspondances) if (c.champ) s.add(c.champ);
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
    liees: l.correspondances.filter((c) => c.champ).length,
    total: l.correspondances.length,
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

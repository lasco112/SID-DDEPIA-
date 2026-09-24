/**
 * Description de la mise en page du canevas trimestriel officiel.
 *
 * RÈGLE ABSOLUE : ce fichier et ceux des sections décrivent le canevas TEL
 * QU'IL EST, pas tel qu'il serait commode. Pas une colonne en plus, pas une en
 * moins, pas un libellé reformulé. La référence est docs/CANEVAS_TRIMESTRIEL.md,
 * extrait automatiquement du .docx du Délégué ; toute divergence est une faute
 * du code, jamais du canevas.
 *
 * Les libellés dépendant de la période portent des jetons, remplacés au rendu :
 *   {P}    la période      — « T3 2026 »
 *   {P-1}  la même, un an plus tôt — « T3 2025 »
 *   {A}    l'année millésime — « 2026 »
 *   {A-1}  l'année précédente — « 2025 »
 *   {M1} {M2} {M3}  les trois mois en majuscules — « JUILLET »…
 */

export interface ContexteCanevas {
  /** « T3 2026 » */
  periodeCourt: string;
  /** « T3 2025 » */
  periodeCourtN1: string;
  /** L'année de la période — 2026. */
  annee: number;
  /** Les trois mois de la période, en majuscules. */
  mois: string[];
  /** Les six arrondissements, dans l'ordre du canevas. */
  arrondissements: string[];
  /**
   * Renseigné quand on produit le rapport d'UN arrondissement. Les titres du
   * canevas, écrits pour le niveau départemental, sont alors transposés :
   * « DU DÉPARTEMENT DE LA MENOUA » devient « DE L'ARRONDISSEMENT DE DSCHANG ».
   */
  arrondissement?: string;
  /**
   * Le département dont on produit le rapport. Le canevas est écrit avec les
   * intitulés de la Menoua — c'est le document officiel qui fait foi — et le
   * rendu y transpose le territoire, exactement comme il le fait déjà pour un
   * arrondissement. Le mémorandum l'autorise expressément : « seules la période
   * et la maille géographique sont transposées ».
   */
  departement?: { nomAvecArticle: string; sigle: string };
}

/*
 * Les intitulés du canevas de référence qui désignent le territoire. Ce sont
 * ceux de la Menoua, puisque c'est le document officiel dont le SID part.
 * Ils servent de POINT D'ANCRAGE à la transposition — ils ne sont pas une
 * préférence pour la Menoua.
 */
const REFERENCE_DEPARTEMENT = "DE LA MENOUA";
const REFERENCE_SIGLE = "DDEPIA-MENOUA";

/**
 * Transpose un titre départemental au niveau d'un arrondissement.
 * Sans cette transposition, le rapport de Dschang s'intitulerait
 * « PRÉSENTATION GÉOGRAPHIQUE DU DÉPARTEMENT DE LA MENOUA » — ce qui est le
 * titre du rapport de son chef, pas du sien.
 */
export function adapterTitre(texte: string, ctx: ContexteCanevas): string {
  const arr = ctx.arrondissement;

  if (!arr) {
    // Rapport départemental : on transpose le territoire du canevas de
    // référence vers celui du département traité. Pour la Menoua, la
    // substitution rend le texte inchangé — c'est ce que vérifie le test de
    // conformité au canevas.
    const d = ctx.departement;
    if (!d) return texte;
    return texte
      .split(REFERENCE_SIGLE).join(d.sigle.toUpperCase())
      .split(REFERENCE_DEPARTEMENT).join(d.nomAvecArticle.toUpperCase());
  }

  const MAJ = arr.toUpperCase();
  return texte
    .replace(/DU DÉPARTEMENT DE LA MENOUA/gi, `DE L'ARRONDISSEMENT DE ${MAJ}`)
    .replace(/DE LA DDEPIA-MENOUA/gi, `DE LA DAEPIA-${MAJ}`)
    .replace(/AU NIVEAU DÉPARTEMENTAL/gi, `AU NIVEAU DE L'ARRONDISSEMENT`)
    .replace(/\bDDEPIA\b/g, "DAEPIA")
    .replace(/CARTE ÉPIDÉMIOLOGIQUE ACTUALISÉE DU DÉPARTEMENT/gi, `CARTE ÉPIDÉMIOLOGIQUE ACTUALISÉE DE L'ARRONDISSEMENT`);
}

/**
 * Libellés du canevas qui désignent le NIVEAU DÉPARTEMENTAL lui-même.
 *
 * Ils ont leur place dans le rapport du Délégué départemental — la DDEPIA est
 * une structure, elle a du personnel, elle tient une régie de recettes. Ils
 * n'en ont aucune dans le rapport d'un DA : un arrondissement ne possède pas de
 * DDEPIA, et lui faire remplir cette ligne reviendrait à lui faire rendre
 * compte de la structure de son chef.
 *
 * La liste est nominative, jamais un motif : « DAEPIA » ressemble à « DDEPIA »
 * d'une lettre, et c'est justement la ligne du DA qu'il faut garder.
 */
const LIBELLES_DEPARTEMENTAUX = new Set(["DDEPIA"]);

/**
 * Retire les lignes et colonnes départementales quand on produit le rapport
 * d'un arrondissement. Sur le rapport départemental, ne retire rien : le
 * canevas y est reproduit sans retouche.
 */
export function sansNiveauDepartemental(libelles: string[], ctx: ContexteCanevas): string[] {
  if (!ctx.arrondissement) return libelles;
  return libelles.filter((l) => !LIBELLES_DEPARTEMENTAUX.has(l.trim()));
}

/** « JUILLET » → « Juillet » : les textes courants n'écrivent pas les mois en capitales. */
const enNomPropre = (m: string) => (m ? m.charAt(0) + m.slice(1).toLowerCase() : "");

/**
 * La nature de la période, déduite du nombre de mois qu'elle couvre. Elle sert
 * aux textes : « le présent rapport trimestriel… », « au cours de ce semestre ».
 */
function naturePeriode(ctx: ContexteCanevas): { adjectif: string; demonstratif: string } {
  if (ctx.mois.length >= 12) return { adjectif: "annuel", demonstratif: "cette année" };
  if (ctx.mois.length >= 6) return { adjectif: "semestriel", demonstratif: "ce semestre" };
  if (ctx.mois.length >= 3) return { adjectif: "trimestriel", demonstratif: "ce trimestre" };
  return { adjectif: "mensuel", demonstratif: "ce mois" };
}

/**
 * Remplace les jetons de période dans un libellé du canevas.
 *
 * Jetons de texte courant, en plus de ceux des tableaux :
 *   {NATURE}       « trimestriel », « semestriel »…
 *   {CETTE_PERIODE} « ce trimestre », « ce semestre »…
 *   {MOIS_DEBUT}   premier mois de la période — « Juillet »
 *   {MOIS_FIN}     dernier mois de la période — « Septembre »
 *   {STRUCTURE}    « DDEPIA-MENOUA », ou « DAEPIA de Dschang » dans le rapport d'un DA
 */
export function resoudre(libelle: string, ctx: ContexteCanevas): string {
  const nature = naturePeriode(ctx);
  // La structure qui rend compte : la DDEPIA du département, ou la DAEPIA de
  // l'arrondissement dont on produit le rapport.
  const structure = ctx.arrondissement
    ? `DAEPIA de ${ctx.arrondissement}`
    : (ctx.departement?.sigle ?? REFERENCE_SIGLE);
  return libelle
    .replace(/\{STRUCTURE\}/g, structure)
    .replace(/\{NATURE\}/g, nature.adjectif)
    .replace(/\{CETTE_PERIODE\}/g, nature.demonstratif)
    .replace(/\{MOIS_DEBUT\}/g, enNomPropre(ctx.mois[0] ?? ""))
    .replace(/\{MOIS_FIN\}/g, enNomPropre(ctx.mois[ctx.mois.length - 1] ?? ""))
    .replace(/\{P-1\}/g, ctx.periodeCourtN1)
    .replace(/\{P\}/g, ctx.periodeCourt)
    .replace(/\{A-2\}/g, String(ctx.annee - 2))
    .replace(/\{A-1\}/g, String(ctx.annee - 1))
    .replace(/\{A\}/g, String(ctx.annee))
    .replace(/\{M1\}/g, ctx.mois[0] ?? "")
    .replace(/\{M2\}/g, ctx.mois[1] ?? "")
    .replace(/\{M3\}/g, ctx.mois[2] ?? "");
}

/**
 * Un tableau dont les colonnes sont les six arrondissements — le modèle
 * dominant du canevas : 29 tableaux sur 81 le suivent.
 * Colonnes : libellé, les six arrondissements, TOTAL {P}, TOTAL {P-1}.
 */
export interface TableauArrondissements {
  kind: "arrondissements";
  /** Numéro imprimé dans le canevas : « Tableau n° 3 ». */
  numero: number;
  titre: string;
  /** Intitulé de la première colonne, tel quel : « STRUCTURES », « NATURE »… */
  enteteLibelle: string;
  /** Libellés de ligne imposés, dans l'ordre, y compris la ligne TOTAL. */
  lignes: string[];
}

/** Un tableau dont les colonnes ne sont pas les arrondissements. */
export interface TableauLibre {
  kind: "libre";
  /**
   * Clé STABLE du tableau : elle adresse ses saisies et ses liaisons, et ne se
   * renumérote jamais. De 1 à 72, c'est le numéro du canevas régional ; à
   * partir de 101, un tableau ajouté au canevas départemental. Le numéro
   * AFFICHÉ, lui, est calculé au rendu.
   */
  numero: number | null;
  titre: string;
  entetes: string[];
  lignes: string[];
  /**
   * Cases FIXES des colonnes qui suivent la première, ligne par ligne, dans
   * l'ordre de `lignes`. Sert aux tableaux d'activités du budget-programme, dont
   * le régional impose les actions et les activités : seule la réalisation
   * change d'une période à l'autre. Une chaîne vide laisse la case à remplir.
   * Réservé aux tableaux sans jeton {ARRONDISSEMENTS} en ligne.
   */
  prerempli?: string[][];
}

export type Tableau = TableauArrondissements | TableauLibre;

export type Bloc =
  // Le canevas descend jusqu'au niveau 4 : « a) Les abattages contrôlés »,
  // « b) Rendement moyen viande / carcasse »…
  | { type: "titre"; niveau: 1 | 2 | 3 | 4; texte: string }
  /**
   * Zone de texte du canevas. `consigne` est la mention entre crochets du
   * document officiel ; elle indique au rédacteur ce qui est attendu.
   * `cle` identifie la zone de façon stable pour stocker le texte saisi.
   */
  | {
      type: "zoneTexte";
      cle: string;
      consigne: string;
      /**
       * Ce que le document porte quand la zone n'est pas rédigée. Par défaut
       * « Néant. » : la zone rend compte d'une activité, et aucune n'est
       * déclarée. « rien » pour une PRÉSENTATION suivie de ses tableaux —
       * « Néant » sous « L'élevage porcin », au-dessus du tableau des porcs,
       * dirait qu'il n'y a pas de porcs.
       */
      siVide?: "neant" | "rien";
    }
  | ({ type: "tableau" } & Tableau);

export interface SectionCanevas {
  /** Identifiant stable, pour la validation section par section. */
  cle: string;
  /** Intitulé tel qu'il figure au canevas. */
  titre: string;
  blocs: Bloc[];
}

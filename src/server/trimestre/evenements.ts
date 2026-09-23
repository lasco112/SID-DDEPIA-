/**
 * Tableaux du canevas alimentés par les LISTES du mensuel (étape c2).
 *
 * Certains tableaux mensuels ne sont pas des grilles de champs mais des listes
 * d'événements : une ligne par vaccination, par acte de clinique, par
 * mouvement de bétail. Le trimestre les additionne ici, période par période et
 * arrondissement par arrondissement.
 *
 * MÊME PRINCIPE QUE liaison.ts : une ligne n'est comptée dans une case que si
 * sa correspondance est ÉCRITE ci-dessous. Une maladie, une espèce ou un
 * libellé qui ne correspond à aucune case n'est pas « rangé au plus proche » :
 * il est rapporté comme NON CLASSÉ, pour que le Délégué tranche. Un chiffre mis
 * dans la mauvaise case est pire qu'un chiffre absent.
 *
 * Les colonnes « TOTAL » comptent en revanche TOUTES les lignes de la source :
 * une vaccination contre la fièvre aphteuse, qui n'a pas de colonne au canevas,
 * reste une vaccination de la période.
 *
 * Le mensuel n'est que LU : aucune écriture, aucune modification de ses écrans.
 */
import type { PrismaClient } from "@prisma/client";
import { type Periode, memePeriodeAnneePrecedente } from "../periodes/calendrier";
import { inspecterPeriode, STATUTS_TRANSMIS } from "./agregation";

/** Une ligne d'événement, telle que saisie au mensuel. */
type Ligne = Record<string, unknown>;

/** Nombre saisi — parfois enregistré en texte (« 2 ») par les anciens écrans. */
function nombre(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Comment un tableau du canevas se remplit à partir d'une liste mensuelle.
 *
 * `categorie` rend la case (colonne ou ligne) où la ligne compte, `null` si
 * elle ne correspond à aucune, `undefined` si elle ne concerne pas ce tableau
 * du tout (un déparasitage n'a rien à faire au tableau des consultations).
 */
export interface LiaisonEvenement {
  numero: number;
  titre: string;
  /** Où sont les arrondissements : en lignes ou en colonnes. */
  orientation: "lignes" | "colonnes";
  /** Tableaux mensuels lus. */
  sources: string[];
  categorie: (l: Ligne, source: string) => string | null | undefined;
  /** Quantité apportée par la ligne. */
  quantite: (l: Ligne) => number | null;
  /** Cases de texte : la liste des valeurs distinctes. */
  textes?: Record<string, (l: Ligne) => string>;
  /** Libellé de la ligne quand elle n'est pas classée — pour le Délégué. */
  decrire: (l: Ligne) => string;
  /**
   * Le total ne compte que les lignes CLASSÉES. Vrai pour la circulation : une
   * ligne « petits ruminants » n'est pas sûrement ovine, elle ne doit pas
   * grossir le total des ovins.
   */
  totalClasseesSeulement?: boolean;
  /**
   * Le tableau n'est alimenté qu'EN PARTIE par la liste : seules ces cases se
   * calculent, les autres se saisissent au trimestre. Absent : tout le
   * tableau se calcule.
   */
  categoriesProduites?: string[];
  /**
   * Les totaux additionnent les cases calculées ET saisies (des nombres de cas,
   * tous de même nature). Faux par défaut : on n'additionne pas des kg et des
   * boîtes.
   */
  totauxMixtes?: boolean;
}

// ------------------------------------------------------------------ référentiels

/** Espèce du référentiel → colonne des tableaux de clinique. */
const ESPECE_CLINIQUE: Record<string, string> = {
  ESP_BOVIN: "Bovine",
  ESP_OVIN: "Ovine",
  ESP_CAPRIN: "Caprine",
  ESP_PORCIN: "Porcine",
  ESP_EQUIN: "Equine",
  ESP_CANIN: "Canine",
  ESP_FELIN: "Féline",
  ESP_VOLAILLE: "Volaille",
};
/** Les espèces sans colonne propre, que le canevas range sous « Autres ». */
const ESPECES_AUTRES = new Set(["ESP_YACK", "ESP_CAMELIN", "ESP_ASIN", "ESP_AULACODE", "ESP_COBAYE", "ESP_PRIMATE", "ESP_AUTRE"]);

/**
 * Colonne d'une espèce dans un tableau de clinique. Le lapin s'écrit « Lapin »
 * au tableau des consultations et « Lapine » à celui des déparasitages : c'est
 * ainsi dans le canevas. Le tableau des castrations n'a que six colonnes.
 */
function colonneEspece(espece: string, lapin: string | null, avecAutres: boolean, colonnes?: string[]): string | null {
  let col: string | null = ESPECE_CLINIQUE[espece] ?? null;
  if (espece === "ESP_LAPIN") col = lapin;
  else if (!col && avecAutres && ESPECES_AUTRES.has(espece)) col = "Autres";
  if (col && colonnes && !colonnes.includes(col)) return null;
  return col;
}

/** Maladie du référentiel → colonne du tableau des vaccinations. */
const MALADIE_VACCINATION: Record<string, string> = {
  MAL_PPR: "PPR",
  MAL_NEWCASTLE: "MNC",
  MAL_GUMBORO: "Maladie de Gumboro",
  MAL_DERMATOSE_NODULAIRE: "Maladie nodulaire",
  MAL_PASTEURELLOSE: "Pasteurellose",
  MAL_COLIBACILLOSE_AVIAIRE: "Colibacillose",
};

/**
 * Maladie du référentiel → ligne du tableau des affections récurrentes.
 * La coccidiose n'y est rangée que chez la volaille : la ligne s'intitule
 * « Coccidiose aviaire ».
 */
function affection(maladie: string, espece: string): string | null {
  switch (maladie) {
    case "MAL_COCCIDIOSE":
      return espece === "ESP_VOLAILLE" ? "Coccidiose aviaire" : null;
    case "MAL_COLIBACILLOSE_AVIAIRE":
      return "Colibacilloses";
    case "MAL_FIEVRE_APHTEUSE":
      return "Fièvre aphteuse";
    case "MAL_NEWCASTLE":
      return "Maladies de New Castle";
    case "MAL_PASTEURELLOSE":
      return "Pasteurelloses";
    case "MAL_PPR":
      return "PPR";
    default:
      return null;
  }
}

/**
 * L'espèce d'une ligne de circulation intérieure (tableau 4.4), écrite en
 * TEXTE LIBRE au mensuel. Une ligne n'est rangée que si elle désigne une seule
 * espèce sans ambiguïté ; « petits ruminants » ou « bovins et ovins » restent
 * non classés.
 */
const MOTS_ESPECES: [string, RegExp][] = [
  ["bovin", /bovin|b(œ|oe)uf|vache|taureau|taurillon|g[ée]nisse|veau/i],
  ["ovin", /\bovin|mouton|brebis|b[ée]lier|agneau/i],
  // « bouc » en mot entier : « boucherie » le contient.
  ["caprin", /caprin|ch[eè]vre|\bboucs?\b|cabri/i],
  ["porcin", /porc|truie|verrat|cochon/i],
];
export function especeCirculation(libre: string): string | "ambigu" | null {
  const trouvees = MOTS_ESPECES.filter(([, re]) => re.test(libre)).map(([e]) => e);
  if (trouvees.length > 1 || /petits? ruminants?/i.test(libre)) return "ambigu";
  return trouvees[0] ?? null;
}

// ------------------------------------------------------------------ abattoirs (tableau 3.5)

/**
 * Motif d'une saisie en abattoir → ligne du tableau des lésions décelées.
 * La tuberculose est rangée en « partielle » (décision du Délégué) : le
 * mensuel ne distingue pas généralisée et partielle. Putréfaction et cachexie
 * n'ont pas de ligne au canevas : elles restent non classées.
 */
const LESION_DU_MOTIF: Record<string, string> = {
  MOTIF_CYSTICERCOSE: "Cysticercose",
  MOTIF_DISTOMATOSE: "Douves (Distomatose)",
  MOTIF_ABCES_GENERALISE: "Abcès divers",
  MOTIF_TUBERCULOSE: "Tuberculose partielle",
};

/**
 * Produit saisi en abattoir, écrit en TEXTE LIBRE au mensuel → ligne du
 * tableau des saisies. Une pièce nommée (abats, carcasse, foie…) est rangée à
 * sa ligne ; une espèce seule (« Bovins ») l'est sous « Chair de … »
 * (décision du Délégué). Le reste est non classé.
 */
export function produitSaisiEnAbattoir(libre: string): string | null {
  const t = libre.toLowerCase();
  const bovin = /bovin|b(œ|oe)uf|vache|taureau/.test(t);
  const porc = /porc/.test(t);
  if (/abat/.test(t)) return bovin ? "Abats bovins (Kg)" : porc ? "Abats porc (kg)" : null;
  if (/carcasse/.test(t)) return bovin ? "Carcasses bovines kg" : porc ? "Carcasse porc (Kg)" : null;
  if (/foie/.test(t)) return "Foie (Kg)";
  if (/poumon/.test(t)) return bovin ? "Poumons bovins" : "Poumons";
  if (/mamelle/.test(t)) return "Mamelle bovine";
  if (/\brein/.test(t)) return "Reins";
  if (/t[êe]te/.test(t)) return "Têtes";
  if (/patte/.test(t)) return "Pattes";
  // L'espèce seule, sans pièce : la chair.
  const especes: [RegExp, string][] = [
    [/bovin|b(œ|oe)uf|vache|taureau/, "Chair de bovins (kg)"],
    [/porc/, "Chair de porcins (Kg)"],
    [/caprin|ch[eè]vre|\bboucs?\b/, "Chair de caprins (Kg)"],
    [/\bovin|mouton|brebis/, "Chair d'ovins (Kg)"],
  ];
  const trouvees = especes.filter(([re]) => re.test(t));
  return trouvees.length === 1 ? trouvees[0][1] : null;
}

// ------------------------------------------------------------------ liaisons

const decrireClinique = (l: Ligne) =>
  [texte(l.activite), texte(l.espece), texte(l.maladie)].filter(Boolean).join(" · ");

/** Actes de clinique d'un type donné, par espèce (tableaux n° 65 à 67). */
function clinique(
  numero: number,
  titre: string,
  acte: string,
  lapin: string | null,
  avecAutres: boolean,
  colonnes?: string[]
): LiaisonEvenement {
  return {
    numero,
    titre,
    orientation: "lignes",
    sources: ["T33"],
    categorie: (l) =>
      l.activite !== acte ? undefined : colonneEspece(texte(l.espece), lapin, avecAutres, colonnes),
    quantite: (l) => nombre(l.effectif),
    decrire: decrireClinique,
  };
}

/**
 * Circulation intérieure d'une espèce (tableau 4.4 du mensuel). Une ligne d'une
 * autre espèce — ou de volaille, de produits — ne concerne pas ce tableau. Une
 * ligne AMBIGUË est signalée une seule fois, par le premier des tableaux de
 * circulation (`signaleAmbigus`), pas trois.
 */
function circulation(numero: number, titre: string, espece: string, signaleAmbigus = false): LiaisonEvenement {
  return {
    numero,
    titre,
    orientation: "lignes",
    sources: ["T44"],
    categorie: (l) => {
      const e = especeCirculation(texte(l.especeOuProduit));
      if (e === espece) return "Nombre de têtes";
      return e === "ambigu" && signaleAmbigus ? null : undefined;
    },
    quantite: (l) => nombre(l.effectif),
    totalClasseesSeulement: true,
    textes: {
      Provenance: (l) => texte(l.pointDepart),
      Destination: (l) => texte(l.destination),
    },
    decrire: (l) => `circulation « ${texte(l.especeOuProduit)} »`,
  };
}

export const LIAISONS_EVENEMENTS: LiaisonEvenement[] = [
  circulation(27, "Etat de la circulation intérieure des ovins par arrondissement", "ovin", true),
  circulation(32, "Situation de la circulation intérieure des animaux sur pied", "caprin"),
  circulation(109, "Situation de la circulation intérieure des porcins sur pied", "porcin"),
  {
    numero: 64,
    titre: "Situation générale de la vaccination par affection et par arrondissement",
    orientation: "lignes",
    // « Situation générale » : les vaccinations des services du MINEPIA
    // (tableau 3.2) ET celles des cliniques et partenaires privés (3.3).
    sources: ["T32", "T33"],
    categorie: (l, source) => {
      if (source === "T33" && l.activite !== "ACTE_VACCINATION_PRIVEE") return undefined;
      const maladie = texte(l.maladie);
      // La rage ne se range sous « Rage canine » que pour un chien vacciné.
      if (maladie === "MAL_RAGE") return texte(l.espece) === "ESP_CANIN" ? "Rage canine" : null;
      return MALADIE_VACCINATION[maladie] ?? null;
    },
    quantite: (l) => nombre(l.effectifVaccine ?? l.effectif),
    decrire: (l) => `vaccination ${texte(l.maladie)} · ${texte(l.espece)}`,
  },
  clinique(65, "Situation générale des consultations par espèces et par arrondissement", "ACTE_CONSULTATION", "Lapin", true),
  clinique(66, "Situation générale des déparasitages par espèces et par arrondissement", "ACTE_DEPARASITAGE", "Lapine", true),
  clinique(
    67,
    "Situation générale des castrations par espèces et par arrondissement",
    "ACTE_CASTRATION",
    null,
    false,
    ["Bovine", "Ovine", "Caprine", "Porcine", "Equine", "Canine"]
  ),
  {
    numero: 70,
    titre: "Récapitulatif des lésions décelées en inspection",
    // Les lésions en lignes, les arrondissements en colonnes.
    orientation: "colonnes",
    sources: ["T35"],
    // Une saisie en abattoir = un cas de la lésion qui l'a motivée. Les autres
    // lésions, que le mensuel ne relève pas, se saisissent au trimestre.
    categorie: (l) => LESION_DU_MOTIF[texte(l.affection)] ?? null,
    quantite: () => 1,
    categoriesProduites: Object.values(LESION_DU_MOTIF),
    totauxMixtes: true,
    decrire: (l) => `saisie en abattoir, motif ${texte(l.affection)} (${texte(l.produitSaisi)})`,
  },
  {
    numero: 71,
    titre: "Récapitulatif des saisies effectuées après inspection",
    orientation: "colonnes",
    // Les saisies en ABATTOIR (tableau 3.5), en kg. Celles des marchés
    // (tableau 3.4) viennent de liaison.ts ; les deux s'additionnent.
    sources: ["T35"],
    categorie: (l) => produitSaisiEnAbattoir(texte(l.produitSaisi)),
    quantite: (l) => nombre(l.quantiteKg),
    categoriesProduites: [
      "Abats bovins (Kg)", "Abats porc (kg)", "Carcasses bovines kg", "Carcasse porc (Kg)", "Foie (Kg)",
      "Poumons", "Poumons bovins", "Mamelle bovine", "Reins", "Têtes", "Pattes",
      "Chair de bovins (kg)", "Chair de porcins (Kg)", "Chair de caprins (Kg)", "Chair d'ovins (Kg)",
    ],
    decrire: (l) => `saisie en abattoir « ${texte(l.produitSaisi)} »`,
  },
  {
    numero: 68,
    titre: "Récapitulation des affections récurrentes",
    // Les affections en lignes, les arrondissements en colonnes.
    orientation: "colonnes",
    sources: ["T33"],
    // Un cas pris en charge en clinique, quel que soit l'acte — sauf la
    // vaccination, qui prévient une maladie et n'en soigne pas.
    categorie: (l) => {
      if (l.activite === "ACTE_VACCINATION_PRIVEE" || !texte(l.maladie)) return undefined;
      return affection(texte(l.maladie), texte(l.espece));
    },
    quantite: (l) => nombre(l.effectif),
    decrire: decrireClinique,
  },
];

/** La liaison d'un tableau alimenté par les listes du mensuel, s'il en a une. */
export function liaisonEvenementDe(numero: number | null): LiaisonEvenement | undefined {
  if (numero == null) return undefined;
  return LIAISONS_EVENEMENTS.find((l) => l.numero === numero);
}

// ------------------------------------------------------------------ calcul

/** Les cases d'un tableau pour une période : catégorie → arrondissement (null = département) → valeur. */
export interface CasesEvenement {
  nombres: Map<string, Map<string | null, number>>;
  /** Total de TOUTES les lignes de la source, classées ou non. */
  totaux: Map<string | null, number>;
  textes: Map<string, Map<string | null, Set<string>>>;
}

export interface LigneNonClassee {
  tableau: string;
  arrondissement: string;
  ligne: string;
  quantite: number | null;
}

export interface DonneesEvenements {
  courant: Map<number, CasesEvenement>;
  precedent: Map<number, CasesEvenement>;
  nonClassees: LigneNonClassee[];
}

const vides = (): CasesEvenement => ({ nombres: new Map(), totaux: new Map(), textes: new Map() });

function ajouter<K>(m: Map<K, number>, k: K, v: number) {
  m.set(k, (m.get(k) ?? 0) + v);
}

/** Les lignes d'événements transmises sur une période. */
async function lignesDe(
  db: PrismaClient,
  p: Periode,
  sources: string[],
  arrondissementId?: string
): Promise<{ source: string; arrondissement: string; payload: Ligne }[]> {
  const etat = await inspecterPeriode(db, p, { arrondissementId });
  const periodeIds = etat.mois.filter((m) => m.periodeId).map((m) => m.periodeId!);
  if (periodeIds.length === 0) return [];
  const lignes = await db.saisieEvenement.findMany({
    where: {
      template: { code: { in: sources } },
      rapport: {
        periodeId: { in: periodeIds },
        statut: { in: [...STATUTS_TRANSMIS] },
        ...(arrondissementId ? { arrondissementId } : {}),
      },
    },
    select: {
      payload: true,
      template: { select: { code: true } },
      rapport: { select: { arrondissement: { select: { code: true } } } },
    },
  });
  return lignes.map((l) => ({
    source: l.template.code,
    arrondissement: l.rapport.arrondissement.code,
    payload: (l.payload ?? {}) as Ligne,
  }));
}

function calculer(
  lignes: { source: string; arrondissement: string; payload: Ligne }[],
  nonClassees: LigneNonClassee[] | null
): Map<number, CasesEvenement> {
  const resultat = new Map<number, CasesEvenement>();
  for (const liaison of LIAISONS_EVENEMENTS) {
    const cases = vides();
    resultat.set(liaison.numero, cases);
    for (const { source, arrondissement, payload } of lignes) {
      if (!liaison.sources.includes(source)) continue;
      const cat = liaison.categorie(payload, source);
      if (cat === undefined) continue;
      const q = liaison.quantite(payload);
      if (q != null && (cat !== null || !liaison.totalClasseesSeulement)) {
        ajouter(cases.totaux, arrondissement, q);
        ajouter(cases.totaux, null, q);
      }
      if (cat === null) {
        nonClassees?.push({ tableau: liaison.titre, arrondissement, ligne: liaison.decrire(payload), quantite: q });
        continue;
      }
      if (q != null) {
        const parArr = cases.nombres.get(cat) ?? new Map<string | null, number>();
        cases.nombres.set(cat, parArr);
        ajouter(parArr, arrondissement, q);
        ajouter(parArr, null, q);
      }
      for (const [col, lire] of Object.entries(liaison.textes ?? {})) {
        const v = lire(payload);
        if (!v) continue;
        const parArr = cases.textes.get(col) ?? new Map<string | null, Set<string>>();
        cases.textes.set(col, parArr);
        for (const a of [arrondissement, null]) {
          const s = parArr.get(a) ?? new Set<string>();
          s.add(v);
          parArr.set(a, s);
        }
      }
    }
  }
  return resultat;
}

/** Additionne les listes mensuelles de la période et de la même période l'an passé. */
export async function preparerEvenements(
  db: PrismaClient,
  periode: Periode,
  options: { arrondissementId?: string } = {}
): Promise<DonneesEvenements> {
  const sources = Array.from(new Set(LIAISONS_EVENEMENTS.flatMap((l) => l.sources)));
  const nonClassees: LigneNonClassee[] = [];
  const courant = calculer(await lignesDe(db, periode, sources, options.arrondissementId), nonClassees);
  let precedent = new Map<number, CasesEvenement>();
  try {
    precedent = calculer(await lignesDe(db, memePeriodeAnneePrecedente(periode), sources, options.arrondissementId), null);
  } catch {
    // L'an passé absent prive le rapport de sa comparaison, pas de la période.
  }
  return { courant, precedent, nonClassees };
}

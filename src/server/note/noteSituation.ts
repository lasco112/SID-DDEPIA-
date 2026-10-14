/**
 * La NOTE DE SITUATION du département (demande du Délégué, 14 octobre 2026) :
 * une lecture rapide de la situation, à présenter en dix minutes au plus —
 * chiffres clés, faits saillants, quelques graphiques, et ce que valent les
 * chiffres (rapports transmis ou non). Le Délégué choisit les mois : un mois,
 * plusieurs, un ou plusieurs trimestres.
 *
 * Le mensuel n'est que LU : les mêmes calculs que le rapport trimestriel
 * (agregation.ts — un stock prend le dernier mois renseigné, un flux
 * s'additionne, les arrondissements se somment). Les faits saillants sont
 * écrits par des règles, à partir des chiffres : pas d'intelligence
 * artificielle, rien qui ne se vérifie dans les tableaux.
 */
import type { PrismaClient } from "@prisma/client";
import { agreger, STATUTS_TRANSMIS, type ValeurAgregee } from "@/server/trimestre/agregation";
import { mensuelle } from "@/server/periodes/calendrier";
import { identiteDepartement } from "@/lib/departement";
import type { DonneesGraphique } from "@/server/trimestre/canevas/graphiques";

export interface MoisChoisi {
  annee: number;
  mois: number;
}

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const ORDINAUX = ["1er", "2e", "3e", "4e"];
/** Au-delà, la note ne serait plus une lecture rapide. */
export const MOIS_MAX = 24;

export const libelleMois = (m: MoisChoisi) => `${NOMS_MOIS[m.mois - 1]} ${m.annee}`;
const rangMois = (m: MoisChoisi) => m.annee * 12 + (m.mois - 1);
const deRang = (r: number): MoisChoisi => ({ annee: Math.floor(r / 12), mois: (r % 12) + 1 });

/** « 2026-07 » → { annee: 2026, mois: 7 } ; null si illisible. */
export function lireMois(s: unknown): MoisChoisi | null {
  const m = /^(\d{4})-(\d{1,2})$/.exec(String(s ?? ""));
  if (!m) return null;
  const annee = Number(m[1]);
  const mois = Number(m[2]);
  return annee >= 2000 && annee <= 2100 && mois >= 1 && mois <= 12 ? { annee, mois } : null;
}

/** Les mois de `debut` à `fin`, inclus. */
export function moisEntre(debut: MoisChoisi, fin: MoisChoisi): MoisChoisi[] {
  const a = rangMois(debut);
  const b = rangMois(fin);
  if (b < a) throw new ErreurNote("Le mois de fin précède le mois de début.");
  if (b - a + 1 > MOIS_MAX) throw new ErreurNote(`Une note de situation couvre au plus ${MOIS_MAX} mois.`);
  return Array.from({ length: b - a + 1 }, (_, i) => deRang(a + i));
}

/**
 * Le nom de la période, tel qu'on le dit : « septembre 2026 », « 3e trimestre
 * 2026 », « 2e et 3e trimestres 2026 », « année 2026 », « de juillet à
 * novembre 2026 ».
 */
export function libellePlage(mois: MoisChoisi[]): string {
  const d = mois[0];
  const f = mois[mois.length - 1];
  if (mois.length === 1) return libelleMois(d);
  if (mois.length === 12 && d.mois === 1) return `année ${d.annee}`;
  if (mois.length % 3 === 0 && (d.mois - 1) % 3 === 0) {
    const tri = (m: MoisChoisi) => (m.mois - 1) / 3 + 1;
    const trimestres = Array.from({ length: mois.length / 3 }, (_, i) => mois[i * 3]);
    if (trimestres.length === 1) return `${ORDINAUX[tri(d) - 1]} trimestre ${d.annee}`;
    if (d.annee === f.annee) {
      const noms = trimestres.map((t) => ORDINAUX[tri(t) - 1]);
      return `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]} trimestres ${d.annee}`;
    }
    return `du ${ORDINAUX[tri(d) - 1]} trimestre ${d.annee} au ${ORDINAUX[(f.mois - 3) / 3]} trimestre ${f.annee}`;
  }
  return d.annee === f.annee
    ? `de ${NOMS_MOIS[d.mois - 1]} à ${NOMS_MOIS[f.mois - 1]} ${d.annee}`
    : `de ${libelleMois(d)} à ${libelleMois(f)}`;
}

export class ErreurNote extends Error {}

/** « 12 579 » : espaces insécables, lisibles partout (PowerPoint, Word, PDF). */
export const nb = (v: number, decimales = 0) =>
  v.toLocaleString("fr-FR", { maximumFractionDigits: decimales }).replace(/[  ]/g, " ");

// ------------------------------------------------------------------ indicateurs

interface DefIndicateur {
  cle: string;
  libelle: string;
  unite: string;
  filtre: (code: string) => boolean;
  /** Un effectif à une date (le dernier mois), pas un cumul. */
  stock?: boolean;
  decimales?: number;
}

const DEFS: DefIndicateur[] = [
  { cle: "bovins", libelle: "Cheptel bovin", unite: "têtes", stock: true, filtre: (c) => c === "T11_CHEPTEL_BOVIN" },
  { cle: "petitsRuminants", libelle: "Ovins et caprins", unite: "têtes", stock: true, filtre: (c) => c === "T11_CHEPTEL_OVIN" || c === "T11_CHEPTEL_CAPRIN" },
  { cle: "porcins", libelle: "Cheptel porcin", unite: "têtes", stock: true, filtre: (c) => c === "T11_CHEPTEL_PORCIN" },
  { cle: "volaille", libelle: "Volaille", unite: "têtes", stock: true, filtre: (c) => c.startsWith("T12_VOL_") },
  { cle: "abattages", libelle: "Abattages contrôlés", unite: "têtes (bétail)", filtre: (c) => /^T21_ABAT_(BOVIN|OVIN|CAPRIN|PORCIN)$/.test(c) },
  { cle: "viande", libelle: "Viande produite", unite: "tonnes", decimales: 1, filtre: (c) => c.startsWith("T22_VIANDE_") },
  { cle: "lait", libelle: "Lait frais", unite: "litres", filtre: (c) => c === "T25_LAIT_FRAIS" },
  { cle: "oeufs", libelle: "Œufs de table", unite: "œufs", filtre: (c) => c === "T14_OEUFS_PRODUITS" },
  { cle: "poisson", libelle: "Poisson produit", unite: "tonnes", decimales: 1, filtre: (c) => /^T1[67]_POISSON_/.test(c) },
  { cle: "ventes", libelle: "Animaux vendus", unite: "têtes (marchés)", filtre: (c) => /^T5\d_.*_VENDU_D\d$/.test(c) },
];

/** Les espèces de la commercialisation : un tableau du mensuel chacune. */
const VENTES_PAR_ESPECE: { libelle: string; prefixe: string }[] = [
  { libelle: "Bovins", prefixe: "T51_" },
  { libelle: "Ovins", prefixe: "T52_" },
  { libelle: "Caprins", prefixe: "T53_" },
  { libelle: "Porcins", prefixe: "T54_" },
  { libelle: "Volailles", prefixe: "T55_" },
  { libelle: "Asins et équins", prefixe: "T56_" },
];

export interface Indicateur {
  cle: string;
  libelle: string;
  unite: string;
  valeur: number | null;
  reference: number | null;
  /** En %, arrondi au dixième ; null sans comparaison possible. */
  evolution: number | null;
  /** Une hausse est-elle une bonne nouvelle ? (les foyers de maladie : non) */
  hausseFavorable: boolean;
  decimales: number;
  parArrondissement: { nom: string; valeur: number | null }[];
}

export interface FaitSaillant {
  texte: string;
  genre: "hausse" | "baisse" | "alerte" | "info" | "fiabilite";
}

export interface FoyerMaladie {
  maladie: string;
  foyers: number;
  morts: number;
  arrondissements: string[];
}

export interface NoteSituation {
  departement: { nom: string; sigle: string; nomAvecArticle: string };
  periode: { libelle: string; debut: MoisChoisi; fin: MoisChoisi; nbMois: number };
  /** Ce à quoi on compare : la même période l'an passé, ou la précédente. */
  comparaison: { libelle: string; nature: "an_passe" | "precedente" } | null;
  couverture: {
    arrondissements: string[];
    mois: string[];
    /** [arrondissement][mois] : rapport transmis ? */
    transmis: boolean[][];
    attendus: number;
    recus: number;
    manquants: { arrondissement: string; mois: string[] }[];
  };
  indicateurs: Indicateur[];
  sante: {
    foyers: FoyerMaladie[];
    totalFoyers: number;
    totalMorts: number;
    vaccinations: { maladie: string; effectif: number }[];
    totalVaccines: number;
  };
  faits: FaitSaillant[];
  graphiques: {
    cheptel: DonneesGraphique | null;
    abattages: DonneesGraphique | null;
    vaccinations: DonneesGraphique | null;
    ventes: DonneesGraphique | null;
  };
  produitLe: string;
}

const evolution = (v: number | null, ref: number | null) =>
  v == null || ref == null || ref === 0 ? null : Math.round(((v - ref) / ref) * 1000) / 10;

/** Le mois (en base) de chaque mois choisi, et les rapports transmis de chacun. */
async function rapportsDes(db: PrismaClient, mois: MoisChoisi[]) {
  const periodes = await db.periodeReporting.findMany({
    where: { type: "MENSUEL", OR: mois.map((m) => ({ annee: m.annee, mois: m.mois })) },
    select: { id: true, annee: true, mois: true },
  });
  const transmis = periodes.length
    ? await db.rapportArrondissement.findMany({
        where: { periodeId: { in: periodes.map((p) => p.id) }, statut: { in: [...STATUTS_TRANSMIS] } },
        select: { periodeId: true, arrondissementId: true },
      })
    : [];
  return { periodes, transmis };
}

/** La période de comparaison : les mêmes mois l'an passé s'ils ont des chiffres, sinon les mois qui précèdent. */
async function choisirComparaison(db: PrismaClient, mois: MoisChoisi[]) {
  const anPasse = mois.map((m) => ({ annee: m.annee - 1, mois: m.mois }));
  if ((await rapportsDes(db, anPasse)).transmis.length > 0) return { mois: anPasse, nature: "an_passe" as const };
  const debut = rangMois(mois[0]);
  const precedents = Array.from({ length: mois.length }, (_, i) => deRang(debut - mois.length + i));
  if ((await rapportsDes(db, precedents)).transmis.length > 0) return { mois: precedents, nature: "precedente" as const };
  return null;
}

/** Une consolidation des mois choisis, valeurs du département et de chaque arrondissement. */
async function consolider(db: PrismaClient, mois: MoisChoisi[], champs: string[]): Promise<ValeurAgregee[]> {
  if (champs.length === 0) return [];
  // La période nominale ne sert qu'à l'intitulé interne : les mois choisis la remplacent.
  const { valeurs } = await agreger(db, mensuelle(mois[0].annee, mois[0].mois), { champs, mois, autoriserIncomplet: true });
  return valeurs;
}

/** La somme d'un groupe de champs, au département (`null`) ou pour un arrondissement. */
function somme(valeurs: ValeurAgregee[], filtre: (code: string) => boolean, arrondissement: string | null): number | null {
  let s: number | null = null;
  for (const v of valeurs) {
    if (v.arrondissementCode !== arrondissement || !filtre(v.fieldCode) || v.valeur == null) continue;
    s = (s ?? 0) + v.valeur;
  }
  return s == null ? null : Math.round(s * 1000) / 1000;
}

/** Foyers et vaccinations : les listes 3.1 et 3.2 du mensuel, rapports transmis seulement. */
async function santeAnimale(db: PrismaClient, mois: MoisChoisi[]) {
  const { periodes } = await rapportsDes(db, mois);
  const lignes = periodes.length
    ? await db.saisieEvenement.findMany({
        where: {
          template: { code: { in: ["T31", "T32"] } },
          rapport: { periodeId: { in: periodes.map((p) => p.id) }, statut: { in: [...STATUTS_TRANSMIS] } },
        },
        select: { payload: true, template: { select: { code: true } }, rapport: { select: { arrondissement: { select: { nom: true } } } } },
      })
    : [];
  const n = (x: unknown) => {
    const v = Number(x);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const codes = new Set<string>();
  for (const l of lignes) {
    const m = (l.payload as Record<string, unknown> | null)?.maladie;
    if (typeof m === "string") codes.add(m);
  }
  const libelles = new Map(
    (await db.referentielItem.findMany({ where: { code: { in: Array.from(codes) } }, select: { code: true, libelle: true } })).map((r) => [r.code, r.libelle])
  );
  const nomMaladie = (code: unknown) => (typeof code === "string" ? (libelles.get(code) ?? code.replace(/^MAL_/, "").replace(/_/g, " ")) : "Maladie non précisée");

  const foyers = new Map<string, FoyerMaladie>();
  const vaccinations = new Map<string, number>();
  for (const l of lignes) {
    const p = (l.payload ?? {}) as Record<string, unknown>;
    const maladie = nomMaladie(p.maladie);
    if (l.template.code === "T31") {
      const f = foyers.get(maladie) ?? { maladie, foyers: 0, morts: 0, arrondissements: [] };
      // Une ligne déclarée sans nombre de foyers en compte au moins un.
      f.foyers += n(p.nbFoyers) || 1;
      f.morts += n(p.morts);
      if (!f.arrondissements.includes(l.rapport.arrondissement.nom)) f.arrondissements.push(l.rapport.arrondissement.nom);
      foyers.set(maladie, f);
    } else {
      vaccinations.set(maladie, (vaccinations.get(maladie) ?? 0) + n(p.effectifVaccine));
    }
  }
  const listeFoyers = Array.from(foyers.values()).sort((a, b) => b.foyers - a.foyers);
  const listeVaccinations = Array.from(vaccinations.entries()).map(([maladie, effectif]) => ({ maladie, effectif })).filter((v) => v.effectif > 0).sort((a, b) => b.effectif - a.effectif);
  return {
    foyers: listeFoyers,
    totalFoyers: listeFoyers.reduce((s, f) => s + f.foyers, 0),
    totalMorts: listeFoyers.reduce((s, f) => s + f.morts, 0),
    vaccinations: listeVaccinations,
    totalVaccines: listeVaccinations.reduce((s, v) => s + v.effectif, 0),
    aDesLignes: lignes.length > 0,
  };
}

// ------------------------------------------------------------------ la note

export async function preparerNote(db: PrismaClient, debut: MoisChoisi, fin: MoisChoisi): Promise<NoteSituation> {
  const mois = moisEntre(debut, fin);
  const identite = await identiteDepartement(db);
  const arrondissements = await db.arrondissement.findMany({ orderBy: { ordre: "asc" }, select: { id: true, code: true, nom: true } });

  // --- Ce que valent les chiffres : les rapports transmis, mois par mois.
  const { periodes, transmis } = await rapportsDes(db, mois);
  const periodeDe = (m: MoisChoisi) => periodes.find((p) => p.annee === m.annee && p.mois === m.mois)?.id;
  const recu = (arrId: string, m: MoisChoisi) => {
    const pid = periodeDe(m);
    return Boolean(pid && transmis.some((t) => t.periodeId === pid && t.arrondissementId === arrId));
  };
  const grille = arrondissements.map((a) => mois.map((m) => recu(a.id, m)));
  const recus = grille.flat().filter(Boolean).length;
  if (recus === 0) throw new ErreurNote(`Aucun rapport mensuel transmis pour ${libellePlage(mois)} : il n'y a rien à présenter.`);
  const manquants = arrondissements
    .map((a, i) => ({ arrondissement: a.nom, mois: mois.filter((_, k) => !grille[i][k]).map((m) => NOMS_MOIS[m.mois - 1]) }))
    .filter((x) => x.mois.length > 0);

  // --- Les chiffres, et ceux de la période de comparaison.
  const champs = (await db.formField.findMany({ where: { actif: true }, select: { code: true } }))
    .map((c) => c.code)
    .filter((c) => DEFS.some((d) => d.filtre(c)));
  const comparaison = await choisirComparaison(db, mois);
  const [valeurs, valeursRef] = await Promise.all([
    consolider(db, mois, champs),
    comparaison ? consolider(db, comparaison.mois, champs) : Promise.resolve([] as ValeurAgregee[]),
  ]);
  const [sante, santeRef] = await Promise.all([
    santeAnimale(db, mois),
    comparaison ? santeAnimale(db, comparaison.mois) : Promise.resolve(null),
  ]);

  const indicateurs: Indicateur[] = DEFS.map((d) => {
    const valeur = somme(valeurs, d.filtre, null);
    const reference = comparaison ? somme(valeursRef, d.filtre, null) : null;
    return {
      cle: d.cle,
      libelle: d.libelle,
      unite: d.unite,
      valeur,
      reference,
      evolution: evolution(valeur, reference),
      hausseFavorable: true,
      decimales: d.decimales ?? 0,
      parArrondissement: arrondissements.map((a) => ({ nom: a.nom, valeur: somme(valeurs, d.filtre, a.code) })),
    };
  });
  // Un rapport transmis sans foyer déclaré dit « aucun foyer » : zéro est alors le vrai chiffre.
  {
    indicateurs.push(
      {
        cle: "vaccines", libelle: "Animaux vaccinés", unite: "têtes", decimales: 0, hausseFavorable: true,
        valeur: sante.totalVaccines, reference: santeRef ? santeRef.totalVaccines : null,
        evolution: evolution(sante.totalVaccines, santeRef ? santeRef.totalVaccines : null), parArrondissement: [],
      },
      {
        cle: "foyers", libelle: "Foyers de maladie", unite: "foyers déclarés", decimales: 0, hausseFavorable: false,
        valeur: sante.totalFoyers, reference: santeRef ? santeRef.totalFoyers : null,
        evolution: evolution(sante.totalFoyers, santeRef ? santeRef.totalFoyers : null), parArrondissement: [],
      }
    );
  }

  const libelleRef = comparaison ? libellePlage(comparaison.mois) : null;
  const note: NoteSituation = {
    departement: { nom: identite.nom, sigle: identite.sigle, nomAvecArticle: identite.nomAvecArticle },
    periode: { libelle: libellePlage(mois), debut: mois[0], fin: mois[mois.length - 1], nbMois: mois.length },
    comparaison: comparaison && libelleRef ? { libelle: libelleRef, nature: comparaison.nature } : null,
    couverture: {
      arrondissements: arrondissements.map((a) => a.nom),
      mois: mois.map((m) => NOMS_MOIS[m.mois - 1]),
      transmis: grille,
      attendus: arrondissements.length * mois.length,
      recus,
      manquants,
    },
    indicateurs,
    sante: { foyers: sante.foyers, totalFoyers: sante.totalFoyers, totalMorts: sante.totalMorts, vaccinations: sante.vaccinations, totalVaccines: sante.totalVaccines },
    faits: [],
    graphiques: { cheptel: null, abattages: null, vaccinations: null, ventes: null },
    produitLe: new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }),
  };
  note.graphiques = graphiques(note, valeurs, valeursRef, arrondissements);
  note.faits = faitsSaillants(note);
  return note;
}

// ------------------------------------------------------------------ graphiques

function graphiques(
  note: NoteSituation,
  valeurs: ValeurAgregee[],
  valeursRef: ValeurAgregee[],
  arrondissements: { code: string; nom: string }[]
): NoteSituation["graphiques"] {
  const ind = (cle: string) => note.indicateurs.find((i) => i.cle === cle)!;
  const noms = arrondissements.map((a) => a.nom);
  const garder = (g: DonneesGraphique): DonneesGraphique | null => {
    const series = g.series.filter((s) => s.valeurs.some((v) => v != null));
    return series.length && series.reduce((n, s) => n + s.valeurs.filter((v) => v != null).length, 0) >= 2 ? { ...g, series } : null;
  };

  const cheptel = garder({
    titre: "Cheptel par arrondissement (têtes)",
    categories: noms,
    series: ["bovins", "petitsRuminants", "porcins"].map((c) => ({ nom: ind(c).libelle, valeurs: ind(c).parArrondissement.map((p) => p.valeur) })),
  });

  const filtreAbattages = DEFS.find((d) => d.cle === "abattages")!.filtre;
  const abattages = garder({
    titre: "Abattages contrôlés par arrondissement (têtes de bétail)",
    categories: noms,
    series: [
      { nom: note.periode.libelle, valeurs: arrondissements.map((a) => somme(valeurs, filtreAbattages, a.code)) },
      ...(note.comparaison ? [{ nom: note.comparaison.libelle, valeurs: arrondissements.map((a) => somme(valeursRef, filtreAbattages, a.code)) }] : []),
    ],
  });

  const top = note.sante.vaccinations.slice(0, 8);
  const vaccinations = garder({
    titre: "Animaux vaccinés, par maladie",
    categories: top.map((v) => v.maladie),
    series: [{ nom: "Animaux vaccinés", valeurs: top.map((v) => v.effectif) }],
  });

  const ventes = garder({
    titre: "Animaux vendus sur les marchés, par espèce",
    categories: VENTES_PAR_ESPECE.map((e) => e.libelle),
    series: [
      {
        nom: note.periode.libelle,
        valeurs: VENTES_PAR_ESPECE.map((e) => somme(valeurs, (c) => c.startsWith(e.prefixe) && /_VENDU_D\d$/.test(c), null)),
      },
      ...(note.comparaison
        ? [{ nom: note.comparaison.libelle, valeurs: VENTES_PAR_ESPECE.map((e) => somme(valeursRef, (c) => c.startsWith(e.prefixe) && /_VENDU_D\d$/.test(c), null)) }]
        : []),
    ],
  });
  return { cheptel, abattages, vaccinations, ventes };
}

// ------------------------------------------------------------------ faits saillants

/** « au 3e trimestre 2025 », « à septembre 2025 », « à l'année 2025 », « à la période de juillet à août 2025 ». */
export function aLaPeriode(libelle: string): string {
  if (/^(\d|1er)/.test(libelle)) return `au ${libelle}`;
  if (libelle.startsWith("année")) return `à l'${libelle}`;
  if (/^(de|du) /.test(libelle)) return `à la période ${libelle.replace(/^du /, "du ")}`;
  return `à ${libelle}`;
}

/** « Charbon bactéridien » → « charbon bactéridien » dans une phrase ; un sigle (« PPR ») reste tel quel. */
export const enPhrase = (nom: string) => (/^[A-ZÉÈ]{2,}\b/.test(nom) ? nom : nom.charAt(0).toLowerCase() + nom.slice(1));

/** Seuil d'une évolution qui mérite d'être dite. */
const SEUIL = 10;

function faitsSaillants(note: NoteSituation): FaitSaillant[] {
  const faits: FaitSaillant[] = [];
  const { couverture, comparaison } = note;
  const valeur = (i: Indicateur) => `${nb(i.valeur!, i.decimales)} ${i.unite}`;

  // 1. Ce que valent les chiffres — d'abord, s'il y a lieu.
  if (couverture.recus < couverture.attendus) {
    const manque = couverture.attendus - couverture.recus;
    const detail = couverture.manquants
      .slice(0, 3)
      .map((m) => `${m.arrondissement} (${m.mois.join(", ")})`)
      .join(" ; ");
    faits.push({
      genre: "fiabilite",
      texte:
        `Chiffres provisoires : ${manque} rapport${manque > 1 ? "s" : ""} mensuel${manque > 1 ? "s" : ""} sur ${couverture.attendus} ` +
        `ne ${manque > 1 ? "sont" : "est"} pas transmis — ${detail}${couverture.manquants.length > 3 ? "…" : ""}.`,
    });
  }

  // 2. Les plus fortes évolutions.
  if (comparaison) {
    const reference = comparaison.nature === "an_passe" ? `par rapport ${aLaPeriode(comparaison.libelle)}` : `par rapport à la période précédente (${comparaison.libelle})`;
    const notables = note.indicateurs
      .filter((i) => i.evolution != null && Math.abs(i.evolution) >= SEUIL && i.valeur != null)
      .sort((a, b) => Math.abs(b.evolution!) - Math.abs(a.evolution!))
      .slice(0, 3);
    for (const i of notables) {
      const hausse = i.evolution! > 0;
      const bon = hausse === i.hausseFavorable;
      faits.push({
        genre: bon ? "hausse" : i.cle === "foyers" ? "alerte" : "baisse",
        texte: `${i.libelle} : ${valeur(i)}, en ${hausse ? "hausse" : "baisse"} de ${nb(Math.abs(i.evolution!), 1)} % ${reference}.`,
      });
    }
    if (notables.length === 0) {
      faits.push({ genre: "info", texte: `Les principaux indicateurs sont stables ${reference} (écarts inférieurs à ${SEUIL} %).` });
    }
  } else {
    faits.push({
      genre: "info",
      texte: "Pas de comparaison possible : le SID n'a ni les mêmes mois de l'an passé, ni ceux de la période précédente.",
    });
  }

  // 3. Où se trouve l'essentiel du cheptel bovin, et des abattages.
  for (const cle of ["bovins", "abattages"]) {
    const i = note.indicateurs.find((x) => x.cle === cle);
    if (!i?.valeur) continue;
    const tete = [...i.parArrondissement].filter((p) => p.valeur != null).sort((a, b) => b.valeur! - a.valeur!)[0];
    if (!tete?.valeur) continue;
    const part = Math.round((tete.valeur / i.valeur) * 100);
    faits.push({
      genre: "info",
      texte:
        cle === "bovins"
          ? `${tete.nom} porte ${part} % du cheptel bovin du département (${nb(tete.valeur)} têtes sur ${nb(i.valeur)}).`
          : `${tete.nom} réalise ${part} % des abattages contrôlés de bétail (${nb(tete.valeur)} têtes).`,
    });
  }

  // 4. La santé animale.
  const { sante } = note;
  if (sante.totalFoyers > 0) {
    const principal = sante.foyers[0];
    faits.push({
      genre: "alerte",
      texte:
        `${nb(sante.totalFoyers)} foyer${sante.totalFoyers > 1 ? "s" : ""} de maladie déclaré${sante.totalFoyers > 1 ? "s" : ""}` +
        (sante.foyers.length > 1 ? `, dont ${nb(principal.foyers)} de ${enPhrase(principal.maladie)}` : ` de ${enPhrase(principal.maladie)}`) +
        ` (${principal.arrondissements.join(", ")})` +
        (sante.totalMorts > 0 ? ` ; ${nb(sante.totalMorts)} animaux morts.` : "."),
    });
  } else if (note.indicateurs.some((i) => i.cle === "foyers")) {
    faits.push({ genre: "info", texte: "Aucun foyer de maladie déclaré sur la période." });
  }
  if (sante.totalVaccines > 0) {
    const v = sante.vaccinations[0];
    faits.push({
      genre: "info",
      texte: `${nb(sante.totalVaccines)} animaux vaccinés ; première maladie visée : ${enPhrase(v.maladie)} (${Math.round((v.effectif / sante.totalVaccines) * 100)} % des vaccinations).`,
    });
  }
  return faits;
}

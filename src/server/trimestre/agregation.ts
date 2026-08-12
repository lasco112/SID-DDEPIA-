/**
 * Moteur d'agrégation multi-mois — étape E4.
 *
 * Consolide les mois d'une période (trimestre, semestre, année) en appliquant à
 * chaque champ la règle de `reglesChamps.ts`.
 *
 * DEUX DIMENSIONS, DEUX RÈGLES DIFFÉRENTES — c'est le point à ne jamais perdre
 * de vue :
 *
 *   entre ARRONDISSEMENTS, à mois égal : TOUJOURS une somme. Les six
 *   arrondissements d'un même mois s'additionnent, qu'il s'agisse d'un stock ou
 *   d'un flux : 12 664 bovins au département, c'est bien la somme des six.
 *
 *   entre MOIS : selon la nature du champ. Un flux s'additionne, un stock ne
 *   s'additionne pas.
 *
 * L'ORDRE COMPTE. On applique d'abord la règle temporelle À CHAQUE
 * ARRONDISSEMENT, puis on somme les arrondissements. L'inverse serait faux dès
 * que les arrondissements n'ont pas renseigné les mêmes mois : si Dschang a
 * déclaré son cheptel en septembre et Fokoué seulement en août, « la dernière
 * valeur du département » n'existe pas, mais « la dernière valeur de chacun »
 * existe et se somme.
 *
 * REFUS DE CALCULER. Le moteur ne produit jamais un trimestre silencieusement
 * bancal : un mois absent, ou présent mais non validé, est signalé, et le
 * calcul est refusé sauf demande explicite. Un chiffre couvrant deux mois sur
 * trois, présenté comme un trimestre, est un faux.
 */
import type { PrismaClient } from "@prisma/client";
import {
  type Periode, moisDeLaPeriode, libelleOfficiel, libelleCourt,
} from "../periodes/calendrier";
import {
  type RegleAgregation, regleDuChamp, champsDePonderation, verifierCouverture,
} from "./reglesChamps";

/** Statuts d'un rapport d'arrondissement qui valent « donnée transmise ». */
const STATUTS_TRANSMIS = ["SOUMIS", "CLOTURE"] as const;

/**
 * Les valeurs sont stockées en `Decimal(14,3)`. Additionnées en virgule
 * flottante, elles dérivent : 91,875 + 90 + 104 donne 285,87499999999994 selon
 * l'ordre des opérations. Aucun rapport officiel ne peut porter un tel nombre,
 * et deux chemins de calcul donneraient des totaux différents au dernier
 * chiffre. On ramène systématiquement à la précision de la source : une somme
 * de valeurs à trois décimales ne peut pas en avoir davantage.
 */
const DECIMALES = 3;
function arrondir(v: number): number {
  return Math.round(v * 10 ** DECIMALES) / 10 ** DECIMALES;
}

export interface MoisSource {
  annee: number;
  mois: number;
  periodeId: string | null;
  /** Nombre d'arrondissements ayant transmis, sur six. */
  arrondissementsTransmis: number;
  /** Vrai si le mois existe ET que les six arrondissements ont transmis. */
  complet: boolean;
}

export interface EtatPeriode {
  periode: Periode;
  libelle: string;
  mois: MoisSource[];
  moisAbsents: string[];
  moisIncomplets: string[];
  /** Vrai si tous les mois existent et sont complets. */
  calculable: boolean;
  /** Champs du canevas sans règle d'agrégation — bloquant. */
  champsSansRegle: string[];
}

export class PeriodeNonCalculableError extends Error {
  constructor(public etat: EtatPeriode) {
    const raisons: string[] = [];
    if (etat.moisAbsents.length) raisons.push(`mois absent(s) : ${etat.moisAbsents.join(", ")}`);
    if (etat.moisIncomplets.length) raisons.push(`mois incomplet(s) : ${etat.moisIncomplets.join(", ")}`);
    if (etat.champsSansRegle.length) raisons.push(`champ(s) sans règle : ${etat.champsSansRegle.join(", ")}`);
    super(
      `Le ${etat.libelle} ne peut pas être consolidé — ${raisons.join(" ; ")}. ` +
        `Un chiffre couvrant une partie de la période, présenté comme la période entière, est un faux.`
    );
    this.name = "PeriodeNonCalculableError";
  }
}

/**
 * Dresse l'état d'une période AVANT tout calcul : quels mois existent, lesquels
 * sont complets, quels champs n'ont pas de règle. C'est ce que l'écran de
 * préparation montrera au DD.
 */
export async function inspecterPeriode(db: PrismaClient, p: Periode): Promise<EtatPeriode> {
  const attendus = moisDeLaPeriode(p);
  const nbArrondissements = await db.arrondissement.count();

  const mois: MoisSource[] = [];
  for (const m of attendus) {
    const periodeMois = await db.periodeReporting.findFirst({
      where: { type: "MENSUEL", annee: m.annee, mois: m.mois },
    });
    if (!periodeMois) {
      mois.push({ ...m, periodeId: null, arrondissementsTransmis: 0, complet: false });
      continue;
    }
    const transmis = await db.rapportArrondissement.count({
      where: { periodeId: periodeMois.id, statut: { in: [...STATUTS_TRANSMIS] } },
    });
    mois.push({
      ...m,
      periodeId: periodeMois.id,
      arrondissementsTransmis: transmis,
      complet: transmis === nbArrondissements,
    });
  }

  const champs = await db.formField.findMany({ where: { actif: true }, select: { code: true } });
  const champsSansRegle = verifierCouverture(champs.map((c) => c.code)).map((c) => c.code);

  const nom = (m: MoisSource) => `${String(m.mois).padStart(2, "0")}/${m.annee}`;
  const moisAbsents = mois.filter((m) => !m.periodeId).map(nom);
  const moisIncomplets = mois
    .filter((m) => m.periodeId && !m.complet)
    .map((m) => `${nom(m)} (${m.arrondissementsTransmis}/${nbArrondissements})`);

  return {
    periode: p,
    libelle: libelleOfficiel(p),
    mois,
    moisAbsents,
    moisIncomplets,
    calculable: moisAbsents.length === 0 && moisIncomplets.length === 0 && champsSansRegle.length === 0,
    champsSansRegle,
  };
}

export interface DetailMois {
  annee: number;
  mois: number;
  valeur: number | null;
}

export interface ValeurAgregee {
  fieldCode: string;
  /** null = valeur départementale (somme des arrondissements). */
  arrondissementCode: string | null;
  valeur: number | null;
  regle: RegleAgregation;
  /** Le détail mois par mois — c'est lui qui alimente « voir le calcul ». */
  detail: DetailMois[];
  /** Pour DERNIERE_VALEUR : le mois effectivement retenu. */
  moisRetenu?: { annee: number; mois: number };
  /** Signalé quand un prix n'a pas pu être pondéré faute de quantités. */
  ponderationIndisponible?: boolean;
}

export interface OptionsAgregation {
  /** Ne calculer que ces champs. Par défaut : tous les champs matriciels actifs. */
  champs?: string[];
  /**
   * Calculer malgré un mois absent ou incomplet. À n'utiliser que pour un
   * APERÇU explicitement marqué comme provisoire — jamais pour un rapport signé.
   */
  autoriserIncomplet?: boolean;
}

/**
 * Consolide une période. Renvoie une valeur par (champ × arrondissement), plus
 * la valeur départementale de chaque champ (`arrondissementCode: null`).
 */
export async function agreger(
  db: PrismaClient,
  p: Periode,
  options: OptionsAgregation = {}
): Promise<{ etat: EtatPeriode; valeurs: ValeurAgregee[] }> {
  const etat = await inspecterPeriode(db, p);
  if (!etat.calculable && !options.autoriserIncomplet) throw new PeriodeNonCalculableError(etat);

  const periodeIds = etat.mois.filter((m) => m.periodeId).map((m) => m.periodeId!);
  if (periodeIds.length === 0) return { etat, valeurs: [] };

  const champs = options.champs
    ? options.champs
    : (await db.formField.findMany({ where: { actif: true }, select: { code: true } })).map((c) => c.code);

  // Deux aller-retours en base pour toute la période : les tableaux MATRICE
  // (une valeur par arrondissement) et les tableaux NOMINATIF (une valeur par
  // ÉTABLISSEMENT). Oublier les seconds priverait le trimestre des œufs, des
  // poussins, des poulets de chair et de la provende — tableaux 1.3 à 1.5 et
  // 2.3, tous attendus au canevas trimestriel.
  const filtreCommun = {
    fieldCode: { in: champs },
    nonRenseigne: false,
    rapport: { periodeId: { in: periodeIds }, statut: { in: [...STATUTS_TRANSMIS] } },
  };
  const selectionCommune = {
    fieldCode: true,
    valeur: true,
    rapport: { select: { periodeId: true, arrondissement: { select: { code: true } } } },
  };

  const [matricielles, nominatives] = await Promise.all([
    db.saisieMatrice.findMany({ where: filtreCommun, select: selectionCommune }),
    db.saisieNominative.findMany({ where: filtreCommun, select: selectionCommune }),
  ]);

  const moisDuPeriodeId = new Map(etat.mois.filter((m) => m.periodeId).map((m) => [m.periodeId!, m]));
  const arrondissements = (await db.arrondissement.findMany({ orderBy: { ordre: "asc" } })).map((a) => a.code);

  /** champ → arrondissement → clé de mois → valeur */
  const table = new Map<string, Map<string, Map<string, number>>>();

  /**
   * `cumuler` : une saisie MATRICIELLE est unique par (arrondissement, mois),
   * alors qu'un tableau NOMINATIF en porte une par établissement. Dans le
   * second cas, la valeur de l'arrondissement pour le mois est la somme de ses
   * établissements — et cette somme intervient AVANT la règle temporelle.
   */
  const ranger = (
    lignes: typeof matricielles,
    cumuler: boolean
  ) => {
    for (const s of lignes) {
      if (s.valeur == null) continue;
      const m = moisDuPeriodeId.get(s.rapport.periodeId);
      if (!m) continue;
      const parArr = table.get(s.fieldCode) ?? new Map<string, Map<string, number>>();
      table.set(s.fieldCode, parArr);
      const parMois = parArr.get(s.rapport.arrondissement.code) ?? new Map<string, number>();
      parArr.set(s.rapport.arrondissement.code, parMois);
      const cle = `${m.annee}-${m.mois}`;
      const v = Number(s.valeur);
      parMois.set(cle, cumuler ? (parMois.get(cle) ?? 0) + v : v);
    }
  };

  ranger(matricielles, false);
  ranger(nominatives, true);

  const ordreMois = etat.mois.filter((m) => m.periodeId);
  const valeurs: ValeurAgregee[] = [];

  for (const fieldCode of champs) {
    const regle = regleDuChamp(fieldCode);
    if (regle === "TEXTE") continue; // traité par `agregerTextes`

    const parArr = table.get(fieldCode) ?? new Map<string, Map<string, number>>();

    // --- 1. Chaque arrondissement, règle temporelle appliquée ---------------
    const parArrondissement: ValeurAgregee[] = arrondissements.map((code) => {
      const parMois = parArr.get(code) ?? new Map<string, number>();
      const detail: DetailMois[] = ordreMois.map((m) => ({
        annee: m.annee,
        mois: m.mois,
        valeur: parMois.get(`${m.annee}-${m.mois}`) ?? null,
      }));
      return { fieldCode, arrondissementCode: code, regle, ...appliquer(regle, detail), detail };
    });
    valeurs.push(...parArrondissement);

    // --- 2. Le département ------------------------------------------------
    if (regle === "MOYENNE_PONDEREE") {
      // Une moyenne de moyennes serait fausse : on repart des couples
      // (prix, quantité) de chaque arrondissement et de chaque mois.
      valeurs.push(await moyennePondereeDepartementale(db, fieldCode, periodeIds, ordreMois, arrondissements, table, champs));
    } else {
      // Somme des arrondissements, chacun ayant déjà sa règle temporelle.
      const brut = parArrondissement.reduce<number | null>(
        (s, v) => (v.valeur == null ? s : (s ?? 0) + v.valeur),
        null
      );
      const total = brut == null ? null : arrondir(brut);
      const detailDept: DetailMois[] = ordreMois.map((m) => {
        const somme = arrondissements.reduce<number | null>((s, code) => {
          const v = parArr.get(code)?.get(`${m.annee}-${m.mois}`);
          return v == null ? s : (s ?? 0) + v;
        }, null);
        return { annee: m.annee, mois: m.mois, valeur: somme == null ? null : arrondir(somme) };
      });
      valeurs.push({ fieldCode, arrondissementCode: null, valeur: total, regle, detail: detailDept });
    }
  }

  return { etat, valeurs };
}

/** Applique la règle temporelle à une suite de valeurs mensuelles. */
function appliquer(
  regle: RegleAgregation,
  detail: DetailMois[]
): { valeur: number | null; moisRetenu?: { annee: number; mois: number }; ponderationIndisponible?: boolean } {
  const renseignes = detail.filter((d) => d.valeur != null);
  if (renseignes.length === 0) return { valeur: null };

  switch (regle) {
    case "SOMME":
      return { valeur: arrondir(renseignes.reduce((s, d) => s + d.valeur!, 0)) };

    case "DERNIERE_VALEUR": {
      // Le DERNIER mois RENSEIGNÉ, pas le dernier mois de la période : un
      // cheptel non déclaré en septembre ne vaut pas zéro, il vaut ce qu'il
      // valait en août.
      const dernier = renseignes[renseignes.length - 1];
      return { valeur: dernier.valeur, moisRetenu: { annee: dernier.annee, mois: dernier.mois } };
    }

    case "MOYENNE_PONDEREE":
      // Au niveau d'un arrondissement, sans les quantités on ne peut faire
      // qu'une moyenne simple — elle est marquée comme telle.
      return {
        valeur: arrondir(renseignes.reduce((s, d) => s + d.valeur!, 0) / renseignes.length),
        ponderationIndisponible: true,
      };

    case "TEXTE":
      return { valeur: null };
  }
}

/**
 * Moyenne pondérée départementale d'un prix : Σ(prix × quantité) / Σ(quantité),
 * sur tous les couples (arrondissement, mois). Faute de quantités, moyenne
 * simple, explicitement signalée.
 */
async function moyennePondereeDepartementale(
  db: PrismaClient,
  fieldCode: string,
  periodeIds: string[],
  ordreMois: MoisSource[],
  arrondissements: string[],
  table: Map<string, Map<string, Map<string, number>>>,
  champsDemandes: string[]
): Promise<ValeurAgregee> {
  const codesQuantite = champsDePonderation(fieldCode);

  // Les quantités ne sont pas forcément dans les champs demandés : on les lit.
  const quantites = await db.saisieMatrice.findMany({
    where: {
      fieldCode: { in: codesQuantite },
      nonRenseigne: false,
      rapport: { periodeId: { in: periodeIds }, statut: { in: [...STATUTS_TRANSMIS] } },
    },
    select: {
      valeur: true,
      rapport: { select: { periodeId: true, arrondissement: { select: { code: true } } } },
    },
  });

  const periodeParMois = new Map(ordreMois.map((m) => [m.periodeId!, `${m.annee}-${m.mois}`]));
  const qteParArrMois = new Map<string, number>();
  for (const q of quantites) {
    if (q.valeur == null) continue;
    const cle = `${q.rapport.arrondissement.code}|${periodeParMois.get(q.rapport.periodeId) ?? ""}`;
    qteParArrMois.set(cle, (qteParArrMois.get(cle) ?? 0) + Number(q.valeur));
  }

  const parArr = table.get(fieldCode) ?? new Map<string, Map<string, number>>();
  let numerateur = 0;
  let denominateur = 0;
  const prixObserves: number[] = [];

  for (const code of arrondissements) {
    for (const m of ordreMois) {
      const cleMois = `${m.annee}-${m.mois}`;
      const prix = parArr.get(code)?.get(cleMois);
      if (prix == null) continue;
      prixObserves.push(prix);
      const qte = qteParArrMois.get(`${code}|${cleMois}`) ?? 0;
      numerateur += prix * qte;
      denominateur += qte;
    }
  }

  const detail: DetailMois[] = ordreMois.map((m) => {
    const cleMois = `${m.annee}-${m.mois}`;
    let n = 0;
    let d = 0;
    for (const code of arrondissements) {
      const prix = parArr.get(code)?.get(cleMois);
      if (prix == null) continue;
      const qte = qteParArrMois.get(`${code}|${cleMois}`) ?? 0;
      n += prix * qte;
      d += qte;
    }
    return { annee: m.annee, mois: m.mois, valeur: d > 0 ? arrondir(n / d) : null };
  });

  if (denominateur > 0) {
    return { fieldCode, arrondissementCode: null, valeur: arrondir(numerateur / denominateur), regle: "MOYENNE_PONDEREE", detail };
  }
  return {
    fieldCode,
    arrondissementCode: null,
    valeur: prixObserves.length ? arrondir(prixObserves.reduce((a, b) => a + b, 0) / prixObserves.length) : null,
    regle: "MOYENNE_PONDEREE",
    detail,
    ponderationIndisponible: true,
  };
}

/** Résumé lisible d'une consolidation — pour les scripts et l'écran de préparation. */
export function resumer(etat: EtatPeriode, valeurs: ValeurAgregee[]): string {
  const dept = valeurs.filter((v) => v.arrondissementCode === null);
  const renseignes = dept.filter((v) => v.valeur != null).length;
  const parRegle: Record<string, number> = {};
  for (const v of dept) parRegle[v.regle] = (parRegle[v.regle] ?? 0) + 1;
  return (
    `${etat.libelle} (${libelleCourt(etat.periode)}) — ` +
    `${etat.mois.filter((m) => m.complet).length}/${etat.mois.length} mois complets · ` +
    `${renseignes}/${dept.length} valeurs départementales renseignées · ` +
    Object.entries(parRegle).map(([r, n]) => `${r}=${n}`).join(" ")
  );
}

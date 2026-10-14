/**
 * Ce que la note de situation ajoute aux chiffres de l'élevage (demande du
 * Délégué, 14 octobre 2026) :
 *
 *  - le BUDGET : les recettes encaissées (tableau 13 du BAC, mois par mois et
 *    régie par régie), les crédits de fonctionnement et d'investissement
 *    (tableaux 12 et 102), et les MARCHÉS du budget d'investissement public
 *    (tableau 108 : l'infrastructure, son montant, son niveau d'exécution) ;
 *  - les ÉPISODES ÉPIDÉMIQUES et leur gestion : les foyers déclarés au
 *    tableau 3.1 du mensuel, avec le lieu, les animaux touchés, les morts et
 *    les mesures prises.
 *
 * Les tableaux du BAC et du BIP sont des saisies TRIMESTRIELLES : la note lit
 * les trimestres qui recouvrent les mois choisis. Rien n'est écrit.
 */
import type { PrismaClient } from "@prisma/client";
import { STATUTS_TRANSMIS } from "@/server/trimestre/agregation";
import type { MoisChoisi } from "./noteSituation";

const MOIS_MAJ = ["JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE"];
const ORDINAUX = ["1er", "2e", "3e", "4e"];
const trimestreDe = (m: MoisChoisi) => ({ annee: m.annee, trimestre: Math.floor((m.mois - 1) / 3) + 1 });
const libelleTrimestre = (t: { annee: number; trimestre: number }) => `${ORDINAUX[t.trimestre - 1]} trimestre ${t.annee}`;

/** Les trimestres qui recouvrent ces mois, dans l'ordre, sans doublon. */
function trimestres(mois: MoisChoisi[]) {
  const vus = new Map<string, { annee: number; trimestre: number }>();
  for (const m of mois) {
    const t = trimestreDe(m);
    vus.set(`${t.annee}-${t.trimestre}`, t);
  }
  return Array.from(vus.values());
}

/** Les mois choisis couvrent-ils des trimestres entiers ? */
const trimestresEntiers = (mois: MoisChoisi[]) => mois.length % 3 === 0 && (mois[0].mois - 1) % 3 === 0;

async function saisiesDe(db: PrismaClient, ts: { annee: number; trimestre: number }[], tableaux: number[]) {
  if (ts.length === 0) return { periodes: [], saisies: [] };
  const periodes = await db.periodeReporting.findMany({
    where: { type: "TRIMESTRIEL", OR: ts.map((t) => ({ annee: t.annee, trimestre: t.trimestre })) },
    select: { id: true, annee: true, trimestre: true },
  });
  const saisies = periodes.length
    ? await db.saisieCanevas.findMany({
        where: { periodeId: { in: periodes.map((p) => p.id) }, numeroTableau: { in: tableaux } },
        select: { periodeId: true, numeroTableau: true, ligne: true, colonne: true, valeur: true, valeurTexte: true, portee: true },
      })
    : [];
  return { periodes, saisies };
}

// ------------------------------------------------------------------ budget

export interface Recettes {
  total: number | null;
  reference: number | null;
  /** « 3e trimestre 2025 », ou « l'an passé (chiffre saisi au T3 2026) ». */
  libelleReference: string | null;
  parRegie: { regie: string; valeur: number | null; reference: number | null }[];
}

export interface Marche {
  /** Où : la commune (saisie du département), ou l'arrondissement et sa commune. */
  lieu: string;
  arrondissement: string;
  commune: string;
  infrastructure: string;
  montant: number | null;
  niveau: string;
}

export interface Budget {
  recettes: Recettes | null;
  credits: { trimestre: string; fonctionnement: number | null; investissement: number | null } | null;
  marches: { trimestre: string; lignes: Marche[]; montantTotal: number; parNiveau: { niveau: string; nombre: number }[] } | null;
}

const COL_MONTANT = "Montant alloué (FCFA)";
const COL_NIVEAU = "Niveau d’exécution physique (construit, non construit, En cours, Arrêté)";
const COL_COMMUNE = "Arrondissement/ Commune";
const COL_INFRA = "Infrastructure d’élevage de base";
const COL_ANNEXE = "Equipement ou infrastructure annexe à l’infrastructure de base";

/** « en cours », « En Cours » → « En cours » : les niveaux saisis à la main se regroupent. */
function niveauNormalise(t: string | null): string {
  const s = (t ?? "").trim().toLowerCase();
  if (!s) return "Non précisé";
  if (s.startsWith("non")) return "Non construit";
  if (s.startsWith("construit") || s.startsWith("achev") || s.startsWith("termin")) return "Construit";
  if (s.includes("cours")) return "En cours";
  if (s.startsWith("arr")) return "Arrêté";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function budgetDe(
  db: PrismaClient,
  mois: MoisChoisi[],
  moisReference: MoisChoisi[] | null,
  libelleReference: string | null,
  arrondissements: { id: string; nom: string }[]
): Promise<Budget> {
  const ts = trimestres(mois);
  const { periodes, saisies } = await saisiesDe(db, ts, [12, 13, 102, 108]);
  const regies = ["DDEPIA", ...arrondissements.map((a) => a.nom)];
  const dep = saisies.filter((s) => s.portee === "");

  // --- Les recettes : les lignes des mois choisis, régie par régie.
  const lignesMois = new Set(mois.map((m) => `${m.annee}|${MOIS_MAJ[m.mois - 1]}`));
  const anneeDe = new Map(periodes.map((p) => [p.id, p.annee]));
  const recettesDe = (sources: typeof dep, cles: Set<string>) =>
    regies.map((regie) => {
      let s: number | null = null;
      for (const x of sources) {
        if (x.numeroTableau !== 13 || x.colonne !== regie || x.valeur == null) continue;
        if (!cles.has(`${anneeDe.get(x.periodeId) ?? ""}|${x.ligne}`)) continue;
        s = (s ?? 0) + Number(x.valeur);
      }
      return s;
    });
  const courant = recettesDe(dep, lignesMois);

  // La référence : les mêmes mois saisis à leur trimestre, ou — trimestres
  // entiers seulement — le total de l'an passé saisi en reprise d'historique.
  let reference: (number | null)[] = regies.map(() => null);
  let libelleRef: string | null = null;
  if (moisReference) {
    const r = await saisiesDe(db, trimestres(moisReference), [13]);
    const anneeRef = new Map(r.periodes.map((p) => [p.id, p.annee]));
    const clesRef = new Set(moisReference.map((m) => `${m.annee}|${MOIS_MAJ[m.mois - 1]}`));
    reference = regies.map((regie) => {
      let s: number | null = null;
      for (const x of r.saisies) {
        if (x.portee !== "" || x.colonne !== regie || x.valeur == null) continue;
        if (!clesRef.has(`${anneeRef.get(x.periodeId) ?? ""}|${x.ligne}`)) continue;
        s = (s ?? 0) + Number(x.valeur);
      }
      return s;
    });
    if (reference.some((v) => v != null)) libelleRef = libelleReference;
  }
  if (!libelleRef && trimestresEntiers(mois)) {
    const historique = regies.map((regie) => {
      let s: number | null = null;
      for (const t of ts) {
        const p = periodes.find((x) => x.annee === t.annee && x.trimestre === t.trimestre);
        const v = p && dep.find((x) => x.periodeId === p.id && x.numeroTableau === 13 && x.colonne === regie && x.ligne === `TOTAL T${t.trimestre} ${t.annee - 1}`)?.valeur;
        if (v != null) s = (s ?? 0) + Number(v);
      }
      return s;
    });
    if (historique.some((v) => v != null)) {
      reference = historique;
      libelleRef = "la même période l'an passé (chiffres repris de l'historique)";
    }
  }
  const total = courant.some((v) => v != null) ? courant.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
  const totalRef = reference.some((v) => v != null) ? reference.reduce<number>((s, v) => s + (v ?? 0), 0) : null;
  const recettes: Recettes | null =
    total == null
      ? null
      : { total, reference: totalRef, libelleReference: totalRef == null ? null : libelleRef, parRegie: regies.map((regie, i) => ({ regie, valeur: courant[i], reference: reference[i] })) };

  // --- Les crédits et les marchés : le DERNIER trimestre de la période qui en porte.
  const parTrimestre = [...ts].reverse();
  let credits: Budget["credits"] = null;
  for (const t of parTrimestre) {
    const p = periodes.find((x) => x.annee === t.annee && x.trimestre === t.trimestre);
    if (!p) continue;
    const somme = (numero: number, colonne: string) => {
      let s: number | null = null;
      for (const x of dep) if (x.periodeId === p.id && x.numeroTableau === numero && x.colonne === colonne && x.valeur != null && !/^TOTAL|^ÉCART/.test(x.ligne)) s = (s ?? 0) + Number(x.valeur);
      return s;
    };
    const fonctionnement = somme(12, "Fonctionnement");
    const investissement = somme(102, "Investissement");
    if (fonctionnement != null || investissement != null) {
      credits = { trimestre: libelleTrimestre(t), fonctionnement, investissement };
      break;
    }
  }

  let marches: Budget["marches"] = null;
  const nomDe = new Map(arrondissements.map((a) => [a.id, a.nom]));
  for (const t of parTrimestre) {
    const p = periodes.find((x) => x.annee === t.annee && x.trimestre === t.trimestre);
    if (!p) continue;
    const bip = saisies.filter((x) => x.periodeId === p.id && x.numeroTableau === 108 && x.ligne !== "TOTAL");
    const groupes = new Map<string, typeof bip>();
    for (const x of bip) groupes.set(`${x.portee}|${x.ligne}`, [...(groupes.get(`${x.portee}|${x.ligne}`) ?? []), x]);
    const lignes: Marche[] = [];
    groupes.forEach((cases, k) => {
      const lire = (col: string) => cases.find((x) => x.colonne === col);
      const infra = [lire(COL_INFRA)?.valeurTexte, lire(COL_ANNEXE)?.valeurTexte].filter(Boolean).join(" — ");
      const montant = lire(COL_MONTANT)?.valeur;
      if (!infra && montant == null) return;
      const portee = k.split("|")[0];
      const arrondissement = portee ? (nomDe.get(portee) ?? "Arrondissement") : "Département";
      const commune = lire(COL_COMMUNE)?.valeurTexte?.trim() ?? "";
      lignes.push({
        lieu: portee ? [arrondissement, commune].filter(Boolean).join(" — ") : commune || "Département",
        arrondissement,
        commune,
        infrastructure: infra || "Infrastructure non précisée",
        montant: montant == null ? null : Number(montant),
        niveau: niveauNormalise(lire(COL_NIVEAU)?.valeurTexte ?? null),
      });
    });
    if (lignes.length) {
      const parNiveau = new Map<string, number>();
      for (const l of lignes) parNiveau.set(l.niveau, (parNiveau.get(l.niveau) ?? 0) + 1);
      marches = {
        trimestre: libelleTrimestre(t),
        lignes: lignes.sort((a, b) => (b.montant ?? 0) - (a.montant ?? 0)),
        montantTotal: lignes.reduce((s, l) => s + (l.montant ?? 0), 0),
        parNiveau: Array.from(parNiveau.entries()).map(([niveau, nombre]) => ({ niveau, nombre })).sort((a, b) => b.nombre - a.nombre),
      };
      break;
    }
  }
  return { recettes, credits, marches };
}

// ------------------------------------------------------------------ épisodes épidémiques

export interface Episode {
  maladie: string;
  arrondissement: string;
  localites: string[];
  mois: string[];
  foyers: number;
  touches: number;
  morts: number;
  saisis: number;
  mesures: string[];
}

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Les foyers déclarés, regroupés par maladie et par arrondissement, avec ce qui a été fait. */
export async function episodesDe(db: PrismaClient, mois: MoisChoisi[], nomMaladie: (code: unknown) => string): Promise<Episode[]> {
  const periodes = await db.periodeReporting.findMany({
    where: { type: "MENSUEL", OR: mois.map((m) => ({ annee: m.annee, mois: m.mois })) },
    select: { id: true, mois: true },
  });
  if (!periodes.length) return [];
  const lignes = await db.saisieEvenement.findMany({
    where: { template: { code: "T31" }, rapport: { periodeId: { in: periodes.map((p) => p.id) }, statut: { in: [...STATUTS_TRANSMIS] } } },
    select: { payload: true, rapport: { select: { periodeId: true, arrondissement: { select: { nom: true } } } } },
  });
  const n = (x: unknown) => {
    const v = Number(x);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const moisDe = new Map(periodes.map((p) => [p.id, p.mois != null ? NOMS_MOIS[p.mois - 1] : ""]));
  const groupes = new Map<string, Episode>();
  for (const l of lignes) {
    const p = (l.payload ?? {}) as Record<string, unknown>;
    const maladie = nomMaladie(p.maladie);
    const arrondissement = l.rapport.arrondissement.nom;
    const k = `${maladie}|${arrondissement}`;
    const e = groupes.get(k) ?? { maladie, arrondissement, localites: [], mois: [], foyers: 0, touches: 0, morts: 0, saisis: 0, mesures: [] };
    e.foyers += n(p.nbFoyers) || 1;
    e.touches += n(p.effectifTouche);
    e.morts += n(p.morts);
    e.saisis += n(p.animauxSaisis);
    const ajouter = (liste: string[], v: unknown) => {
      const t = typeof v === "string" ? v.trim() : "";
      if (t && !liste.some((x) => x.toLowerCase() === t.toLowerCase())) liste.push(t);
    };
    // « Dschang — quartier Sud » sous Dschang : « quartier Sud ».
    ajouter(e.localites, typeof p.localisation === "string" ? p.localisation.replace(new RegExp(`^${arrondissement}\\s*[—–-]\\s*`), "") : p.localisation);
    ajouter(e.mesures, p.mesurePrise);
    ajouter(e.mois, moisDe.get(l.rapport.periodeId));
    groupes.set(k, e);
  }
  return Array.from(groupes.values()).sort((a, b) => b.foyers - a.foyers || b.morts - a.morts);
}

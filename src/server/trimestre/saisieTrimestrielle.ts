/**
 * Saisie trimestrielle des tableaux du canevas (étape c3, décision D9).
 *
 * Ce qui n'est collecté par aucun mois — le détail des cheptels par catégorie,
 * les infrastructures, les organisations, la pêche, les listes du BIP ou des
 * vétérinaires — se saisit ici, UNE fois par trimestre :
 *
 *  - l'agent de saisie et le Délégué d'arrondissement remplissent la ligne (ou
 *    la colonne) de LEUR arrondissement, et elle seule ;
 *  - le Délégué départemental remplit ce qui relève du département — la
 *    colonne DDEPIA, les tableaux sans maille territoriale — et peut tout
 *    corriger ;
 *  - le chef BAC garde la main sur les tableaux du BAC.
 *
 * Trois sortes de cases ne se saisissent JAMAIS :
 *  - celles que le SID calcule à partir du mensuel (une donnée n'est saisie
 *    qu'une fois) ;
 *  - les totaux et les écarts, calculés à partir des cases saisies ;
 *  - la première colonne, qui porte les libellés.
 *
 * La grille vient du canevas lui-même, par les fonctions du rendu : l'écran et
 * le document ne peuvent pas diverger. Une saisie sert à la fois au rapport de
 * l'arrondissement et au rapport départemental : ils lisent la même case.
 */
import type { PrismaClient } from "@prisma/client";
import { SECTIONS_CANEVAS } from "./rapportCanevas";
import { colonnesDe, lignesDe } from "./canevas/rendu";
import { axeTerritorial, clesLignes, estTotal } from "./canevas/structure";
import type { Bloc, ContexteCanevas } from "./canevas/types";
import { cleCellule, lireSaisiesCanevas, type ValeurCellule } from "./saisieCanevas";
import { preparer, fournisseur, estCaseCalculee } from "./remplissage";
import { champsMobilises, liaisonDe, estLiee } from "./liaison";
import { liaisonEvenementDe } from "./evenements";
import { listerArrondissements } from "@/lib/arrondissements";
import { identiteDepartement } from "@/lib/departement";
import {
  type Periode, libelleCourt, memePeriodeAnneePrecedente, moisDeLaPeriode,
} from "../periodes/calendrier";

type BlocTableau = Extract<Bloc, { type: "tableau" }>;

const MOIS_MAJ = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

/**
 * Les tableaux du Bureau des Affaires Communes : personnel, infrastructures,
 * matériel, équipements, budget, recettes, et les deux qui les complètent —
 * structures administratives (101) et crédits d'investissement (102).
 */
export const TABLEAUX_BAC = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 101, 102]);

/** Qui saisit : son rôle, et pour un DA ou un agent, son arrondissement. */
export interface Profil {
  role: string;
  /** Nom de l'arrondissement, pour un DA ou un agent de saisie. */
  arrondissement?: string;
}

export const ROLES_SAISIE = ["DD", "CHEF_BAC", "DA", "AGENT_SAISIE"] as const;

const estArrondissement = (p: Profil) => p.role === "DA" || p.role === "AGENT_SAISIE";

/** Le contexte du canevas vu par ce profil : un DA ne voit que son territoire. */
export async function contextePour(db: PrismaClient, periode: Periode, profil: Profil): Promise<ContexteCanevas> {
  const identite = await identiteDepartement(db);
  const tous = await listerArrondissements(db);
  return {
    periodeCourt: libelleCourt(periode),
    periodeCourtN1: libelleCourt(memePeriodeAnneePrecedente(periode)),
    annee: periode.annee,
    mois: moisDeLaPeriode(periode).map((m) => MOIS_MAJ[m.mois - 1]),
    arrondissements: estArrondissement(profil) && profil.arrondissement ? [profil.arrondissement] : tous.map((a) => a.nom),
    arrondissement: estArrondissement(profil) ? profil.arrondissement : undefined,
    departement: { nomAvecArticle: identite.nomAvecArticle, sigle: identite.sigle },
  };
}

/** Le nom de l'arrondissement d'un utilisateur, pour son profil de saisie. */
export async function nomArrondissement(db: PrismaClient, arrondissementId: string | null | undefined) {
  if (!arrondissementId) return undefined;
  return (await listerArrondissements(db)).find((a) => a.id === arrondissementId)?.nom;
}

/** Tous les tableaux du canevas, avec le titre de leur section. */
function tableaux(): { bloc: BlocTableau; section: string }[] {
  return SECTIONS_CANEVAS.flatMap((s) =>
    s.blocs
      .filter((b): b is BlocTableau => b.type === "tableau" && b.numero != null)
      .map((bloc) => ({ bloc, section: s.titre }))
  );
}

export function tableauDe(numero: number): { bloc: BlocTableau; section: string } | undefined {
  return tableaux().find((t) => t.bloc.numero === numero);
}

/**
 * Ce profil peut-il saisir cette case ? Suppose la case saisissable en soi (ni
 * calculée, ni total) : c'est la question des DROITS seulement.
 */
function autorise(bloc: BlocTableau, profil: Profil, ligne: string, colonne: string): boolean {
  if (profil.role === "DD") return true;
  if (profil.role === "CHEF_BAC") return TABLEAUX_BAC.has(bloc.numero!);
  if (!estArrondissement(profil) || !profil.arrondissement) return false;
  // Un DA ou un agent ne saisit que dans la maille de SON arrondissement.
  const axe = axeTerritorial(bloc);
  if (axe === "lignes") return ligne === profil.arrondissement;
  if (axe === "colonnes") return colonne === profil.arrondissement;
  return false;
}

export type EtatCase = "saisie" | "calculee" | "total" | "lecture";

/**
 * Le texte FIXE d'une case, imposé par le canevas — l'action et l'activité
 * d'une ligne du budget-programme. Undefined si la case n'en porte pas.
 */
function texteFixe(bloc: BlocTableau, ctx: ContexteCanevas, ligne: string, colonne: string): string | undefined {
  if (bloc.kind !== "libre" || !bloc.prerempli) return undefined;
  const r = clesLignes(bloc, ctx).indexOf(ligne);
  const c = colonnesDe(bloc, ctx).indexOf(colonne);
  const cases = bloc.prerempli[r];
  if (!cases || c < 1 || c - 1 >= cases.length) return undefined;
  return cases[c - 1];
}

/** L'état d'une case pour ce profil. */
export function etatCase(
  bloc: BlocTableau,
  ctx: ContexteCanevas,
  profil: Profil,
  ligne: string,
  colonne: string
): EtatCase {
  if (texteFixe(bloc, ctx, ligne, colonne) !== undefined) return "lecture";
  if (estCaseCalculee(bloc.numero!, ligne, colonne, ctx)) return "calculee";
  if (estTotal(ligne) || estTotal(colonne)) return "total";
  return autorise(bloc, profil, ligne, colonne) ? "saisie" : "lecture";
}

/** Les coordonnées d'un tableau : repères de ligne et colonnes saisissables. */
function coordonnees(bloc: BlocTableau, ctx: ContexteCanevas) {
  const [enteteLigne, ...colonnes] = colonnesDe(bloc, ctx);
  return { enteteLigne, colonnes, cles: clesLignes(bloc, ctx), libelles: lignesDe(bloc, ctx) };
}

// ------------------------------------------------------------------ liste

export interface ResumeTableau {
  numero: number;
  titre: string;
  section: string;
  /** Cases que ce profil peut saisir. */
  saisissables: number;
  /** Parmi elles, celles déjà renseignées. */
  renseignees: number;
  /** Le tableau se remplit au moins en partie seul, à partir du mensuel. */
  automatique: boolean;
}

/** Les tableaux où ce profil a quelque chose à saisir, avec leur avancement. */
export async function resumer(db: PrismaClient, periode: Periode, profil: Profil): Promise<ResumeTableau[]> {
  const ctx = await contextePour(db, periode, profil);
  const saisies = await saisiesDe(db, periode);
  const resultat: ResumeTableau[] = [];
  for (const { bloc, section } of tableaux()) {
    const { colonnes, cles } = coordonnees(bloc, ctx);
    let saisissables = 0;
    let renseignees = 0;
    for (const l of cles) {
      for (const c of colonnes) {
        if (etatCase(bloc, ctx, profil, l, c) !== "saisie") continue;
        saisissables++;
        if (saisies.has(cleCellule({ numeroTableau: bloc.numero!, ligne: l, colonne: c }))) renseignees++;
      }
    }
    if (saisissables === 0) continue;
    resultat.push({
      numero: bloc.numero!,
      titre: bloc.titre,
      section,
      saisissables,
      renseignees,
      automatique: Boolean(liaisonDe(bloc.numero) || liaisonEvenementDe(bloc.numero)),
    });
  }
  return resultat;
}

async function saisiesDe(db: PrismaClient, periode: Periode): Promise<Map<string, ValeurCellule>> {
  const trimestre = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: periode.annee, trimestre: periode.rang },
    select: { id: true },
  });
  return trimestre ? lireSaisiesCanevas(db, trimestre.id) : new Map();
}

// ------------------------------------------------------------------ grille

export interface CaseGrille {
  colonne: string;
  etat: EtatCase;
  /** Ce qui s'imprimera au rapport, calculs compris. */
  affiche: string | null;
  /** La valeur brute saisie, pour l'édition. */
  saisi: string | null;
}

export interface GrilleSaisie {
  numero: number;
  titre: string;
  section: string;
  enteteLigne: string;
  lignes: { cle: string; libelle: string; cases: CaseGrille[] }[];
  /** Incohérences à signaler — somme des catégories ≠ total mensuel. */
  avertissements: string[];
}

/** La grille d'un tableau, telle que ce profil la voit et la remplit. */
export async function grille(db: PrismaClient, periode: Periode, profil: Profil, numero: number): Promise<GrilleSaisie | null> {
  const t = tableauDe(numero);
  if (!t) return null;
  const { bloc, section } = t;
  const ctx = await contextePour(db, periode, profil);
  const arrondissementId = estArrondissement(profil)
    ? (await listerArrondissements(db)).find((a) => a.nom === profil.arrondissement)?.id
    : undefined;

  // La consolidation du trimestre n'est utile qu'aux tableaux alimentés par le
  // mensuel : un tableau purement saisi se contente de ses saisies.
  const automatique = Boolean(liaisonDe(numero) || liaisonEvenementDe(numero));
  const donnees = await preparer(db, periode, automatique ? champsMobilises() : [], {
    autoriserIncomplet: true,
    arrondissementId,
    sansAgregation: !automatique,
  });
  const valeur = fournisseur(donnees, ctx);
  const { enteteLigne, colonnes, cles, libelles } = coordonnees(bloc, ctx);

  const lignes = cles.map((cle, r) => ({
    cle,
    libelle: libelles[r],
    cases: colonnes.map((colonne, i) => {
      const s = donnees.saisies.get(cleCellule({ numeroTableau: numero, ligne: cle, colonne }));
      return {
        colonne,
        etat: etatCase(bloc, ctx, profil, cle, colonne),
        affiche:
          texteFixe(bloc, ctx, cle, colonne) ??
          valeur({ numeroTableau: numero, titreTableau: bloc.titre, bloc, ligne: cle, colonne, indexColonne: i + 1 }),
        saisi: s ? (s.texte ?? (s.valeur == null ? null : String(s.valeur))) : null,
      };
    }),
  }));

  return { numero, titre: bloc.titre, section, enteteLigne, lignes, avertissements: avertissements(bloc, ctx, lignes) };
}

/**
 * Quand le mensuel porte le TOTAL et que les catégories se saisissent (cheptel
 * bovin : l'effectif au mois, les taurillons, génisses… au trimestre), la somme
 * des catégories doit retomber sur le total. Sinon, on le dit — sans bloquer :
 * c'est au Délégué de trancher entre deux sources.
 */
function avertissements(bloc: BlocTableau, ctx: ContexteCanevas, lignes: GrilleSaisie["lignes"]): string[] {
  const liaison = liaisonDe(bloc.numero);
  if (!liaison?.total || liaison.orientation !== "lignes") return [];
  const categories = liaison.correspondances.filter((c) => !estLiee(c)).map((c) => c.libelle);
  const total = `TOTAL ${ctx.periodeCourt}`;
  const nombre = (s: string | null) => (s == null ? null : Number(s.replace(/\s| /g, "").replace(",", ".")));
  const sortie: string[] = [];
  for (const l of lignes) {
    if (estTotal(l.cle)) continue;
    // Tant qu'une catégorie manque, la somme ne dit rien : on attend.
    let somme: number | null = 0;
    for (const c of l.cases) {
      if (!categories.includes(c.colonne)) continue;
      const v = nombre(c.saisi);
      if (v == null || !Number.isFinite(v)) {
        somme = null;
        break;
      }
      somme += v;
    }
    if (somme == null) continue;
    const attendu = nombre(l.cases.find((c) => c.colonne === total)?.affiche ?? null);
    if (attendu != null && Number.isFinite(attendu) && Math.abs(somme - attendu) > 0.5) {
      sortie.push(
        `${l.libelle} : la somme des catégories (${somme.toLocaleString("fr-FR")}) ne retombe pas sur le total des rapports mensuels (${attendu.toLocaleString("fr-FR")}).`
      );
    }
  }
  return sortie;
}

/**
 * Vérifie qu'une case existe, se saisit, et que ce profil peut la saisir.
 * Rend le motif du refus, ou null si la saisie est permise.
 */
export async function refusDeSaisie(
  db: PrismaClient,
  periode: Periode,
  profil: Profil,
  numero: number,
  ligne: string,
  colonne: string
): Promise<string | null> {
  const t = tableauDe(numero);
  if (!t) return `Le tableau n° ${numero} n'existe pas au canevas.`;
  const ctx = await contextePour(db, periode, profil);
  const { colonnes, cles } = coordonnees(t.bloc, ctx);
  // Une coordonnée fantaisiste créerait une valeur invisible à l'écran comme au document.
  if (!cles.includes(ligne) || !colonnes.includes(colonne)) return "Cette case n'existe pas dans ce tableau.";
  switch (etatCase(t.bloc, ctx, profil, ligne, colonne)) {
    case "calculee":
      return "Cette case se remplit à partir des rapports mensuels : elle ne se saisit pas.";
    case "total":
      return "Les totaux et les écarts sont calculés : ils ne se saisissent pas.";
    case "lecture":
      return "Cette case n'est pas de votre ressort.";
    default:
      return null;
  }
}

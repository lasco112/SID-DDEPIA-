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
import { colonnesDe, lignesDe, type FournisseurValeur } from "./canevas/rendu";
import { axeTerritorial, clesLignes, estTotal } from "./canevas/structure";
import type { Bloc, ContexteCanevas } from "./canevas/types";
import { cleCellule, saisiesVues, type ValeurCellule } from "./saisieCanevas";
import { numerosSansMaille, TABLEAUX_BAC, chefDeSection } from "./canevas/sections";
import { preparer, fournisseur, estCaseCalculee, estCaseHistorique, valeurReprise, versNombre } from "./remplissage";
import { REPRISES, repriseDe } from "./canevas/reprises";
import { champsMobilises, liaisonDe, estLiee, type Formule } from "./liaison";
import { liaisonEvenementDe } from "./evenements";
import { listerArrondissements, graphieCanevas } from "@/lib/arrondissements";
import { identiteDepartement } from "@/lib/departement";
import { observationsTrimestre } from "@/server/observationsTrimestre";
import { etatCircuit } from "./circuit";
import { aOrdreDeCorrection, MESSAGE_SANS_ORDRE } from "./ordresCorrection";
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
export { TABLEAUX_BAC };

/** Qui saisit : son rôle, et pour un DA ou un agent, son arrondissement. */
export interface Profil {
  role: string;
  /** Nom de l'arrondissement, pour un DA ou un agent de saisie. */
  arrondissement?: string;
}

export const ROLES_SAISIE = ["DD", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV", "DA", "AGENT_SAISIE"] as const;

/**
 * Les chefs des sections techniques (décision du Délégué, 13 octobre 2026) :
 * dans les tableaux de LEUR section, ils complètent ce qui manque — y compris
 * le total de l'an passé — et font corriger le reste par l'arrondissement.
 * Une case que l'arrondissement a remplie ne se modifie pas : elle se signale.
 */
const CHEFS_TECHNIQUES = ["CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"];
export const estChefTechnique = (role: string) => CHEFS_TECHNIQUES.includes(role);

/** Le chef de section dont relève ce tableau. */
export function chefDuTableau(numero: number): string | null {
  const s = SECTIONS_CANEVAS.find((x) => x.blocs.some((b) => b.type === "tableau" && b.numero === numero));
  return s ? chefDeSection(s.cle) : null;
}

/** La case a-t-elle été remplie par l'arrondissement (DA ou agent) — ou par on ne sait qui ? */
const remplieParLArrondissement = (s: ValeurCellule | undefined) =>
  Boolean(s) && (s!.parRole == null || s!.parRole === "DA" || s!.parRole === "AGENT_SAISIE");

export const MESSAGE_CASE_DE_L_ARRONDISSEMENT =
  "Cette case a été remplie par l'arrondissement : vous ne la modifiez pas. Touchez « Signaler une case à l'arrondissement » pour la lui faire corriger.";

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
  if (estChefTechnique(profil.role)) return chefDuTableau(bloc.numero!) === profil.role;
  if (!estArrondissement(profil) || !profil.arrondissement) return false;
  // Un DA ou un agent ne saisit que dans la maille de SON arrondissement…
  const axe = axeTerritorial(bloc);
  if (axe === "lignes") return ligne === profil.arrondissement;
  if (axe === "colonnes") return colonne === profil.arrondissement;
  // … et, dans un tableau sans maille, SA version, enregistrée sous sa portée
  // (budget-programme, BIP, vétérinaires de son arrondissement…). Le BAC,
  // lui, reste départemental.
  return !TABLEAUX_BAC.has(bloc.numero!);
}

export type EtatCase = "saisie" | "calculee" | "total" | "lecture";

/**
 * Les colonnes de TEXTE. Toutes les autres n'acceptent que des nombres
 * (décision du Délégué) : une lettre dans un effectif fausserait les totaux
 * sans que personne ne s'en aperçoive.
 */
const COLONNES_TEXTE = new Set([
  "Provenance",
  "Destination",
  "Groupes d’Initiative Commune (GIC)",
  "Activités",
  "Activités menées",
  "LOCALISATION",
  "NOMS ET PRENOMS",
  "TELEPHONE",
  "STRUCTURE",
  "STATUT",
  "ARRONDISSEMENT",
  "Arrondissement/ Commune",
  "Infrastructure d’élevage de base",
  "Equipement ou infrastructure annexe à l’infrastructure de base",
  "Niveau d’exécution physique (construit, non construit, En cours, Arrêté)",
  "Maladie suspectée",
  "Contrainte stratégique",
  "Solution proposée",
  "Description du niveau de réalisation",
  "Principales destinations",
]);

/** La case attend-elle un nombre ? */
export const attendUnNombre = (colonne: string) => !COLONNES_TEXTE.has(colonne);

/** Ce qu'il faut saisir, dit en clair en tête de chaque tableau. */
const AIDES: Record<number, string> = {
  101: "Nombre de structures dans l'arrondissement : DAEPIA, centres zootechniques et vétérinaires (CZV), centres ou postes de contrôle (CCP/SA).",
  1: "Nombre de structures à créer, par type.",
  2: "Nombre de postes de responsabilité à pourvoir.",
  3: "Nombre d'agents en poste, par grade.",
  4: "Nombre d'agents manquants, par grade.",
  5: "Nombre d'agents concernés par chaque mouvement au cours du trimestre.",
  6: "Nombre d'agents concernés au cours du trimestre.",
  7: "Nombre d'infrastructures, par type. Le déficit est le nombre qui manque.",
  8: "Nombre d'engins en service, par type.",
  9: "Nombre d'engins manquants, par type.",
  10: "Nombre d'équipements, par type.",
  11: "Montants en francs CFA.",
  12: "Montants en francs CFA.",
  102: "Montants en francs CFA.",
  13: "Recettes encaissées, en francs CFA, mois par mois.",
  14: "Nombre de têtes par catégorie. La somme des catégories doit être égale au cheptel bovin des rapports mensuels (colonne grise).",
  16: "Nombre de bovins abattus par catégorie. La somme doit être égale au total des rapports mensuels (colonne grise). La viande en découle automatiquement.",
  23: "Nombre de têtes par catégorie. La somme doit être égale au cheptel ovin des rapports mensuels (colonne grise).",
  37: "Nombre de têtes par catégorie. La somme doit être égale au cheptel porcin des rapports mensuels (colonne grise).",
  39: "Nombre de porcins abattus par catégorie. La somme doit être égale au total des rapports mensuels (colonne grise). La viande en découle automatiquement.",
  45: "Nombre de volailles abattues par catégorie. La somme doit être égale au total des rapports mensuels (colonne grise). La viande en découle automatiquement.",
  15: "Nombre d'infrastructures (pâturages et champs fourragers en hectares, pistes en km). Les valeurs grisées en attente sont reprises du tableau « Situation des infrastructures » du BAC : corrigez-les si nécessaire.",
  108: "Une ligne par ouvrage : commune, nature, montant en francs CFA, niveau d'exécution.",
  115: "Une ligne par vétérinaire installé en clientèle privée.",
  114: "Une ligne par suspicion : semaine épidémiologique, maladie, nombre de résultats confirmés et négatifs.",
};
const AIDE_PAR_DEFAUT = "Des nombres uniquement, sauf dans les colonnes de texte (signalées).";

/**
 * Les tableaux dont les CATÉGORIES se saisissent et dont le TOTAL vient du
 * mensuel. La somme des catégories doit retomber sur le total : sinon la
 * saisie est refusée (décision du Délégué).
 */
const TOTAL_MENSUEL: Record<number, string> = {
  14: "cheptel bovin",
  16: "nombre de bovins abattus",
  23: "cheptel ovin",
  37: "cheptel porcin",
  39: "nombre de porcins abattus",
  45: "nombre de volailles abattues",
};

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

/**
 * L'état d'une case pour ce profil.
 *
 * `sid` : ce que le SID sait seul de la case. Une case « TOTAL {P-1} » d'un
 * arrondissement que le SID ne sait pas calculer — il n'a pas encore l'an
 * passé dans sa base — se saisit : c'est la reprise d'historique. Sans `sid`,
 * elle reste calculée.
 */
export function etatCase(
  bloc: BlocTableau,
  ctx: ContexteCanevas,
  profil: Profil,
  ligne: string,
  colonne: string,
  sid?: FournisseurValeur
): EtatCase {
  if (texteFixe(bloc, ctx, ligne, colonne) !== undefined) return "lecture";
  if (sid && estCaseHistorique(bloc, ctx, ligne, colonne)) {
    const connu = sid({ numeroTableau: bloc.numero, titreTableau: bloc.titre, bloc, ligne, colonne, indexColonne: 0 });
    if (connu == null) return autorise(bloc, profil, ligne, colonne) ? "saisie" : "lecture";
  }
  if (estCaseCalculee(bloc.numero!, ligne, colonne, ctx)) return "calculee";
  if (estTotal(ligne) || estTotal(colonne)) return "total";
  return autorise(bloc, profil, ligne, colonne) ? "saisie" : "lecture";
}

/**
 * Le chiffre de l'an passé qui MANQUE à l'analyse d'un tableau : la case
 * « TOTAL {P-1} » de chaque arrondissement (ou structure) qui a des chiffres
 * cette période, mais pas encore l'an passé — le SID ne l'a pas dans sa base.
 * L'écran des analyses la fait saisir sur place (décision du Délégué : la
 * personne doit remplir la donnée de l'an passé, qui n'est pas encore dans le
 * système). `saisissable` : ce profil a-t-il le droit de la remplir ?
 */
export interface CaseAnPasse {
  ligne: string;
  colonne: string;
  /** L'arrondissement (ou la structure) concerné. */
  territoire: string;
  saisissable: boolean;
}

export function casesAnPasseManquantes(
  bloc: BlocTableau,
  ctx: ContexteCanevas,
  profil: Profil,
  valeur: ReturnType<typeof fournisseur>
): CaseAnPasse[] {
  const axe = axeTerritorial(bloc);
  if (!axe) return [];
  const n1 = `TOTAL ${ctx.periodeCourtN1}`;
  const courant = `TOTAL ${ctx.periodeCourt}`;
  const [, ...colonnes] = colonnesDe(bloc, ctx);
  const cles = clesLignes(bloc, ctx);
  const surAxe = axe === "lignes" ? cles : colonnes;
  const autres = axe === "lignes" ? colonnes : cles;
  if (!autres.includes(n1)) return [];
  const lire = (ligne: string, colonne: string) =>
    valeur({ numeroTableau: bloc.numero, titreTableau: bloc.titre, bloc, ligne, colonne, indexColonne: colonnes.indexOf(colonne) + 1 });
  const sortie: CaseAnPasse[] = [];
  for (const terr of surAxe) {
    if (estTotal(terr) || /^ÉCART/i.test(terr)) continue;
    const [ligne, colonne] = axe === "lignes" ? [terr, n1] : [n1, terr];
    if (!estCaseHistorique(bloc, ctx, ligne, colonne)) continue;
    if (versNombre(lire(ligne, colonne)) != null) continue; // déjà connu
    // Sans chiffre cette période, l'an passé ne sert à aucune comparaison.
    if (autres.includes(courant)) {
      const [lc, cc] = axe === "lignes" ? [terr, courant] : [courant, terr];
      if (versNombre(lire(lc, cc)) == null) continue;
    }
    sortie.push({ ligne, colonne, territoire: terr, saisissable: etatCase(bloc, ctx, profil, ligne, colonne, valeur.sid) === "saisie" });
  }
  return sortie;
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
  const arrondissementId = await arrondissementIdDe(db, profil);
  const saisies = await saisiesDe(db, periode, arrondissementId);
  // Ce que le SID sait de l’an passé : les cases qu’il ignore sont à reprendre.
  const sid = fournisseur(
    await preparer(db, periode, champsMobilises(), { autoriserIncomplet: true, arrondissementId }),
    ctx
  ).sid;
  const resultat: ResumeTableau[] = [];
  for (const { bloc, section } of tableaux()) {
    const { colonnes, cles } = coordonnees(bloc, ctx);
    let saisissables = 0;
    let renseignees = 0;
    for (const l of cles) {
      for (const c of colonnes) {
        if (etatCase(bloc, ctx, profil, l, c, sid) !== "saisie") continue;
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

async function saisiesDe(db: PrismaClient, periode: Periode, arrondissementId?: string): Promise<Map<string, ValeurCellule>> {
  const trimestre = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: periode.annee, trimestre: periode.rang },
    select: { id: true },
  });
  return trimestre ? saisiesVues(db, trimestre.id, arrondissementId, numerosSansMaille()) : new Map();
}

/** L'identifiant de l'arrondissement d'un DA ou d'un agent ; undefined pour le département. */
async function arrondissementIdDe(db: PrismaClient, profil: Profil): Promise<string | undefined> {
  if (!estArrondissement(profil)) return undefined;
  return (await listerArrondissements(db)).find((a) => a.nom === profil.arrondissement)?.id;
}

/**
 * La portée sous laquelle une saisie s'enregistre : celle de l'arrondissement
 * pour un DA ou un agent dans un tableau sans maille, celle du département
 * sinon — sa ligne d'un tableau à maille territoriale est une case partagée
 * par son rapport et le rapport départemental.
 */
export async function porteeDeSaisie(db: PrismaClient, profil: Profil, numero: number): Promise<string> {
  if (!numerosSansMaille().has(numero)) return "";
  return (await arrondissementIdDe(db, profil)) ?? "";
}

// ------------------------------------------------------------------ grille

export interface CaseGrille {
  colonne: string;
  etat: EtatCase;
  /** Ce qui s'imprimera au rapport, calculs compris. */
  affiche: string | null;
  /** La valeur brute saisie, pour l'édition. */
  saisi: string | null;
  /** Vrai si la case attend du texte ; sinon, un nombre. */
  texte: boolean;
  /** La valeur reprise d'un autre tableau, proposée tant que rien n'est saisi. */
  propose: string | null;
  /** Chef de section : case remplie par l'arrondissement — à signaler, pas à modifier. */
  reservee?: boolean;
  /**
   * Case « TOTAL {P-1} » que ce profil doit remplir lui-même — le SID n'a pas
   * encore la même période de l'an passé (reprise d'historique). OBLIGATOIRE
   * avant que le DA transmette (décision du Délégué, 15 octobre 2026).
   */
  anPasse?: boolean;
}

/** Un avertissement de la grille, et l'endroit qu'il vise (clé de ligne, colonne). */
export interface AlerteGrille {
  texte: string;
  ligne?: string;
  colonne?: string;
  /** Toutes les cases en cause, quand il y en a plusieurs (lignes qui s'additionnent). */
  cases?: { ligne: string; colonne: string }[];
  /** Le BAC peut confirmer son chiffre : l'avertissement disparaît tant que les deux chiffres ne bougent pas. */
  confirmable?: { ligne: string; arrondissement: string; ici: number; la: number };
}

/**
 * Les écarts BAC / arrondissement que le BAC a confirmés (« mon chiffre est
 * juste ») pour ce trimestre : « ligne|arrondissement|chiffre de l'arrondissement|chiffre du BAC ».
 */
export async function reprisesConfirmees(db: PrismaClient, periode: Periode): Promise<Set<string>> {
  const lignes = await db.auditLog.findMany({
    where: { action: "CONFIRMATION_REPRISE", entite: "Trimestre", entiteId: `${periode.annee}-${periode.rang}` },
    select: { details: true },
  });
  return new Set(
    lignes.map((l) => {
      const d = l.details as { ligne?: string; arrondissement?: string; ici?: number; la?: number } | null;
      return `${d?.ligne}|${d?.arrondissement}|${d?.ici}|${d?.la}`;
    })
  );
}

export interface GrilleSaisie {
  numero: number;
  titre: string;
  section: string;
  enteteLigne: string;
  lignes: { cle: string; libelle: string; cases: CaseGrille[] }[];
  /** Incohérences à signaler — somme des catégories ≠ total mensuel, reprise contredite. */
  avertissements: string[];
  /** Les mêmes, avec la ligne (et la case) en cause : « À corriger » y emmène. */
  alertes: AlerteGrille[];
  /** Ce qu'il faut saisir. */
  aide: string;
  /** Un chef : a-t-il l'ordre du DD de corriger les cases des arrondissements ? */
  ordreCorrection?: boolean;
}

/** La grille d'un tableau, telle que ce profil la voit et la remplit. */
export async function grille(db: PrismaClient, periode: Periode, profil: Profil, numero: number): Promise<GrilleSaisie | null> {
  return (await grilleEtContexte(db, periode, profil, numero))?.g ?? null;
}

/** La grille, avec ce qui a servi à la construire : de quoi la contrôler ensuite. */
async function grilleEtContexte(db: PrismaClient, periode: Periode, profil: Profil, numero: number) {
  const t = tableauDe(numero);
  if (!t) return null;
  const { bloc, section } = t;
  const ctx = await contextePour(db, periode, profil);
  const arrondissementId = await arrondissementIdDe(db, profil);

  // La consolidation du trimestre n'est utile qu'aux tableaux alimentés par le
  // mensuel : un tableau purement saisi se contente de ses saisies.
  const automatique = Boolean(liaisonDe(numero) || liaisonEvenementDe(numero));
  const donnees = await preparer(db, periode, automatique ? champsMobilises() : [], {
    autoriserIncomplet: true,
    arrondissementId,
    // Même un tableau purement saisi consolide ses saisies de l’an passé.
    sansAgregation: !automatique,
  });
  const valeur = fournisseur(donnees, ctx);
  const confirmees = await reprisesConfirmees(db, periode);
  const ordre = await aOrdreDeCorrection(db, periode, profil.role);
  return { g: construireGrille(bloc, section, ctx, profil, donnees, valeur, confirmees, ordre), bloc, ctx, donnees, valeur, confirmees };
}

/**
 * TOUTES les grilles de ce profil, d'une seule consolidation — pour que le
 * téléphone de l'agent les garde et puisse saisir sans réseau (décision du
 * Délégué : le hors-ligne est critique). Une grille par tableau où ce profil a
 * quelque chose à saisir.
 */
export async function grilles(db: PrismaClient, periode: Periode, profil: Profil): Promise<GrilleSaisie[]> {
  const ctx = await contextePour(db, periode, profil);
  const arrondissementId = await arrondissementIdDe(db, profil);
  const donnees = await preparer(db, periode, champsMobilises(), { autoriserIncomplet: true, arrondissementId });
  const valeur = fournisseur(donnees, ctx);
  const confirmees = await reprisesConfirmees(db, periode);
  const ordre = await aOrdreDeCorrection(db, periode, profil.role);
  const sortie: GrilleSaisie[] = [];
  for (const { bloc, section } of tableaux()) {
    const { colonnes, cles } = coordonnees(bloc, ctx);
    const saisissable = cles.some((l) => colonnes.some((c) => etatCase(bloc, ctx, profil, l, c, valeur.sid) === "saisie"));
    if (saisissable) sortie.push(construireGrille(bloc, section, ctx, profil, donnees, valeur, confirmees, ordre));
  }
  return sortie;
}

/**
 * CORRIGER UN CHIFFRE DE L'AN PASSÉ déjà inscrit — même quand le rapport est
 * transmis ou le domaine validé (décision du Délégué, 15 octobre 2026).
 *
 * Se corrigent ainsi : la case « TOTAL {P-1} » de la reprise d'historique, et
 * toute case saisissable d'un trimestre d'une année passée (le T3 2025 rempli
 * à partir des rapports de l'époque). Les chiffres de l'année en cours restent
 * figés par le circuit. Le rapport n'est
 * PAS rouvert ; la correction porte un motif, laisse une trace au journal
 * (ancien et nouveau chiffre) et prévient le DD. Le DA corrige son
 * arrondissement, le chef de section les tableaux de sa section (même une
 * case remplie par l'arrondissement), le DD tout. L'agent de saisie, non.
 */
export const ROLES_CORRECTION_AN_PASSE = ["DD", "DA", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"] as const;

/** L'année en cours au Cameroun. */
export function anneeCourante(maintenant: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: "Africa/Douala" }).format(maintenant));
}

export async function refusCorrectionAnPasse(
  db: PrismaClient,
  periode: Periode,
  profil: Profil,
  numero: number,
  ligne: string,
  colonne: string
): Promise<string | null> {
  if (!(ROLES_CORRECTION_AN_PASSE as readonly string[]).includes(profil.role)) {
    return "Un chiffre de l'an passé se corrige par le DA, le chef de section ou le Délégué départemental.";
  }
  // Un chef de section technique ne corrige un chiffre déjà inscrit que sur
  // ordre du DD (20 octobre 2026) ; le chef BAC, librement.
  if (estChefTechnique(profil.role) && !(await aOrdreDeCorrection(db, periode, profil.role))) {
    return "Un chef de section corrige un chiffre déjà inscrit seulement sur ordre du Délégué départemental. Demandez-lui un ordre de correction, ou signalez la case à l'arrondissement.";
  }
  const t = tableauDe(numero);
  if (!t) return `Le tableau n° ${numero} n'existe pas au canevas.`;
  const ctx = await contextePour(db, periode, profil);
  const { colonnes, cles } = coordonnees(t.bloc, ctx);
  if (!cles.includes(ligne) || !colonnes.includes(colonne)) return "Cette case n'existe pas dans ce tableau, ou n'est pas de votre ressort.";
  const historique = estCaseHistorique(t.bloc, ctx, ligne, colonne);
  // Un trimestre d'une année passée (2025 en 2026) : ses chiffres, repris des
  // rapports de l'époque, se corrigent eux aussi après validation.
  const anneePassee = periode.annee < anneeCourante();
  if (!historique && !anneePassee) {
    return `Seul le chiffre de l'an passé (${ctx.periodeCourtN1}) d'un arrondissement se corrige ainsi. Les chiffres de la période suivent le circuit du rapport.`;
  }
  if (!autorise(t.bloc, profil, ligne, colonne)) {
    return estArrondissement(profil) ? "Vous ne corrigez que le chiffre de votre arrondissement." : "Ce tableau n'est pas de votre section.";
  }
  if (!historique) {
    // Une case ordinaire d'un trimestre passé : celles qui se saisissent, pas
    // les calculées ni les totaux.
    switch (etatCase(t.bloc, ctx, profil, ligne, colonne)) {
      case "calculee":
        return "Cette case se remplit à partir des rapports mensuels : elle ne se corrige pas ici.";
      case "total":
        return "Les totaux et les écarts sont calculés : corrigez les cases dont ils viennent.";
      case "lecture":
        return "Cette case n'est pas de votre ressort.";
      default:
        return null;
    }
  }
  const automatique = Boolean(liaisonDe(numero) || liaisonEvenementDe(numero));
  const sid = fournisseur(
    await preparer(db, periode, automatique ? champsMobilises() : [], {
      autoriserIncomplet: true,
      arrondissementId: await arrondissementIdDe(db, profil),
      sansAgregation: !automatique,
    }),
    ctx
  ).sid;
  if (sid({ numeroTableau: numero, titreTableau: t.bloc.titre, bloc: t.bloc, ligne, colonne, indexColonne: 0 }) != null) {
    return "Le SID calcule ce chiffre à partir de ses propres données de l'an passé : il ne se corrige pas ici, mais dans le rapport d'où il vient.";
  }
  return null;
}

/** Un tableau où le chiffre de l'an passé de l'arrondissement manque encore. */
export interface AnPasseManquant {
  numero: number;
  titre: string;
}

/**
 * Les tableaux où CET arrondissement doit encore donner son chiffre de l'an
 * passé — la case « TOTAL {P-1} » que le SID ne sait pas calculer, faute
 * d'avoir la même période de l'an passé dans sa base.
 *
 * Seulement là où l'arrondissement a des chiffres cette période : sans eux,
 * l'an passé ne sert à aucune comparaison (même règle que les manques des
 * analyses). Un chiffre nul s'écrit 0 : une case vide se lit « non renseigné ».
 *
 * Décision du Délégué (15 octobre 2026) : c'est IMPÉRATIF — le DA ne transmet
 * pas tant qu'il en manque (voir /api/trimestre/circuit).
 */
export async function anPasseManquant(db: PrismaClient, periode: Periode, profil: Profil): Promise<AnPasseManquant[]> {
  const sortie: AnPasseManquant[] = [];
  for (const g of await grilles(db, periode, profil)) {
    const t = tableauDe(g.numero);
    const axe = t ? axeTerritorial(t.bloc) : null;
    if (!axe) continue;
    const aRemplir = g.lignes.flatMap((l) => l.cases.filter((c) => c.anPasse).map((c) => ({ ligne: l.cle, c })));
    const vides = aRemplir.filter(({ c }) => (c.saisi == null || c.saisi === "") && c.affiche == null);
    if (vides.length === 0) continue;
    // Le territoire de chaque case vide : sa ligne, ou sa colonne.
    const aDesChiffres = vides.some(({ ligne, c }) => {
      const cases =
        axe === "lignes"
          ? g.lignes.find((l) => l.cle === ligne)?.cases ?? []
          : g.lignes.filter((l) => !estTotal(l.cle) && !/^ÉCART/i.test(l.cle)).map((l) => l.cases.find((x) => x.colonne === c.colonne)!);
      return cases.some(
        (x) =>
          x &&
          !x.anPasse &&
          x.etat !== "total" &&
          !estTotal(x.colonne) &&
          !/^ÉCART/i.test(x.colonne) &&
          (x.affiche != null || (x.saisi != null && x.saisi !== ""))
      );
    });
    if (aDesChiffres) sortie.push({ numero: g.numero, titre: g.titre });
  }
  return sortie;
}

/** Le refus de transmettre, en clair : les tableaux à compléter, par numéro. */
export function messageAnPasseManquant(manquants: AnPasseManquant[], periodeN1: string): string {
  const liste = manquants.map((m) => `n° ${m.numero} (${m.titre})`);
  const affichee = liste.length > 6 ? `${liste.slice(0, 6).join(" ; ")} ; et ${liste.length - 6} autre(s)` : liste.join(" ; ");
  return (
    `Avant de transmettre, inscrivez le chiffre de l'an passé (${periodeN1}) de votre arrondissement — ` +
    `le SID ne l'a pas encore — dans ${manquants.length === 1 ? "ce tableau" : `ces ${manquants.length} tableaux`} : ${affichee}. ` +
    `Si l'activité était nulle, inscrivez 0.`
  );
}

function construireGrille(
  bloc: BlocTableau,
  section: string,
  ctx: ContexteCanevas,
  profil: Profil,
  donnees: Awaited<ReturnType<typeof preparer>>,
  valeur: ReturnType<typeof fournisseur>,
  confirmees: Set<string> = new Set(),
  /** Le chef de section a l'ordre du DD de corriger, pour ce trimestre (ordresCorrection.ts). */
  ordreCorrection = false
): GrilleSaisie {
  const numero = bloc.numero!;
  const { enteteLigne, colonnes, cles, libelles } = coordonnees(bloc, ctx);

  const lignes = cles.map((cle, r) => ({
    cle,
    libelle: libelles[r],
    cases: colonnes.map((colonne, i) => {
      const s = donnees.saisies.get(cleCellule({ numeroTableau: numero, ligne: cle, colonne }));
      const reprise = s ? null : valeurReprise(donnees.saisies, numero, cle, colonne);
      const etat = etatCase(bloc, ctx, profil, cle, colonne, valeur.sid);
      // Un chef de section technique complète ce qui manque ; ce que
      // l'arrondissement a écrit se signale — sauf sur ordre de correction du
      // DD (20 octobre 2026). Le chef BAC garde sa liberté : il complète et
      // corrige les tableaux du BAC.
      const reservee = etat === "saisie" && estChefTechnique(profil.role) && !ordreCorrection && remplieParLArrondissement(s);
      return {
        colonne,
        texte: !attendUnNombre(colonne),
        propose: reprise == null ? null : String(reprise),
        etat: reservee ? ("lecture" as const) : etat,
        ...(reservee ? { reservee: true } : {}),
        ...(etat === "saisie" && estCaseHistorique(bloc, ctx, cle, colonne) ? { anPasse: true } : {}),
        affiche:
          texteFixe(bloc, ctx, cle, colonne) ??
          valeur({ numeroTableau: numero, titreTableau: bloc.titre, bloc, ligne: cle, colonne, indexColonne: i + 1 }),
        saisi: s ? (s.texte ?? (s.valeur == null ? null : String(s.valeur))) : null,
      };
    }),
  }));

  const alertes = [
    ...lettresDansLesNombres(lignes),
    ...avertissements(bloc, ctx, lignes),
    ...alertesReprises(numero, ctx, donnees.saisies, confirmees),
  ];
  return {
    numero,
    titre: bloc.titre,
    section,
    enteteLigne,
    lignes,
    avertissements: alertes.map((a) => a.texte),
    alertes,
    ...(estChefTechnique(profil.role) ? { ordreCorrection } : {}),
    aide: [
      AIDES[numero] ?? AIDE_PAR_DEFAUT,
      ...(bloc.kind === "arrondissements" && bloc.totalSansSomme ? [bloc.totalSansSomme] : []),
      ...aideHistorique(bloc, ctx, lignes),
    ].join(" "),
  };
}

// ------------------------------------------------------------------ lecture

/** Un tableau tel qu'il s'imprimera, en lecture seule : ce qu'on relit sous l'analyse. */
export interface TableauLu {
  enteteLigne: string;
  colonnes: string[];
  /** `cle` : le repère de la ligne, celui des points à vérifier. */
  lignes: { cle: string; libelle: string; valeurs: (string | null)[] }[];
}

/**
 * Ce qu'il faut regarder dans un tableau (demande du Délégué, 9 octobre 2026 :
 * le chef de section doit voir les manquements, les erreurs et le reste) :
 *  - erreur : une incohérence — catégories ≠ total mensuel, lettres dans un nombre ;
 *  - ecart : deux tableaux qui se contredisent (BAC / arrondissement) ;
 *  - manque : une case qu'un arrondissement doit remplir, encore vide ;
 *  - variation : un total qui bouge fortement sur un an — erreur, ou cause à expliquer ;
 *  - observation : un signalement du DD ou du BAC, pas encore clos ;
 *  - circuit : des arrondissements qui n'ont pas transmis — leurs chiffres peuvent changer.
 */
export type GenrePoint = "erreur" | "ecart" | "manque" | "variation" | "observation" | "circuit";

export interface PointAVerifier {
  genre: GenrePoint;
  texte: string;
  /** Les cases en cause (colonne absente : toute la ligne). */
  cases: { ligne: string; colonne?: string }[];
}

export interface ConsultationTableau {
  numero: number;
  titre: string;
  /** Où sont les arrondissements : une ligne chacun, une colonne chacun, ou nulle part. */
  axe: "lignes" | "colonnes" | null;
  /** Un DA ou un agent : son arrondissement, seul visible. Null : tout le département. */
  arrondissement: string | null;
  tableau: TableauLu;
  /**
   * Tableau sans maille territoriale (budget-programme, BIP…) : chaque
   * arrondissement en tient SA version. Celles qui portent au moins une saisie.
   */
  versions: { arrondissement: string; tableau: TableauLu }[];
  /** Pour le département seulement (DD, chefs) : ce qu'il faut regarder. */
  points: PointAVerifier[];
  /** Ce profil peut y remplir une case ou en signaler une : l'écran de saisie lui ouvre ce tableau. */
  modifiable: boolean;
}

const enLecture = (g: GrilleSaisie): TableauLu => ({
  enteteLigne: g.enteteLigne,
  colonnes: g.lignes[0]?.cases.map((c) => c.colonne) ?? [],
  lignes: g.lignes.map((l) => ({ cle: l.cle, libelle: l.libelle || l.cle, valeurs: l.cases.map((c) => c.affiche) })),
});

/** Au-delà de 30 % sur un an, un total se vérifie — même seuil que le contrôle du mensuel. */
const SEUIL_VARIATION = 0.3;

const nf = (n: number) => n.toLocaleString("fr-FR");
const quelques = (noms: string[]) => (noms.length > 4 ? `${noms.slice(0, 4).join(", ")}…` : noms.join(", "));

/**
 * Les points à vérifier d'une grille DÉPARTEMENTALE, calculés sur ses seules
 * données : erreurs, écarts entre tableaux, manques, variations.
 */
function verifierGrille(
  bloc: BlocTableau,
  ctx: ContexteCanevas,
  valeur: ReturnType<typeof fournisseur>,
  saisies: Map<string, ValeurCellule>,
  lignes: GrilleSaisie["lignes"],
  confirmees: Set<string>
): PointAVerifier[] {
  const sortie: PointAVerifier[] = [];

  // Erreurs : la somme des catégories, les lettres dans un nombre.
  for (const a of avertissements(bloc, ctx, lignes)) sortie.push({ genre: "erreur", texte: a.texte, cases: [{ ligne: a.ligne! }] });
  for (const l of lignes) {
    for (const c of l.cases) {
      if (c.texte || c.saisi == null || versNombre(c.saisi) != null) continue;
      sortie.push({
        genre: "erreur",
        texte: `${l.libelle || l.cle}, « ${c.colonne} » : « ${c.saisi} » n'est pas un nombre — il ne compte dans aucun total.`,
        cases: [{ ligne: l.cle, colonne: c.colonne }],
      });
    }
  }

  // Écarts BAC / arrondissement : ni l'un ni l'autre n'est bloqué ; le BAC tranche.
  const numero = bloc.numero!;
  for (const r of REPRISES.filter((x) => x.source === numero || x.tableau === numero)) {
    for (const arr of ctx.arrondissements) {
      const ici = saisies.get(cleCellule({ numeroTableau: r.tableau, ligne: r.ligne, colonne: arr }))?.valeur;
      const la = valeurReprise(saisies, r.tableau, r.ligne, arr);
      if (ici == null || la == null || ici === la || confirmees.has(`${r.ligne}|${arr}|${ici}|${la}`)) continue;
      sortie.push({
        genre: "ecart",
        texte: `${arr} : ${nf(ici)} pour « ${r.ligne} » aux infrastructures d'exploitation, ${nf(la)} au tableau du BAC (${r.lignesSource.join(" + ")}). Le BAC doit confirmer son chiffre ou le corriger.`,
        cases: numero === r.source ? r.lignesSource.map((l) => ({ ligne: l, colonne: arr })) : [{ ligne: r.ligne, colonne: arr }],
      });
    }
  }

  const axe = axeTerritorial(bloc);
  if (!axe) return sortie;
  const colonnes = lignes[0]?.cases.map((c) => c.colonne) ?? [];
  const territoires = (axe === "lignes" ? lignes.map((l) => l.cle) : colonnes).filter((t) => ctx.arrondissements.includes(t));
  const lire = (ligne: string, colonne: string) => versNombre(lignes.find((l) => l.cle === ligne)?.cases.find((c) => c.colonne === colonne)?.affiche);

  for (const terr of territoires) {
    // Manques : ce que CET arrondissement doit remplir, et qui est vide.
    const cellules =
      axe === "lignes"
        ? (lignes.find((l) => l.cle === terr)?.cases ?? []).map((c) => ({ ligne: terr, libelle: c.colonne, c }))
        : lignes.flatMap((l) => {
            const c = l.cases.find((x) => x.colonne === terr);
            return c ? [{ ligne: l.cle, libelle: l.libelle || l.cle, c }] : [];
          });
    const profilArr: Profil = { role: "DA", arrondissement: terr };
    const vides = cellules.filter(
      ({ ligne, c }) => c.saisi == null && c.affiche == null && etatCase(bloc, ctx, profilArr, ligne, c.colonne, valeur.sid) === "saisie"
    );
    const anPasse = vides.filter(({ ligne, c }) => estCaseHistorique(bloc, ctx, ligne, c.colonne));
    const autres = vides.filter((v) => !anPasse.includes(v));
    const rempli = cellules.some(({ c }) => c.etat !== "total" && (c.saisi != null || c.affiche != null));
    if (autres.length) {
      sortie.push({
        genre: "manque",
        texte: rempli
          ? `${terr} : ${autres.length} case${autres.length > 1 ? "s" : ""} non remplie${autres.length > 1 ? "s" : ""} (${quelques(autres.map((v) => v.libelle))}).`
          : `${terr} : rien n'est saisi dans ce tableau. Si l'activité est nulle, l'arrondissement doit inscrire 0 : une case vide se lit « non renseigné ».`,
        cases: autres.map(({ ligne, c }) => ({ ligne, colonne: c.colonne })),
      });
    }
    if (anPasse.length && rempli) {
      sortie.push({
        genre: "manque",
        texte: `${terr} : le chiffre de l'an passé (${ctx.periodeCourtN1}) manque — pas de comparaison sur un an.`,
        cases: anPasse.map(({ ligne, c }) => ({ ligne, colonne: c.colonne })),
      });
    }

    // Variations : le total de l'arrondissement face à l'an passé.
    const n = `TOTAL ${ctx.periodeCourt}`;
    const n1 = `TOTAL ${ctx.periodeCourtN1}`;
    const [a, b] = axe === "lignes" ? [lire(terr, n), lire(terr, n1)] : [lire(n, terr), lire(n1, terr)];
    if (a != null && b != null && b > 0 && Math.abs(a - b) / b > SEUIL_VARIATION) {
      const pct = Math.round(((a - b) / b) * 1000) / 10;
      sortie.push({
        genre: "variation",
        texte: `${terr} : ${nf(a)} contre ${nf(b)} au ${ctx.periodeCourtN1}, soit ${pct > 0 ? "+" : "−"}${nf(Math.abs(pct))} % sur un an. Erreur de saisie, ou cause à expliquer dans l'analyse.`,
        cases: axe === "lignes" ? [{ ligne: terr, colonne: n }] : [{ ligne: n, colonne: terr }],
      });
    }
  }
  return sortie;
}

/**
 * Les points à vérifier de chaque tableau, d'une seule consolidation — pour
 * les compter dans la liste des analyses.
 */
export async function pointsParTableau(
  db: PrismaClient,
  periode: Periode,
  profil: Profil,
  ctx: ContexteCanevas,
  donnees: Awaited<ReturnType<typeof preparer>>,
  valeur: ReturnType<typeof fournisseur>,
  numeros: number[]
): Promise<Map<number, PointAVerifier[]>> {
  const sortie = new Map<number, PointAVerifier[]>();
  if (estArrondissement(profil)) return sortie;
  const confirmees = await reprisesConfirmees(db, periode);
  for (const numero of numeros) {
    const t = tableauDe(numero);
    if (!t) continue;
    const g = construireGrille(t.bloc, t.section, ctx, profil, donnees, valeur, confirmees);
    sortie.set(numero, verifierGrille(t.bloc, ctx, valeur, donnees.saisies, g.lignes, confirmees));
  }
  return sortie;
}

const AUTEUR: Record<string, string> = { DD: "Le DD", CHEF_BAC: "Le chef BAC" };

/**
 * Le tableau consolidé, en LECTURE (demande du Délégué, 9 octobre 2026) : les
 * chefs de section valident l'analyse d'un tableau qu'ils ne pouvaient pas
 * voir. Ils y lisent ce que chaque arrondissement a produit, et ce qu'il faut
 * y vérifier. Un DA ou un agent n'y voit que son arrondissement, comme partout.
 */
export async function consulterTableau(db: PrismaClient, periode: Periode, profil: Profil, numero: number): Promise<ConsultationTableau | null> {
  const r = await grilleEtContexte(db, periode, profil, numero);
  if (!r) return null;
  const { g, bloc, ctx, donnees, valeur, confirmees } = r;
  const departement = !estArrondissement(profil);
  const versions: ConsultationTableau["versions"] = [];
  const points: PointAVerifier[] = [];

  if (departement) {
    if (numerosSansMaille().has(numero)) {
      for (const a of await listerArrondissements(db)) {
        const v = await grille(db, periode, { role: "DA", arrondissement: a.nom }, numero);
        if (v?.lignes.some((l) => l.cases.some((c) => c.saisi != null))) versions.push({ arrondissement: a.nom, tableau: enLecture(v) });
      }
    }
    points.push(...verifierGrille(bloc, ctx, valeur, donnees.saisies, g.lignes, confirmees));

    // Les signalements en cours sur ce tableau.
    for (const o of await observationsTrimestre(db, {})) {
      if (o.close || o.annee !== periode.annee || o.trimestre !== periode.rang) continue;
      const c = o.cible;
      if (c.type === "texte" || c.numero !== numero) continue;
      const qui = AUTEUR[o.auteurRole] ?? o.auteurNom;
      const suite = o.reponse ? `réponse : « ${o.reponse.texte} »` : o.corrigee ? "modifié depuis" : "en attente de correction ou de réponse";
      points.push({
        genre: "observation",
        texte:
          c.type === "case"
            ? `${qui} a signalé ${c.libelle} : « ${o.texte} » — ${suite}.`
            : `${qui} a signalé l'analyse : « ${o.texte} » — ${suite}.`,
        cases: c.type === "case" ? [{ ligne: c.ligne, colonne: c.colonne }] : [],
      });
    }

    // Les arrondissements qui n'ont pas transmis : leurs chiffres bougent encore.
    if (axeTerritorial(bloc) || versions.length) {
      const etat = await etatCircuit(db, periode);
      const enCours = etat.arrondissements.filter((a) => a.statut === "EN_PREPARATION").map((a) => a.nom);
      const renvoyes = etat.arrondissements.filter((a) => a.statut === "RENVOYE").map((a) => a.nom);
      if (enCours.length)
        points.push({ genre: "circuit", texte: `Pas encore transmis : ${enCours.join(", ")}. Leurs chiffres peuvent encore changer.`, cases: [] });
      if (renvoyes.length)
        points.push({ genre: "circuit", texte: `Renvoyé pour correction : ${renvoyes.join(", ")}.`, cases: [] });
    }
  }

  return {
    numero,
    titre: bloc.titre,
    axe: axeTerritorial(bloc),
    arrondissement: departement ? null : profil.arrondissement ?? null,
    tableau: enLecture(g),
    versions,
    points,
    modifiable: departement && g.lignes.some((l) => l.cases.some((c) => c.etat === "saisie" || c.reservee)),
  };
}

/**
 * La consigne de la reprise d’historique, quand l’écran en porte une case à
 * saisir : que mettre, et pourquoi on ne le demandera plus.
 */
function aideHistorique(bloc: BlocTableau, ctx: ContexteCanevas, lignes: GrilleSaisie["lignes"]): string[] {
  const aSaisir = lignes.some((l) => l.cases.some((c) => c.etat === "saisie" && estCaseHistorique(bloc, ctx, l.cle, c.colonne)));
  if (!aSaisir) return [];
  return [
    `« TOTAL ${ctx.periodeCourtN1} » : le total de votre arrondissement au même trimestre de l’année dernière, ` +
      `repris de vos rapports de l’époque. Le SID n’a pas encore ces chiffres : il vous les demande cette fois-ci, ` +
      `et les calculera lui-même dès qu’il les aura.`,
  ];
}

/**
 * Quand le mensuel porte le TOTAL et que les catégories se saisissent (cheptel
 * bovin : l'effectif au mois, les taurillons, génisses… au trimestre), la somme
 * des catégories doit retomber sur le total. Sinon, on le dit — sans bloquer :
 * c'est au Délégué de trancher entre deux sources.
 */
function avertissements(bloc: BlocTableau, ctx: ContexteCanevas, lignes: GrilleSaisie["lignes"]): AlerteGrille[] {
  const liaison = liaisonDe(bloc.numero);
  if (!liaison?.total || liaison.orientation !== "lignes") return [];
  const categories = liaison.correspondances.filter((c) => !estLiee(c)).map((c) => c.libelle);
  const total = `TOTAL ${ctx.periodeCourt}`;
  const nombre = (s: string | null) => (s == null ? null : Number(s.replace(/\s| /g, "").replace(",", ".")));
  const sortie: AlerteGrille[] = [];
  for (const l of lignes) {
    if (estTotal(l.cle)) continue;
    // Tant qu'une catégorie manque, la somme ne dit rien : on attend.
    let somme: number | null = 0;
    let vues = 0;
    for (const c of l.cases) {
      if (!categories.includes(c.colonne)) continue;
      vues++;
      const v = nombre(c.saisi);
      if (v == null || !Number.isFinite(v)) {
        somme = null;
        break;
      }
      somme += v;
    }
    // Aucune catégorie saisie dans cette ligne (viande : tout est calculé) : rien à comparer.
    if (somme == null || vues === 0) continue;
    const attendu = nombre(l.cases.find((c) => c.colonne === total)?.affiche ?? null);
    if (attendu != null && Number.isFinite(attendu) && Math.abs(somme - attendu) > 0.5) {
      sortie.push({
        texte: `${l.libelle} : la somme des catégories (${somme.toLocaleString("fr-FR")}) ne retombe pas sur le total des rapports mensuels (${attendu.toLocaleString("fr-FR")}).`,
        ligne: l.cle,
      });
    }
  }
  return sortie;
}

/**
 * Des lettres enregistrées dans une case qui attend un nombre — avant que la
 * règle ne les refuse. Elles ne comptent dans aucun total : on les signale
 * pour qu'elles soient remplacées.
 */
function lettresDansLesNombres(lignes: GrilleSaisie["lignes"]): AlerteGrille[] {
  const sortie: AlerteGrille[] = [];
  for (const l of lignes) {
    for (const c of l.cases) {
      if (c.etat !== "saisie" || c.texte || c.saisi == null) continue;
      if (versNombre(c.saisi) != null) continue;
      sortie.push({
        texte: `${l.libelle || l.cle}, « ${c.colonne} » : « ${c.saisi} » n'est pas un nombre. Remplacez-le par un chiffre.`,
        ligne: l.cle,
        colonne: c.colonne,
      });
    }
  }
  return sortie;
}

/**
 * Les reprises CONTREDITES : l'arrondissement donne, au tableau des
 * infrastructures d'exploitation, un autre chiffre que le tableau du BAC.
 *
 * Décision du Délégué (7 octobre 2026) : ce n'est PAS une erreur de
 * l'arrondissement. Son chiffre est enregistré et rien ne le bloque ; c'est au
 * BAC de CONFIRMER son chiffre ou de le CORRIGER. L'avertissement ne s'affiche
 * donc que dans le tableau du BAC, sur ses cases, avec « Mon chiffre est
 * juste » ; une fois confirmé, il disparaît tant que les deux chiffres ne
 * changent pas.
 */
function alertesReprises(
  numero: number,
  ctx: ContexteCanevas,
  saisies: Map<string, ValeurCellule>,
  confirmees: Set<string> = new Set()
): AlerteGrille[] {
  const concernees = REPRISES.filter((r) => r.source === numero);
  const sortie: AlerteGrille[] = [];
  for (const r of concernees) {
    for (const arr of ctx.arrondissements) {
      const ici = saisies.get(cleCellule({ numeroTableau: r.tableau, ligne: r.ligne, colonne: arr }))?.valeur;
      const la = valeurReprise(saisies, r.tableau, r.ligne, arr);
      if (ici == null || la == null || ici === la) continue;
      if (confirmees.has(`${r.ligne}|${arr}|${ici}|${la}`)) continue;
      sortie.push({
        texte:
          `${arr} indique ${ici} pour « ${r.ligne} » (tableau des infrastructures d'exploitation) ; votre tableau en porte ${la} ` +
          `(${r.lignesSource.join(" + ")}). Confirmez votre chiffre ou corrigez-le.`,
        ligne: r.lignesSource[0],
        colonne: arr,
        cases: r.lignesSource.map((l) => ({ ligne: l, colonne: arr })),
        confirmable: { ligne: r.ligne, arrondissement: arr, ici, la },
      });
    }
  }
  return sortie;
}

/**
 * Le détail d'un refus « catégories ≠ total mensuel », pour que l'agent aille
 * droit au problème et compare (demande du Délégué, 28 septembre 2026) : ce
 * qu'il a saisi, le chiffre de CHAQUE mois dans les rapports mensuels, le mois
 * retenu (le plus récent pour un cheptel, qui est un effectif à date ; tous
 * les mois pour des abattages, qui s'additionnent), l'état de chaque rapport,
 * et le tableau mensuel à ouvrir.
 */
export interface ControleCategories {
  tableau: number;
  titreTableau: string;
  arrondissement: string;
  /** « cheptel ovin », « nombre de bovins abattus »… */
  nature: string;
  categories: { libelle: string; valeur: number }[];
  somme: number;
  total: number;
  ecart: number;
  /** Un cheptel : le mois le plus récent fait foi. Des abattages : les mois s'additionnent. */
  regle: "DERNIERE_VALEUR" | "SOMME";
  mois: {
    periodeId: string | null;
    libelle: string;
    valeur: number | null;
    /** Ce mois fait (ou contribue au) total des rapports mensuels. */
    retenu: boolean;
    /** Le rapport mensuel de l'arrondissement : EN_SAISIE, SOUMIS, REJETE, CLOTURE — ou null s'il n'existe pas. */
    statutRapport: string | null;
  }[];
  /** Le tableau du rapport mensuel qui porte ce total : pour l'ouvrir. */
  mensuel: { code: string; numero: string; titre: string } | null;
}

/**
 * Refuse une saisie qui rendrait la somme des catégories DIFFÉRENTE du total
 * des rapports mensuels (décision du Délégué). Le contrôle ne joue que lorsque
 * toutes les catégories de l'arrondissement sont remplies, et que le total
 * mensuel existe ; sinon il n'y a rien à comparer.
 */
export async function incoherenceCategories(
  db: PrismaClient,
  periode: Periode,
  profil: Profil,
  numero: number,
  ligne: string,
  colonne: string,
  nouvelle: number | null
): Promise<{ message: string; controle: ControleCategories | null } | null> {
  const nature = TOTAL_MENSUEL[numero];
  const liaison = liaisonDe(numero);
  if (!nature || !liaison?.total || liaison.orientation !== "lignes") return null;
  const categories = liaison.correspondances.filter((c) => !estLiee(c)).map((c) => c.libelle);
  if (!categories.includes(colonne)) return null;

  const g = await grille(db, periode, profil, numero);
  const l = g?.lignes.find((x) => x.cle === ligne);
  if (!g || !l) return null;
  let somme = 0;
  const saisies: { libelle: string; valeur: number }[] = [];
  for (const c of l.cases) {
    if (!categories.includes(c.colonne)) continue;
    const v = c.colonne === colonne ? nouvelle : versNombre(c.saisi);
    if (v == null) return null; // une catégorie manque encore : on attend
    somme += v;
    saisies.push({ libelle: c.colonne, valeur: v });
  }
  const ctx = await contextePour(db, periode, profil);
  const total = versNombre(l.cases.find((c) => c.colonne === `TOTAL ${ctx.periodeCourt}`)?.affiche);
  if (total == null || Math.abs(somme - total) < 0.5) return null;
  const f = (n: number) => n.toLocaleString("fr-FR");
  const message =
    `${l.libelle} : la somme des catégories (${f(somme)}) doit être égale au ${nature} des rapports mensuels (${f(total)}), ` +
    `soit un écart de ${f(Math.abs(somme - total))}. La saisie n'est pas enregistrée : corrigez les catégories, ` +
    `ou faites corriger le rapport mensuel.`;

  // Le détail n'est qu'une aide : s'il ne peut pas être établi, le refus reste.
  let controle: ControleCategories | null = null;
  try {
    controle = await detailDuTotal(db, periode, liaison.total, l.libelle);
    if (controle) {
      Object.assign(controle, {
        tableau: numero,
        titreTableau: g.titre,
        arrondissement: l.libelle,
        nature,
        categories: saisies,
        somme,
        total,
        ecart: Math.abs(somme - total),
      });
    }
  } catch {
    controle = null;
  }
  return { message, controle };
}

/**
 * Le total mensuel d'un arrondissement, mois par mois : la même formule que
 * le rapport, appliquée à chaque mois, et la règle qui en fait le total de la
 * période (le mois le plus récent pour un stock, la somme pour un flux).
 */
async function detailDuTotal(
  db: PrismaClient,
  periode: Periode,
  formule: NonNullable<ReturnType<typeof liaisonDe>>["total"],
  territoire: string
): Promise<ControleCategories | null> {
  if (!formule) return null;
  const arr = (await listerArrondissements(db)).find((a) => a.nomCanevas === graphieCanevas(territoire) || a.nom === territoire);
  if (!arr) return null;
  const { agreger } = await import("./agregation");
  const { regleDuChamp } = await import("./reglesChamps");
  const { evaluer } = await import("./liaison");
  const r = await agreger(db, periode, { champs: formule.champs, arrondissementId: arr.id, autoriserIncomplet: true });
  const regle = regleDuChamp(formule.champs[0]) === "DERNIERE_VALEUR" ? "DERNIERE_VALEUR" : "SOMME";

  const moisDeLaP = moisDeLaPeriode(periode);
  const valeurs = moisDeLaP.map(({ annee, mois }) =>
    evaluer(formule, (champ) => {
      const v = r.valeurs.find((x) => x.fieldCode === champ && x.arrondissementCode === arr.code);
      return v?.detail.find((d) => d.annee === annee && d.mois === mois)?.valeur ?? null;
    })
  );
  // Le mois retenu pour un stock : le plus récent renseigné.
  const dernier = valeurs.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop() ?? -1;

  const lignes = await db.periodeReporting.findMany({
    where: { type: "MENSUEL", OR: moisDeLaP.map(({ annee, mois }) => ({ annee, mois })) },
    select: { id: true, annee: true, mois: true, rapports: { where: { arrondissementId: arr.id }, select: { statut: true } } },
  });
  const champ = await db.formField.findFirst({
    where: { code: formule.champs[0] },
    select: { template: { select: { code: true, numero: true, titre: true } } },
  });

  return {
    tableau: 0, titreTableau: "", arrondissement: territoire, nature: "", categories: [], somme: 0, total: 0, ecart: 0,
    regle,
    mois: moisDeLaP.map(({ annee, mois }, i) => {
      const ligne = lignes.find((x) => x.annee === annee && x.mois === mois);
      return {
        periodeId: ligne?.id ?? null,
        libelle: `${MOIS_MAJ[mois - 1].charAt(0)}${MOIS_MAJ[mois - 1].slice(1).toLowerCase()} ${annee}`,
        valeur: valeurs[i],
        retenu: regle === "DERNIERE_VALEUR" ? i === dernier : valeurs[i] != null,
        statutRapport: ligne?.rapports[0]?.statut ?? null,
      };
    }),
    mensuel: champ?.template ?? null,
  };
}

/**
 * « D'OÙ VIENT CE CHIFFRE ? » — une case grise du trimestre, calculée à partir
 * des rapports mensuels, détaillée mois par mois (demande du Délégué, 20
 * octobre 2026 : un chef qui voit une erreur au trimestre doit pouvoir
 * vérifier le mensuel, d'où elle vient forcément).
 *
 * Lecture seule. La correction, s'il y a lieu, se fait DANS LE MOIS, par le
 * circuit du mensuel — jamais dans le trimestre : il n'y a qu'une source.
 */
export async function origineCase(
  db: PrismaClient,
  periode: Periode,
  profil: Profil,
  numero: number,
  ligne: string,
  colonne: string
): Promise<{ origine: ControleCategories & { explication: string; periodeLue: string } } | { message: string }> {
  const t = tableauDe(numero);
  if (!t) return { message: "Tableau inconnu." };
  const ctx = await contextePour(db, periode, profil);
  if (!estCaseCalculee(numero, ligne, colonne, ctx)) return { message: "Cette case ne vient pas des rapports mensuels." };
  const liaison = liaisonDe(numero);
  if (!liaison) {
    return { message: "Ce chiffre vient des listes du mensuel (vaccinations, consultations, circulation…) : vérifiez-les dans les rapports mensuels des trois mois." };
  }
  const [categorie, territoire] = liaison.orientation === "lignes" ? [colonne, ligne] : [ligne, colonne];
  if (estTotal(territoire) || /^ÉCART/i.test(territoire)) {
    return { message: "Touchez la case d'un arrondissement : le total du département additionne leurs chiffres." };
  }
  // Le ressort : le DD lit tout ; un DA ou un agent, son arrondissement ; un
  // chef, les tableaux de sa section (le chef BAC, ceux du BAC).
  const ressort =
    profil.role === "DD" ||
    (estArrondissement(profil) && territoire === profil.arrondissement) ||
    (profil.role === "CHEF_BAC" && TABLEAUX_BAC.has(numero)) ||
    (estChefTechnique(profil.role) && chefDuTableau(numero) === profil.role);
  if (!ressort || !ctx.arrondissements.includes(territoire)) return { message: "Cette case n'est pas de votre ressort." };

  // La formule : celle de la catégorie, ou celle du total de la ligne.
  const n1 = `TOTAL ${ctx.periodeCourtN1}`;
  const anPasse = categorie === n1;
  let formule: Formule | undefined;
  if (estTotal(categorie)) {
    formule = liaison.total;
    if (!formule) return { message: "Ce total additionne les catégories de la ligne : touchez l'une d'elles pour voir d'où elle vient." };
  } else {
    const corr = liaison.correspondances.find((c) => c.libelle === categorie);
    if (corr?.depuisSaisie) {
      return { message: `Ce chiffre se calcule à partir du tableau n° ${corr.depuisSaisie.tableau} du trimestre (« ${corr.depuisSaisie.colonne} ») : ${corr.depuisSaisie.explication}` };
    }
    formule = corr?.formule ?? (corr?.champ ? { champs: [corr.champ], explication: "Le chiffre du rapport mensuel, repris tel quel." } : undefined);
  }
  if (!formule) return { message: "Cette case n'est alimentée par aucun champ du mensuel." };

  // Le total de l'an passé se lit dans les mois de l'an passé.
  const periodeLue = anPasse ? memePeriodeAnneePrecedente(periode) : periode;
  const detail = await detailDuTotal(db, periodeLue, formule, territoire);
  if (!detail) return { message: "Le détail mois par mois n'a pas pu être établi pour cette case." };
  return {
    origine: {
      ...detail,
      tableau: numero,
      titreTableau: t.bloc.titre,
      nature: categorie,
      explication: formule.explication,
      periodeLue: libelleCourt(periodeLue),
    },
  };
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
  // L’an passé d’un arrondissement ne se saisit que si le SID l’ignore.
  let sid: FournisseurValeur | undefined;
  if (estCaseHistorique(t.bloc, ctx, ligne, colonne)) {
    const automatique = Boolean(liaisonDe(numero) || liaisonEvenementDe(numero));
    sid = fournisseur(
      await preparer(db, periode, automatique ? champsMobilises() : [], {
        autoriserIncomplet: true,
        arrondissementId: await arrondissementIdDe(db, profil),
        sansAgregation: !automatique,
      }),
      ctx
    ).sid;
  }
  switch (etatCase(t.bloc, ctx, profil, ligne, colonne, sid)) {
    case "calculee":
      return "Cette case se remplit à partir des rapports mensuels : elle ne se saisit pas.";
    case "total":
      return "Les totaux et les écarts sont calculés : ils ne se saisissent pas.";
    case "lecture":
      return "Cette case n'est pas de votre ressort.";
    default:
      break;
  }
  // Un chef de section technique ne réécrit pas ce que l'arrondissement a
  // saisi — sauf sur ordre de correction du DD pour ce trimestre (20 octobre
  // 2026). Le chef BAC, lui, garde sa liberté sur les tableaux du BAC.
  if (estChefTechnique(profil.role) && !(await aOrdreDeCorrection(db, periode, profil.role))) {
    const p = await db.periodeReporting.findFirst({
      where: { type: "TRIMESTRIEL", annee: periode.annee, trimestre: periode.rang },
      select: { id: true },
    });
    const existante = p
      ? await db.saisieCanevas.findFirst({
          where: { periodeId: p.id, numeroTableau: numero, ligne, colonne, portee: "" },
          select: { auteur: { select: { role: true } } },
        })
      : null;
    if (existante && remplieParLArrondissement({ valeur: null, texte: null, parRole: existante.auteur?.role ?? null })) {
      return MESSAGE_SANS_ORDRE;
    }
  }
  return null;
}

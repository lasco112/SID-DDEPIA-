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
import { preparer, fournisseur, estCaseCalculee, valeurReprise, versNombre } from "./remplissage";
import { REPRISES, repriseDe } from "./canevas/reprises";
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
  /** Vrai si la case attend du texte ; sinon, un nombre. */
  texte: boolean;
  /** La valeur reprise d'un autre tableau, proposée tant que rien n'est saisi. */
  propose: string | null;
}

export interface GrilleSaisie {
  numero: number;
  titre: string;
  section: string;
  enteteLigne: string;
  lignes: { cle: string; libelle: string; cases: CaseGrille[] }[];
  /** Incohérences à signaler — somme des catégories ≠ total mensuel, reprise contredite. */
  avertissements: string[];
  /** Ce qu'il faut saisir. */
  aide: string;
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
      const reprise = s ? null : valeurReprise(donnees.saisies, numero, cle, colonne);
      return {
        colonne,
        texte: !attendUnNombre(colonne),
        propose: reprise == null ? null : String(reprise),
        etat: etatCase(bloc, ctx, profil, cle, colonne),
        affiche:
          texteFixe(bloc, ctx, cle, colonne) ??
          valeur({ numeroTableau: numero, titreTableau: bloc.titre, bloc, ligne: cle, colonne, indexColonne: i + 1 }),
        saisi: s ? (s.texte ?? (s.valeur == null ? null : String(s.valeur))) : null,
      };
    }),
  }));

  return {
    numero,
    titre: bloc.titre,
    section,
    enteteLigne,
    lignes,
    avertissements: [
      ...lettresDansLesNombres(lignes),
      ...avertissements(bloc, ctx, lignes),
      ...alertesReprises(numero, ctx, donnees.saisies),
    ],
    aide: AIDES[numero] ?? AIDE_PAR_DEFAUT,
  };
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
 * Des lettres enregistrées dans une case qui attend un nombre — avant que la
 * règle ne les refuse. Elles ne comptent dans aucun total : on les signale
 * pour qu'elles soient remplacées.
 */
function lettresDansLesNombres(lignes: GrilleSaisie["lignes"]): string[] {
  const sortie: string[] = [];
  for (const l of lignes) {
    for (const c of l.cases) {
      if (c.etat !== "saisie" || c.texte || c.saisi == null) continue;
      if (versNombre(c.saisi) != null) continue;
      sortie.push(`${l.libelle || l.cle}, « ${c.colonne} » : « ${c.saisi} » n'est pas un nombre. Remplacez-le par un chiffre.`);
    }
  }
  return sortie;
}

/**
 * Les reprises CONTREDITES : une valeur saisie dans le tableau qui reçoit,
 * différente de ce que porte le tableau d'origine. Affichées des deux côtés.
 */
function alertesReprises(numero: number, ctx: ContexteCanevas, saisies: Map<string, ValeurCellule>): string[] {
  const concernees = REPRISES.filter((r) => r.tableau === numero || r.source === numero);
  const sortie: string[] = [];
  for (const r of concernees) {
    for (const arr of ctx.arrondissements) {
      const ici = saisies.get(cleCellule({ numeroTableau: r.tableau, ligne: r.ligne, colonne: arr }))?.valeur;
      const la = valeurReprise(saisies, r.tableau, r.ligne, arr);
      if (ici == null || la == null || ici === la) continue;
      sortie.push(
        `${arr}, « ${r.ligne} » : ${ici} au tableau des infrastructures d'exploitation, ${la} au tableau « Situation des infrastructures » du BAC (${r.lignesSource.join(" + ")}). Vérifiez lequel est juste.`
      );
    }
  }
  return sortie;
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
): Promise<string | null> {
  const nature = TOTAL_MENSUEL[numero];
  const liaison = liaisonDe(numero);
  if (!nature || !liaison?.total || liaison.orientation !== "lignes") return null;
  const categories = liaison.correspondances.filter((c) => !estLiee(c)).map((c) => c.libelle);
  if (!categories.includes(colonne)) return null;

  const g = await grille(db, periode, profil, numero);
  const l = g?.lignes.find((x) => x.cle === ligne);
  if (!g || !l) return null;
  let somme = 0;
  for (const c of l.cases) {
    if (!categories.includes(c.colonne)) continue;
    const v = c.colonne === colonne ? nouvelle : versNombre(c.saisi);
    if (v == null) return null; // une catégorie manque encore : on attend
    somme += v;
  }
  const ctx = await contextePour(db, periode, profil);
  const total = versNombre(l.cases.find((c) => c.colonne === `TOTAL ${ctx.periodeCourt}`)?.affiche);
  if (total == null || Math.abs(somme - total) < 0.5) return null;
  const f = (n: number) => n.toLocaleString("fr-FR");
  return (
    `${l.libelle} : la somme des catégories (${f(somme)}) doit être égale au ${nature} des rapports mensuels (${f(total)}), ` +
    `soit un écart de ${f(Math.abs(somme - total))}. La saisie n'est pas enregistrée : corrigez les catégories, ` +
    `ou faites corriger le rapport mensuel.`
  );
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

/**
 * L'écran des analyses : ce que chaque profil relit, valide ou corrige.
 *
 *  - agent de saisie et DA : les analyses du rapport de LEUR arrondissement ;
 *  - chef de section : les analyses départementales de SON domaine ;
 *  - DD : toutes les analyses départementales, qu'il relit et ne corrige que
 *    s'il le veut.
 */
import type { PrismaClient } from "@prisma/client";
import type { Periode } from "../../periodes/calendrier";
import { preparer, fournisseur } from "../remplissage";
import { champsMobilises } from "../liaison";
import { contextePour, type Profil } from "../saisieTrimestrielle";
import { listerArrondissements } from "@/lib/arrondissements";
import { textesCalcules } from "./conclusion";
import { propositions, lireAnalyses, statutDe, texteAuRapport, type Proposition, type StatutAnalyse } from "./analyses";
import type { PhraseAnalyse } from "./analyseTableau";

export const ROLES_ANALYSE = ["DD", "DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"] as const;

const estArrondissement = (p: Profil) => p.role === "DA" || p.role === "AGENT_SAISIE";

export interface AnalyseAEcran {
  numero: number;
  titre: string;
  section: string;
  statut: StatutAnalyse;
  /** Le texte calculé aujourd'hui. */
  propose: string;
  /** Chaque phrase et son calcul, pour « Voir le calcul ». */
  phrases: PhraseAnalyse[];
  /** Le texte retenu par l'auteur, s'il a validé. */
  texteValide: string | null;
  explication: string | null;
  validePar: string | null;
  valideLe: string | null;
  /** Ce qui partira au rapport. */
  auRapport: string | null;
  sansComparaison: boolean;
}

export interface EcranAnalyses {
  /** « l'arrondissement de Dschang », « le département ». */
  portee: string;
  analyses: AnalyseAEcran[];
}

/** La portée d'un profil : l'identifiant de son arrondissement, ou "" pour le département. */
export async function porteeDe(db: PrismaClient, profil: Profil): Promise<string | null> {
  if (!estArrondissement(profil)) return "";
  const a = (await listerArrondissements(db)).find((x) => x.nom === profil.arrondissement);
  return a?.id ?? null;
}

/** Ce profil voit-il (et valide-t-il) l'analyse de ce tableau ? */
function concerne(p: Proposition, profil: Profil): boolean {
  if (profil.role.startsWith("CHEF_")) return p.chef === profil.role;
  return true;
}

/** Les propositions calculées pour ce profil, sur ses chiffres à lui. */
export async function propositionsPour(db: PrismaClient, periode: Periode, profil: Profil): Promise<Proposition[]> {
  const portee = await porteeDe(db, profil);
  const ctx = await contextePour(db, periode, profil);
  const donnees = await preparer(db, periode, champsMobilises(), {
    autoriserIncomplet: true,
    arrondissementId: portee || undefined,
  });
  return propositions(ctx, fournisseur(donnees, ctx)).filter((p) => concerne(p, profil));
}

/** Les conclusions rédigées automatiquement, sur les chiffres et les textes de ce profil. */
export async function textesCalculesPour(
  db: PrismaClient,
  periode: Periode,
  profil: Profil,
  ecrits: Map<string, string> = new Map()
): Promise<Map<string, string>> {
  const portee = await porteeDe(db, profil);
  const ctx = await contextePour(db, periode, profil);
  const donnees = await preparer(db, periode, champsMobilises(), {
    autoriserIncomplet: true,
    arrondissementId: portee || undefined,
  });
  return textesCalcules(ctx, fournisseur(donnees, ctx), ecrits);
}

export async function ecranAnalyses(db: PrismaClient, periode: Periode, profil: Profil): Promise<EcranAnalyses> {
  const portee = (await porteeDe(db, profil)) ?? "";
  const trimestre = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: periode.annee, trimestre: periode.rang },
    select: { id: true },
  });
  const enregistrees = await lireAnalyses(db, trimestre?.id ?? null, portee);
  const analyses = (await propositionsPour(db, periode, profil)).map((p): AnalyseAEcran => {
    const e = enregistrees.get(p.numero);
    return {
      numero: p.numero,
      titre: p.titre,
      section: p.section,
      statut: statutDe(p, e),
      propose: p.texte,
      phrases: p.phrases,
      texteValide: e?.texte ?? null,
      explication: e?.explication ?? null,
      validePar: e?.validePar ?? null,
      valideLe: e ? e.valideLe.toISOString() : null,
      auRapport: texteAuRapport(p, e),
      sansComparaison: p.sansComparaison,
    };
  });
  return {
    portee: estArrondissement(profil) ? `l’arrondissement de ${profil.arrondissement}` : "le département",
    analyses,
  };
}

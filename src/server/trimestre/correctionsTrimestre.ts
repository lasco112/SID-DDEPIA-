/**
 * LES CORRECTIONS AU TRIMESTRE des cases calculées à partir du mensuel
 * (décision du Délégué, 21 octobre 2026).
 *
 * Quand le vrai chiffre manque au mensuel — une campagne de vaccination jamais
 * inscrite, des alevins non déclarés —, le chef de la section l'inscrit au
 * trimestre, SUR ORDRE DU DD, avec un motif et sa source (registre du poste…).
 * Le mensuel n'est pas modifié (on n'y touche pas) ; la correction est un
 * ajustement tracé.
 *
 * Elle s'applique AU MOMENT OÙ LE SID RASSEMBLE LES CHIFFRES (remplissage.ts,
 * `preparer`), et non dans la case affichée : ainsi tout ce qui en dépend suit
 * seul — le total du département, la colonne TOTAL de l'arrondissement,
 * l'écart sur un an, les autres tableaux qui lisent le même champ (le nombre
 * d'étangs des tableaux 61 et 63), le semestre et l'année, l'an passé de
 * l'année suivante.
 *
 *  - Au TRIMESTRE corrigé : la case vaut le chiffre corrigé.
 *  - Sur un SEMESTRE ou une ANNÉE : on ajoute ce que la correction a changé
 *    (chiffre corrigé − chiffre du mensuel au moment de la correction). Pour un
 *    effectif à date (stock), seule la correction du DERNIER trimestre compte.
 *
 * Si le mensuel change après coup, la correction reste, mais le SID le signale
 * (point à vérifier bloquant) : le chef la confirme ou l'annule.
 */
import type { PrismaClient } from "@prisma/client";
import { type Periode, trimestrielle, moisDeLaPeriode } from "../periodes/calendrier";
import { liaisonDe, evaluer, type Correspondance } from "./liaison";
import { liaisonEvenementDe, type CasesEvenement } from "./evenements";
import { regleDuChamp } from "./reglesChamps";
import { graphieCanevas } from "../../lib/arrondissements";

/**
 * Les tableaux qui se corrigent ainsi (décision du Délégué) : ceux qui viennent
 * des LISTES du mensuel — circulation, vaccinations, consultations,
 * déparasitages, castrations, lésions — et la pisciculture.
 */
export const TABLEAUX_CORRIGEABLES = new Set([27, 32, 109, 64, 65, 66, 67, 70, 61, 62, 63]);

export interface CorrectionLue {
  id: string;
  periodeId: string;
  numeroTableau: number;
  ligne: string;
  colonne: string;
  valeur: number;
  valeurMensuelle: number | null;
  motif: string;
  source: string;
  auteurId: string | null;
  updatedAt: Date;
  /** Le rang du trimestre corrigé (1 à 4) et son année. */
  annee: number;
  rang: number;
}

/** Où est l'arrondissement dans la case, et quelle est la catégorie. */
export function axeDe(numero: number): "lignes" | "colonnes" | null {
  return liaisonEvenementDe(numero)?.orientation ?? liaisonDe(numero)?.orientation ?? null;
}
export function territoireEtCategorie(numero: number, ligne: string, colonne: string) {
  const axe = axeDe(numero);
  if (!axe) return null;
  return axe === "lignes" ? { territoire: ligne, categorie: colonne } : { territoire: colonne, categorie: ligne };
}

/** Les trimestres d'une période (un trimestre : lui-même ; un semestre : deux ; une année : quatre). */
function trimestresDe(p: Periode): Periode[] {
  if (p.type === "TRIMESTRIEL") return [p];
  const rangs = Array.from(new Set(moisDeLaPeriode(p).map((m) => Math.ceil(m.mois / 3))));
  return rangs.map((r) => trimestrielle(p.annee, r));
}

/** Les corrections qui valent pour une période — d'un arrondissement seulement, pour son rapport. */
export async function lireCorrections(db: PrismaClient, periode: Periode, arrondissementNom?: string): Promise<CorrectionLue[]> {
  const trimestres = trimestresDe(periode);
  const periodes = await db.periodeReporting.findMany({
    where: { type: "TRIMESTRIEL", OR: trimestres.map((t) => ({ annee: t.annee, trimestre: t.rang })) },
    select: { id: true, annee: true, trimestre: true },
  });
  if (!periodes.length) return [];
  const lignes = await db.correctionTrimestre.findMany({ where: { periodeId: { in: periodes.map((p) => p.id) } } });
  return lignes
    .map((l) => {
      const p = periodes.find((x) => x.id === l.periodeId)!;
      return { ...l, annee: p.annee, rang: p.trimestre ?? 0 };
    })
    .filter((c) => {
      if (!arrondissementNom) return true;
      const tc = territoireEtCategorie(c.numeroTableau, c.ligne, c.colonne);
      return tc != null && graphieCanevas(tc.territoire) === graphieCanevas(arrondissementNom);
    });
}

type Valeurs = Map<string, Map<string | null, number | null>>;
/** Une case formule à plusieurs champs (poissons de table) : corrigée case par case. */
export type Surcharges = Map<Correspondance, Map<string, number>>;

const cle = (c: Pick<CorrectionLue, "numeroTableau" | "ligne" | "colonne">) => `${c.numeroTableau} | ${c.ligne} | ${c.colonne}`;

/**
 * Applique les corrections aux chiffres rassemblés. Rend, par case corrigée,
 * le chiffre que donnait le mensuel AVANT correction (pour l'écran et le
 * contrôle « le mensuel a changé »).
 */
export function appliquerCorrections(
  cibles: { valeurs: Valeurs; evenements: Map<number, CasesEvenement>; surcharges: Surcharges },
  corrections: CorrectionLue[],
  periode: Periode,
  codeParNom: Map<string, string>
): Map<string, number | null> {
  const bases = new Map<string, number | null>();
  const exact = periode.type === "TRIMESTRIEL";
  const dernier = Math.max(0, ...trimestresDe(periode).map((t) => t.rang));
  // La valeur que prend la case : le chiffre corrigé au trimestre, ou le
  // mensuel plus ce que la correction a changé sur une période plus longue.
  const cible = (c: CorrectionLue, base: number | null) => (exact ? c.valeur : (base ?? 0) + (c.valeur - (c.valeurMensuelle ?? 0)));
  // Un stock (effectif à date) ne s'additionne pas : sur un semestre, seul le dernier trimestre compte.
  const retenue = (c: CorrectionLue, champ: string | undefined) => exact || !champ || regleDuChamp(champ) !== "DERNIERE_VALEUR" || c.rang === dernier;

  for (const c of corrections) {
    const tc = territoireEtCategorie(c.numeroTableau, c.ligne, c.colonne);
    if (!tc) continue;
    const code = codeParNom.get(graphieCanevas(tc.territoire));
    if (!code) continue;

    // --- Un tableau des listes du mensuel : vaccinations, cliniques, circulation, lésions.
    if (liaisonEvenementDe(c.numeroTableau)) {
      let cases = cibles.evenements.get(c.numeroTableau);
      if (!cases) {
        cases = { nombres: new Map(), totaux: new Map(), textes: new Map() };
        cibles.evenements.set(c.numeroTableau, cases);
      }
      const parArr = cases.nombres.get(tc.categorie) ?? new Map<string | null, number>();
      cases.nombres.set(tc.categorie, parArr);
      const base = parArr.get(code) ?? null;
      if (exact) bases.set(cle(c), base);
      const v = cible(c, base);
      const delta = v - (base ?? 0);
      parArr.set(code, v);
      parArr.set(null, (parArr.get(null) ?? 0) + delta);
      cases.totaux.set(code, (cases.totaux.get(code) ?? 0) + delta);
      cases.totaux.set(null, (cases.totaux.get(null) ?? 0) + delta);
      continue;
    }

    // --- Un tableau lié à des champs du mensuel : la pisciculture.
    const corr = liaisonDe(c.numeroTableau)?.correspondances.find((x) => x.libelle === tc.categorie);
    if (!corr) continue;
    const lire = (champ: string) => cibles.valeurs.get(champ)?.get(code) ?? null;
    const ecrireChamp = (champ: string, v: number) => {
      const parArr = cibles.valeurs.get(champ) ?? new Map<string | null, number | null>();
      cibles.valeurs.set(champ, parArr);
      const avant = parArr.get(code) ?? null;
      parArr.set(code, v);
      parArr.set(null, (parArr.get(null) ?? 0) + (v - (avant ?? 0)));
    };

    if (corr.champ) {
      // Un champ simple : on corrige le CHAMP — tous les tableaux qui le lisent suivent.
      if (!retenue(c, corr.champ)) continue;
      const base = lire(corr.champ);
      if (exact) bases.set(cle(c), base);
      ecrireChamp(corr.champ, cible(c, base));
    } else if (corr.formule && corr.formule.champs.length === 1 && !corr.formule.calcul) {
      // Une conversion d'un seul champ (m² → ha) : on corrige le champ, converti en retour.
      const champ = corr.formule.champs[0];
      if (!retenue(c, champ)) continue;
      const f = corr.formule.facteur ?? 1;
      const baseChamp = lire(champ);
      const base = baseChamp == null ? null : baseChamp * f;
      if (exact) bases.set(cle(c), base);
      ecrireChamp(champ, cible(c, base) / f);
    } else if (corr.formule) {
      // Une somme de plusieurs champs (poissons de table) : la case elle-même.
      if (!retenue(c, corr.formule.champs[0])) continue;
      const base = evaluer(corr.formule, lire);
      if (exact) bases.set(cle(c), base);
      const parArr = cibles.surcharges.get(corr) ?? new Map<string, number>();
      cibles.surcharges.set(corr, parArr);
      parArr.set(code, cible(c, base));
    }
  }
  return bases;
}

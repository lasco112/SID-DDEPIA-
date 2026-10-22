/**
 * CORRIGER AU TRIMESTRE une case calculée à partir du mensuel (décision du
 * Délégué, 21 octobre 2026) — les règles :
 *
 *  - seul le CHEF DE LA SECTION du tableau corrige, et seulement pendant la
 *    RÉVISION ouverte par le DD (ordresCorrection.ts) ; il peut la demander ;
 *  - seulement les tableaux des listes du mensuel et la pisciculture
 *    (TABLEAUX_CORRIGEABLES), la case d'un arrondissement — jamais un total ;
 *  - seulement quand les TROIS rapports mensuels de l'arrondissement sont
 *    transmis : un chiffre qui peut encore changer ne se corrige pas ;
 *  - pas quand la section est validée : le chef annule sa validation d'abord ;
 *  - un motif et une source (registre du poste, fiche de campagne…) ;
 *  - l'ancien et le nouveau chiffre au journal ; le DD prévenu, l'arrondissement
 *    au bilan de la révision ; les analyses du tableau repassent « à revoir ».
 *
 * Aucune note dans le rapport imprimé (décision du Délégué) : la case porte le
 * chiffre corrigé, comme les autres. La trace est au journal et à l'écran.
 */
import type { PrismaClient } from "@prisma/client";
import { type Periode, libelleCourt, moisDeLaPeriode } from "../periodes/calendrier";
import { listerArrondissements, graphieCanevas } from "@/lib/arrondissements";
import { notifierEvenement } from "@/server/notifications/evenements";
import { TABLEAUX_CORRIGEABLES, territoireEtCategorie } from "./correctionsTrimestre";
import { estCaseCalculee, versNombre } from "./remplissage";
import { estTotal } from "./canevas/structure";
import { chefDuTableau, contextePour, grille, type CorrectionDeCase, type Profil } from "./saisieTrimestrielle";
import { CHEFS_SOUS_ORDRE, aOrdreDeCorrection, demandesEnCours } from "./ordresCorrection";
import { etatCircuit, codeSection } from "./circuit";
import { periodeTrimestrielle } from "./rubriques";
import { remettreAnalysesARevoir } from "./saisieCanevas";

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export interface InfoCorrection {
  /** La case se corrige ainsi (bon tableau, case d'un arrondissement, calculée). */
  corrigeable: boolean;
  /** Ce profil est le chef de la section du tableau. */
  estChef: boolean;
  aOrdre: boolean;
  /** Une demande d'ordre de ce chef attend la réponse du DD. */
  demandeEnCours: boolean;
  /** Pourquoi la correction n'est pas possible maintenant (rapport non transmis, section validée). */
  raison: string | null;
  peutCorriger: boolean;
  /** Le chiffre affiché aujourd'hui, et ce que donne le mensuel seul. */
  affiche: number | null;
  mensuel: number | null;
  /** Le chef qui corrige ce tableau, sa section, et l'état de l'ordre — pour le DD, qui le donne d'ici. */
  chef: string | null;
  section: string | null;
  ordreEnCours: boolean;
  demande: { motif: string; le: string } | null;
  /** Ce que l'ordre proposé au DD dira, prêt à envoyer. */
  motifPropose: string;
  existante: (CorrectionDeCase & { auteur: string | null }) | null;
}

/** Les trois rapports mensuels de l'arrondissement sont-ils transmis ? Sinon, le premier qui manque. */
async function moisNonTransmis(db: PrismaClient, periode: Periode, territoire: string): Promise<string | null> {
  const arr = (await listerArrondissements(db)).find((a) => a.nom === territoire || a.nomCanevas === graphieCanevas(territoire));
  if (!arr) return "arrondissement inconnu";
  for (const { annee, mois } of moisDeLaPeriode(periode)) {
    const p = await db.periodeReporting.findFirst({ where: { type: "MENSUEL", annee, mois }, select: { id: true } });
    const r = p ? await db.rapportArrondissement.findFirst({ where: { periodeId: p.id, arrondissementId: arr.id }, select: { statut: true } }) : null;
    if (!r || (r.statut !== "SOUMIS" && r.statut !== "CLOTURE")) return `${MOIS[mois - 1]} ${annee}`;
  }
  return null;
}

export async function infoCorrection(db: PrismaClient, periode: Periode, profil: Profil, numero: number, ligne: string, colonne: string): Promise<InfoCorrection> {
  const ctx = await contextePour(db, periode, profil);
  const tc = territoireEtCategorie(numero, ligne, colonne);
  const corrigeable = Boolean(
    TABLEAUX_CORRIGEABLES.has(numero) &&
      tc &&
      ctx.arrondissements.includes(tc.territoire) &&
      !estTotal(tc.categorie) &&
      !/^ÉCART/i.test(tc.categorie) &&
      estCaseCalculee(numero, ligne, colonne, ctx)
  );
  const chef = chefDuTableau(numero);
  const estChef = CHEFS_SOUS_ORDRE.includes(profil.role) && chef === profil.role;
  const ordreEnCours = chef ? await aOrdreDeCorrection(db, periode, chef) : false;
  const aOrdre = estChef && ordreEnCours;
  const demandes = await demandesEnCours(db, periode);
  const d = chef ? demandes.get(chef) : undefined;
  const demandeEnCours = estChef && !aOrdre && Boolean(d);

  const g = corrigeable ? await grille(db, periode, profil, numero) : null;
  const c = g?.lignes.find((l) => l.cle === ligne)?.cases.find((x) => x.colonne === colonne);
  const affiche = versNombre(c?.affiche ?? null);
  const existante = c?.corrigee ?? null;
  const auteur = existante?.auteurId
    ? await db.user.findUnique({ where: { id: existante.auteurId }, select: { nom: true, username: true } }).then((u) => u?.nom?.trim() || u?.username || null)
    : null;

  let raison: string | null = null;
  if (corrigeable && estChef) {
    const manque = await moisNonTransmis(db, periode, tc!.territoire);
    if (manque) {
      raison = `Le rapport mensuel de ${manque} de ${tc!.territoire} n'est pas encore transmis : ses chiffres compteront dès sa transmission. On ne corrige pas un chiffre qui peut encore changer.`;
    } else {
      const etat = await etatCircuit(db, periode);
      if (etat.sections.find((s) => s.code === codeSection(profil.role))?.statut === "VALIDE") {
        raison = "Votre section est validée : annulez votre validation (écran « Valider ma section ») pour corriger, puis validez à nouveau.";
      }
    }
  }
  return {
    corrigeable,
    estChef,
    aOrdre,
    demandeEnCours,
    raison,
    peutCorriger: corrigeable && estChef && aOrdre && !raison,
    affiche,
    mensuel: existante ? existante.mensuelActuel : affiche,
    existante: existante ? { ...existante, auteur } : null,
    chef,
    section: chef ? codeSection(chef) : null,
    ordreEnCours,
    demande: d ? { motif: d.motif, le: d.le } : null,
    motifPropose: tc ? `Corriger le tableau n° ${numero} — ${tc.territoire}, « ${tc.categorie} » (chiffre absent ou faux au mensuel).` : `Corriger le tableau n° ${numero}.`,
  };
}

export class RefusCorrection extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Enregistre (ou confirme) la correction d'une case. */
export async function corrigerCase(
  db: PrismaClient,
  periode: Periode,
  profil: Profil,
  auteurId: string,
  demande: { numero: number; ligne: string; colonne: string; valeur: unknown; motif: unknown; source: unknown }
) {
  const info = await infoCorrection(db, periode, profil, demande.numero, demande.ligne, demande.colonne);
  if (!info.corrigeable) throw new RefusCorrection("Cette case ne se corrige pas au trimestre.", 400);
  if (!info.estChef) throw new RefusCorrection("Seul le chef de la section corrige ce tableau, pendant la révision ouverte par le Délégué départemental.", 403);
  if (!info.aOrdre) throw new RefusCorrection("La correction directe de votre section n'est pas ouverte : demandez-la au DD.", 403);
  if (info.raison) throw new RefusCorrection(info.raison, 409);

  const brut = String(demande.valeur ?? "").replace(/[\s  ]/g, "").replace(",", ".");
  const valeur = brut === "" ? NaN : Number(brut);
  if (!Number.isFinite(valeur) || valeur < 0) throw new RefusCorrection("Inscrivez un nombre (0 si l'activité était nulle).", 400);
  const motif = typeof demande.motif === "string" ? demande.motif.trim() : "";
  if (motif.length < 5) throw new RefusCorrection("Indiquez le motif : pourquoi ce chiffre change.", 400);
  const source = typeof demande.source === "string" ? demande.source.trim() : "";
  if (source.length < 3) throw new RefusCorrection("Indiquez d'où vient le vrai chiffre (registre du poste, fiche de campagne…).", 400);

  const periodeId = await periodeTrimestrielle(db, periode);
  const cellule = { numeroTableau: demande.numero, ligne: demande.ligne, colonne: demande.colonne };
  await db.correctionTrimestre.upsert({
    where: { periodeId_numeroTableau_ligne_colonne: { periodeId, numeroTableau: cellule.numeroTableau, ligne: cellule.ligne, colonne: cellule.colonne } },
    create: { periodeId, ...cellule, valeur, valeurMensuelle: info.mensuel, motif: motif.slice(0, 1000), source: source.slice(0, 200), auteurId },
    update: { valeur, valeurMensuelle: info.mensuel, motif: motif.slice(0, 1000), source: source.slice(0, 200), auteurId },
  });
  await apresChangement(db, periode, periodeId, cellule, auteurId, profil, {
    action: info.existante ? "CORRECTION_CASE_TRIMESTRE_MODIFIEE" : "CORRECTION_CASE_TRIMESTRE",
    ancien: info.affiche,
    nouveau: valeur,
    mensuel: info.mensuel,
    motif,
    source,
  });
  return { ancien: info.affiche, nouveau: valeur };
}

/** Annule une correction : la case reprend le chiffre du mensuel. */
export async function annulerCorrectionCase(
  db: PrismaClient,
  periode: Periode,
  profil: Profil,
  auteurId: string,
  demande: { numero: number; ligne: string; colonne: string; motif: unknown }
) {
  const info = await infoCorrection(db, periode, profil, demande.numero, demande.ligne, demande.colonne);
  if (!info.existante) throw new RefusCorrection("Cette case n'est pas corrigée.", 404);
  if (!info.estChef) throw new RefusCorrection("Seul le chef de la section annule une correction, pendant la révision ouverte par le Délégué départemental.", 403);
  if (!info.aOrdre) throw new RefusCorrection("La correction directe de votre section n'est pas ouverte : demandez-la au DD.", 403);
  const motif = typeof demande.motif === "string" ? demande.motif.trim() : "";
  if (motif.length < 5) throw new RefusCorrection("Indiquez le motif de l'annulation.", 400);
  const periodeId = await periodeTrimestrielle(db, periode);
  const cellule = { numeroTableau: demande.numero, ligne: demande.ligne, colonne: demande.colonne };
  await db.correctionTrimestre.deleteMany({ where: { periodeId, ...cellule } });
  await apresChangement(db, periode, periodeId, cellule, auteurId, profil, {
    action: "CORRECTION_CASE_TRIMESTRE_ANNULEE",
    ancien: info.existante.valeur,
    nouveau: info.existante.mensuelActuel,
    mensuel: info.existante.mensuelActuel,
    motif,
    source: null,
  });
}

/** Le journal, les analyses à revoir, et les personnes à prévenir. */
async function apresChangement(
  db: PrismaClient,
  periode: Periode,
  periodeId: string,
  cellule: { numeroTableau: number; ligne: string; colonne: string },
  auteurId: string,
  profil: Profil,
  t: { action: string; ancien: number | null; nouveau: number | null; mensuel: number | null; motif: string; source: string | null }
) {
  const tc = territoireEtCategorie(cellule.numeroTableau, cellule.ligne, cellule.colonne)!;
  await remettreAnalysesARevoir(db, periodeId, cellule, "");
  await db.auditLog.create({
    data: {
      userId: auteurId,
      action: t.action,
      entite: "CorrectionTrimestre",
      entiteId: `${cellule.numeroTableau} | ${cellule.ligne} | ${cellule.colonne}`,
      details: {
        ...cellule, annee: periode.annee, trimestre: periode.rang, arrondissement: tc.territoire,
        ancien: t.ancien, nouveau: t.nouveau, mensuel: t.mensuel, motif: t.motif, source: t.source, chef: profil.role,
      },
    },
  });
  const nf = (n: number | null) => (n == null ? "vide" : n.toLocaleString("fr-FR"));
  const quoi = t.action === "CORRECTION_CASE_TRIMESTRE_ANNULEE" ? "Correction annulée" : "Chiffre corrigé au trimestre";
  const message =
    `${quoi} (${libelleCourt(periode)}) — tableau n° ${cellule.numeroTableau}, ${tc.territoire}, « ${tc.categorie} » : ${nf(t.ancien)} → ${nf(t.nouveau)}. ` +
    `Motif : ${t.motif}${t.source ? ` (source : ${t.source})` : ""}`;
  // Le DD suit la révision au fil de l'eau ; l'arrondissement reçoit le bilan à
  // la fermeture de la révision (ordresCorrection.ts), pas une alerte par case.
  await notifierEvenement(db, { roles: ["DD"], saufUserId: auteurId }, { declencheur: t.action, message, lien: "/trimestre/saisie" });
}

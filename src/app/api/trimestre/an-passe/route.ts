/**
 * POST /api/trimestre/an-passe — corriger un chiffre de l'an passé déjà
 * inscrit, même après la transmission du rapport ou la validation du domaine
 * (décision du Délégué, 15 octobre 2026).
 *
 *   { annee, trimestre, numeroTableau, ligne, colonne, valeur, motif }
 *
 * Se corrigent ainsi : la case « TOTAL {P-1} » de la reprise d'historique, et
 * les cases d'un trimestre d'une année passée (voir refusCorrectionAnPasse). Le rapport n'est pas rouvert : le motif est
 * obligatoire, l'ancien et le nouveau chiffre vont au journal, le DD est
 * prévenu — et l'arrondissement aussi quand un autre que lui a corrigé.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle, libelleCourt, memePeriodeAnneePrecedente } from "@/server/periodes/calendrier";
import { periodeTrimestrielle } from "@/server/trimestre/rubriques";
import { ecrireSaisieCanevas, cleCellule } from "@/server/trimestre/saisieCanevas";
import {
  ROLES_CORRECTION_AN_PASSE, refusCorrectionAnPasse, anneeCourante, nomArrondissement, porteeDeSaisie, tableauDe, type Profil,
  attendUnNombre, incoherenceCategories,
} from "@/server/trimestre/saisieTrimestrielle";
import { axeTerritorial } from "@/server/trimestre/canevas/structure";
import { listerArrondissements } from "@/lib/arrondissements";
import { notifierEvenement } from "@/server/notifications/evenements";

const erreur = (message: string, status: number) => NextResponse.json({ message }, { status });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES_CORRECTION_AN_PASSE]);
    const body = (await req.json()) as {
      annee?: number; trimestre?: number; numeroTableau?: number; ligne?: string; colonne?: string;
      valeur?: string | number | null; motif?: string;
    };
    const a = Number(body.annee);
    const t = Number(body.trimestre);
    if (!Number.isInteger(a) || a < 2000 || a > 2100 || ![1, 2, 3, 4].includes(t)) return erreur("Période demandée invalide.", 400);
    const periode = trimestrielle(a, t);
    if (!body.numeroTableau || body.ligne == null || !body.colonne) return erreur("Case non précisée.", 400);

    const motif = (body.motif ?? "").trim();
    if (motif.length < 5) return erreur("Indiquez le motif de la correction : pourquoi ce chiffre change.", 400);
    const brut = String(body.valeur ?? "").replace(/[\s  ]/g, "").replace(",", ".");
    const valeur = brut === "" ? NaN : Number(brut);
    if (!Number.isFinite(valeur) || valeur < 0) return erreur("Inscrivez un nombre (0 si l'activité était nulle).", 400);

    const profil: Profil = { role: user.role, arrondissement: await nomArrondissement(user.db, user.arrondissementId) };
    if (user.role === "DA" && !profil.arrondissement) return erreur("Votre compte n'est rattaché à aucun arrondissement.", 400);

    const refus = await refusCorrectionAnPasse(user.db, periode, profil, body.numeroTableau, body.ligne, body.colonne);
    if (refus) return erreur(refus, 403);
    if (!attendUnNombre(body.colonne)) return erreur("Cette case porte du texte : elle ne se corrige pas par un chiffre.", 400);

    // Les mêmes contrôles qu'à la saisie (20 octobre 2026) : une correction ne
    // doit laisser aucune erreur — la somme des catégories doit retomber sur le
    // total des rapports mensuels.
    const incoherence = await incoherenceCategories(user.db, periode, profil, body.numeroTableau, body.ligne, body.colonne, valeur);
    if (incoherence) return NextResponse.json({ message: incoherence.message, controle: incoherence.controle }, { status: 409 });

    const periodeId = await periodeTrimestrielle(user.db, periode);
    const cellule = { numeroTableau: body.numeroTableau, ligne: body.ligne, colonne: body.colonne };
    const portee = await porteeDeSaisie(user.db, profil, body.numeroTableau);
    const avant = await user.db.saisieCanevas.findFirst({
      where: { periodeId, numeroTableau: cellule.numeroTableau, ligne: cellule.ligne, colonne: cellule.colonne, portee },
      select: { valeur: true },
    });
    const ancien = avant?.valeur == null ? null : Number(avant.valeur);

    // Pas de verrou du circuit ici : c'est tout l'objet de cette correction.
    await ecrireSaisieCanevas(user.db, user.transaction, periodeId, cellule, { valeur }, user.id, portee);

    const n1 = libelleCourt(memePeriodeAnneePrecedente(periode));
    // Le territoire de la case : sa ligne ou sa colonne.
    const bloc = tableauDe(body.numeroTableau)!.bloc;
    const territoire = axeTerritorial(bloc) === "colonnes" ? body.colonne : body.ligne;
    await user.db.auditLog.create({
      data: {
        userId: user.id,
        action: "CORRECTION_AN_PASSE",
        entite: "SaisieCanevas",
        entiteId: cleCellule(cellule),
        details: { ...cellule, annee: periode.annee, trimestre: periode.rang, periodeN1: n1, ancien, nouveau: valeur, motif, arrondissement: territoire },
      },
    });

    const nf = (n: number | null) => (n == null ? "vide" : n.toLocaleString("fr-FR"));
    const quoi = periode.annee < anneeCourante() ? `Chiffre du ${libelleCourt(periode)} corrigé` : `Chiffre de l'an passé corrigé (${n1})`;
    const message =
      `${quoi} — tableau n° ${body.numeroTableau}, ${territoire}, « ${body.colonne} » : ` +
      `${nf(ancien)} → ${nf(valeur)}. Motif : ${motif}`;
    await notifierEvenement(user.db, { roles: ["DD"], saufUserId: user.id }, { declencheur: "CORRECTION_AN_PASSE", message, lien: "/trimestre/saisie" });
    if (user.role !== "DA") {
      const arr = (await listerArrondissements(user.db)).find((x) => x.nom === territoire);
      if (arr) {
        await notifierEvenement(user.db, { arrondissementId: arr.id, saufUserId: user.id }, { declencheur: "CORRECTION_AN_PASSE", message, lien: "/trimestre/saisie" });
      }
    }

    return NextResponse.json({ enregistre: true, ancien, nouveau: valeur });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

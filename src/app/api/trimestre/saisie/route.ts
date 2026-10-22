/**
 * Saisie trimestrielle des tableaux du canevas (décision D9 du Délégué).
 *
 *   GET  /api/trimestre/saisie?annee=&trimestre=            → les tableaux à saisir
 *   GET  /api/trimestre/saisie?annee=&trimestre=&tableau=N  → la grille d'un tableau
 *   GET  /api/trimestre/saisie?annee=&trimestre=&toutes=1   → toutes les grilles (gardées par le téléphone pour le hors-ligne)
 *   PUT  /api/trimestre/saisie                              → une case
 *
 * Délégué départemental, chef BAC, Délégué d'arrondissement et agent de
 * saisie. Les DROITS sont vérifiés case par case (saisieTrimestrielle.ts) : un
 * DA ne saisit que dans la maille de son arrondissement, et personne ne saisit
 * une case calculée à partir du mensuel ni un total.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle, libelleOfficiel } from "@/server/periodes/calendrier";
import { periodeTrimestrielle } from "@/server/trimestre/rubriques";
import { ecrireSaisieCanevas, cleCellule, dateAppareil } from "@/server/trimestre/saisieCanevas";
import {
  ROLES_SAISIE, resumer, grille, grilles, refusDeSaisie, origineCase, nomArrondissement, attendUnNombre, incoherenceCategories, porteeDeSaisie,
  versionDuChef, tableauDe, territoireDeCase, contextePour, estChefTechnique, pointsARevoir, type Profil,
} from "@/server/trimestre/saisieTrimestrielle";
import { ordresEnCours } from "@/server/trimestre/ordresCorrection";
import { liaisonEvenementDe } from "@/server/trimestre/evenements";
import { listerArrondissements } from "@/lib/arrondissements";
import { preparerEvenements } from "@/server/trimestre/evenements";
import { TABLEAUX_CORRIGEABLES } from "@/server/trimestre/correctionsTrimestre";
import { infoCorrection } from "@/server/trimestre/corrigerCase";
import { motifDeVerrou } from "@/server/trimestre/circuit";

function periodeDe(annee: unknown, trimestre: unknown) {
  const a = Number(annee);
  const t = Number(trimestre);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return null;
  if (![1, 2, 3, 4].includes(t)) return null;
  return trimestrielle(a, t);
}

/** Le profil de saisie, ou null pour un DA ou un agent sans arrondissement. */
async function profilDe(user: Awaited<ReturnType<typeof requireUser>>): Promise<Profil | null> {
  const profil: Profil = { role: user.role, arrondissement: await nomArrondissement(user.db, user.arrondissementId) };
  if ((user.role === "DA" || user.role === "AGENT_SAISIE") && !profil.arrondissement) return null;
  return profil;
}

const sansArrondissement = () =>
  NextResponse.json(
  { message: "Votre compte n'est rattaché à aucun arrondissement : demandez au Délégué départemental de le corriger." },
  { status: 400 }
);

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES_SAISIE]);
    const params = new URL(req.url).searchParams;
    const periode = periodeDe(params.get("annee"), params.get("trimestre"));
    if (!periode) return NextResponse.json({ message: "Période demandée invalide." }, { status: 400 });
    const profil = await profilDe(user);
    if (!profil) return sansArrondissement();

    // Toutes les grilles d'un coup : le téléphone les garde pour saisir sans réseau.
    if (params.get("toutes")) {
      return NextResponse.json({ periode: libelleOfficiel(periode), grilles: await grilles(user.db, periode, profil) });
    }

    // « À revoir » : ce que le SID a repéré dans les tableaux de la section (22 octobre 2026).
    if (params.get("revue")) {
      if (user.role !== "DD" && !user.role.startsWith("CHEF_")) return NextResponse.json({ message: "Réservé aux chefs de section et au DD." }, { status: 403 });
      const ordre = (await ordresEnCours(user.db, periode)).get(user.role) ?? null;
      return NextResponse.json({
        periode: libelleOfficiel(periode),
        points: await pointsARevoir(user.db, periode, profil),
        mode: user.role === "CHEF_BAC" || user.role === "DD" ? "correction" : ordre?.mode ?? null,
      });
    }

    // « D'où vient ce chiffre ? » : une case grise, mois par mois (lecture seule).
    if (params.get("origine") && params.get("tableau")) {
      const numero = Number(params.get("tableau"));
      const [ligne, colonne] = [params.get("ligne") ?? "", params.get("colonne") ?? ""];
      const r = await origineCase(user.db, periode, profil, numero, ligne, colonne);
      // Ce qu'on peut faire de cette case au trimestre (correction du chef, sur ordre du DD).
      const correction = TABLEAUX_CORRIGEABLES.has(numero) ? await infoCorrection(user.db, periode, profil, numero, ligne, colonne) : null;
      // D'où elle vient, pour y mener directement (22 octobre 2026) : les
      // tableaux mensuels d'origine, et le code de l'arrondissement.
      if ("origine" in r && r.origine) {
        const arr = (await listerArrondissements(user.db)).find((a) => a.nom === r.origine.arrondissement);
        const codes = liaisonEvenementDe(numero)?.sources ?? (r.origine.mensuel ? [r.origine.mensuel.code] : []);
        const sources = codes.length
          ? await user.db.formTemplate.findMany({ where: { code: { in: codes } }, select: { code: true, numero: true, titre: true }, orderBy: { code: "asc" } })
          : [];
        return NextResponse.json({ origine: { ...r.origine, arrondissementCode: arr?.code ?? null, sources }, correction });
      }
      return NextResponse.json({ ...r, correction });
    }

    const numero = params.get("tableau");
    if (numero) {
      // Un chef de section : la liste d'un arrondissement qu'il complète (21 octobre 2026).
      const g = await grille(user.db, periode, profil, Number(numero), params.get("version"));
      if (!g) return NextResponse.json({ message: "Tableau inconnu." }, { status: 404 });
      return NextResponse.json({ periode: libelleOfficiel(periode), grille: g });
    }

    // Les lignes du mensuel que le SID n'a pas su ranger : le DD décide.
    const nonClassees =
      user.role === "DD" ? (await preparerEvenements(user.db, periode)).nonClassees : [];

    return NextResponse.json({
      periode: libelleOfficiel(periode),
      arrondissement: profil.arrondissement ?? null,
      tableaux: await resumer(user.db, periode, profil),
      nonClassees,
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES_SAISIE]);
    const body = (await req.json()) as {
      annee?: number;
      trimestre?: number;
      numeroTableau?: number;
      ligne?: string;
      colonne?: string;
      valeur?: string | number | null;
      /** Saisie faite hors ligne : quand, sur l'appareil. */
      modifieLe?: string;
      /** Un chef de section : la liste de cet arrondissement, qu'il complète (21 octobre 2026). */
      version?: string | null;
      /** Le chef en correction directe : pourquoi ce chiffre change (facultatif, au journal). */
      motif?: string;
    };
    const periode = periodeDe(body.annee, body.trimestre);
    if (!periode) return NextResponse.json({ message: "Période demandée invalide." }, { status: 400 });
    if (!body.numeroTableau || body.ligne == null || !body.colonne) {
      return NextResponse.json({ message: "Case non précisée." }, { status: 400 });
    }
    const profil = await profilDe(user);
    if (!profil) return sansArrondissement();

    // La liste d'un arrondissement, révisée par le chef de la section : seulement
    // dans un tableau en liste de sa section, et pendant la révision (refusDeSaisie).
    const versionArr = body.version ? await versionDuChef(user.db, profil, body.numeroTableau, body.version) : null;
    if (body.version && !versionArr) {
      return NextResponse.json({ message: "Seul le chef de la section révise la liste d'un arrondissement, dans un tableau en liste de sa section." }, { status: 403 });
    }
    const refus = await refusDeSaisie(user.db, periode, profil, body.numeroTableau, body.ligne, body.colonne, versionArr?.id ?? "");
    if (refus) return NextResponse.json({ message: refus }, { status: 403 });
    // Le circuit : un rapport transmis, un domaine validé, ne se modifient plus.
    const verrou = await motifDeVerrou(user.db, periode, { role: user.role, arrondissementId: user.arrondissementId });
    if (verrou) return NextResponse.json({ message: verrou }, { status: 409 });

    const cellule = { numeroTableau: body.numeroTableau, ligne: body.ligne, colonne: body.colonne };

    // Une case vide EFFACE. Un texte non numérique est conservé tel quel : le
    // canevas porte des cases de texte — provenance, activités, noms.
    const brut = typeof body.valeur === "string" ? body.valeur.trim() : body.valeur;
    const nombre =
      brut === "" || brut == null ? null : Number(String(brut).replace(/[\s ]/g, "").replace(",", "."));
    const estNombre = nombre != null && Number.isFinite(nombre);

    // Un effectif, un montant, une quantité : des chiffres, jamais des lettres.
    if (attendUnNombre(body.colonne) && brut !== "" && brut != null && !estNombre) {
      return NextResponse.json(
        { message: `« ${body.colonne} » attend un nombre : « ${brut} » n'en est pas un. Chiffres uniquement, virgule pour les décimales.` },
        { status: 400 }
      );
    }

    // La somme des catégories doit retomber sur le total des rapports mensuels.
    const incoherence = await incoherenceCategories(
      user.db, periode, profil, body.numeroTableau, body.ligne, body.colonne, estNombre ? nombre : null
    );
    // Le détail accompagne le refus : l'agent voit mois par mois d'où vient le
    // total, et peut ouvrir le rapport mensuel concerné pour comparer.
    if (incoherence) return NextResponse.json({ message: incoherence.message, controle: incoherence.controle }, { status: 409 });

    const periodeId = await periodeTrimestrielle(user.db, periode);
    // Un DA qui remplit le budget-programme remplit le SIEN ; un chef qui
    // révise la liste d'un arrondissement écrit dans CELLE-CI.
    const portee = versionArr?.id ?? (await porteeDeSaisie(user.db, profil, body.numeroTableau));
    // Le chiffre d'avant, pour le journal de la révision : ce que le chef a changé.
    const precedente = estChefTechnique(profil.role)
      ? await user.db.saisieCanevas.findFirst({ where: { periodeId, ...cellule, portee }, select: { valeur: true, valeurTexte: true } })
      : null;
    const anciens = precedente ? precedente.valeurTexte ?? (precedente.valeur == null ? null : String(precedente.valeur)) : null;
    const { enregistre, ignoree } = await ecrireSaisieCanevas(
      user.db,
      user.transaction,
      periodeId,
      cellule,
      estNombre ? { valeur: nombre } : { texte: brut == null ? null : String(brut) },
      user.id,
      portee,
      body.modifieLe ? dateAppareil(body.modifieLe) : undefined
    );
    // Une vieille saisie hors ligne, dépassée par une correction faite depuis :
    // conservée côté serveur, et dite à l'appareil — qui cesse de la renvoyer.
    if (ignoree) return NextResponse.json({ enregistre: false, ignoree: true });

    // Le chef en révision : l'arrondissement touché est noté, pour le bilan que
    // son DA recevra à la fermeture de la révision (ordresCorrection.ts).
    const t = tableauDe(body.numeroTableau);
    const arrondissement =
      estChefTechnique(profil.role) && t
        ? territoireDeCase(t.bloc, await contextePour(user.db, periode, profil), body.ligne, body.colonne, versionArr?.nom ?? null)
        : null;
    await user.db.auditLog.create({
      data: {
        userId: user.id,
        action: enregistre ? "SAISIE_TRIMESTRIELLE" : "EFFACEMENT_SAISIE_TRIMESTRIELLE",
        entite: "SaisieCanevas",
        entiteId: cleCellule(cellule),
        details: {
          ...cellule,
          annee: periode.annee,
          trimestre: periode.rang,
          ...(versionArr ? { liste: versionArr.nom } : {}),
          ...(arrondissement ? { arrondissement, ancien: anciens ?? null, nouveau: brut == null || brut === "" ? null : String(brut) } : {}),
          ...(body.motif?.trim() ? { motif: body.motif.trim().slice(0, 500) } : {}),
        },
      },
    });

    return NextResponse.json({ enregistre });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

/**
 * Saisie trimestrielle des tableaux du canevas (décision D9 du Délégué).
 *
 *   GET  /api/trimestre/saisie?annee=&trimestre=            → les tableaux à saisir
 *   GET  /api/trimestre/saisie?annee=&trimestre=&tableau=N  → la grille d'un tableau
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
import { ecrireSaisieCanevas, cleCellule } from "@/server/trimestre/saisieCanevas";
import {
  ROLES_SAISIE, resumer, grille, refusDeSaisie, nomArrondissement, attendUnNombre, incoherenceCategories, porteeDeSaisie,
  type Profil,
} from "@/server/trimestre/saisieTrimestrielle";
import { preparerEvenements } from "@/server/trimestre/evenements";

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

    const numero = params.get("tableau");
    if (numero) {
      const g = await grille(user.db, periode, profil, Number(numero));
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
    };
    const periode = periodeDe(body.annee, body.trimestre);
    if (!periode) return NextResponse.json({ message: "Période demandée invalide." }, { status: 400 });
    if (!body.numeroTableau || body.ligne == null || !body.colonne) {
      return NextResponse.json({ message: "Case non précisée." }, { status: 400 });
    }
    const profil = await profilDe(user);
    if (!profil) return sansArrondissement();

    const refus = await refusDeSaisie(user.db, periode, profil, body.numeroTableau, body.ligne, body.colonne);
    if (refus) return NextResponse.json({ message: refus }, { status: 403 });

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
    if (incoherence) return NextResponse.json({ message: incoherence }, { status: 409 });

    const periodeId = await periodeTrimestrielle(user.db, periode);
    const { enregistre } = await ecrireSaisieCanevas(
      user.db,
      user.transaction,
      periodeId,
      cellule,
      estNombre ? { valeur: nombre } : { texte: brut == null ? null : String(brut) },
      user.id,
      // Un DA qui remplit le budget-programme remplit le SIEN.
      await porteeDeSaisie(user.db, profil, body.numeroTableau)
    );

    await user.db.auditLog.create({
      data: {
        userId: user.id,
        action: enregistre ? "SAISIE_TRIMESTRIELLE" : "EFFACEMENT_SAISIE_TRIMESTRIELLE",
        entite: "SaisieCanevas",
        entiteId: cleCellule(cellule),
        details: { ...cellule, annee: periode.annee, trimestre: periode.rang },
      },
    });

    return NextResponse.json({ enregistre });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

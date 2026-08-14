/**
 * Les zones de texte analytiques du rapport trimestriel.
 *
 * Le canevas en compte 47. Cinq seulement ont un texte fixe qui ne change pas
 * d'une période à l'autre ; les autres doivent être écrites à chaque trimestre.
 * Sans cette route, elles sortaient toutes en consigne grise, et le rédacteur
 * les retapait dans Word après téléchargement — hors du système, sans trace ni
 * reprise possible.
 *
 *   GET ?annee=2026&trimestre=3   les zones, avec ce qui est déjà écrit
 *   PUT { annee, trimestre, cle, contenu }   enregistre une zone
 *
 * Chacun n'écrit que pour lui : le DD les zones du département, le DA les
 * siennes. Le périmètre est lu sur la session, jamais reçu du client — sans
 * quoi il suffirait d'un paramètre pour écrire sous la signature d'un autre.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle, libelleOfficiel } from "@/server/periodes/calendrier";
import { zonesTexte } from "@/server/trimestre/rapportCanevas";
import { lireRubriques, ecrireRubrique } from "@/server/trimestre/rubriques";
import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions";

/** Pour qui écrit-on : le département (null) ou un arrondissement précis ? */
function perimetre(user: SessionUser): { arrondissementId: string | null } {
  if (user.role === "DA") {
    if (!user.arrondissementId) throw new Error("Compte sans arrondissement assigné.");
    return { arrondissementId: user.arrondissementId };
  }
  return { arrondissementId: null };
}

/** Lit et valide la période demandée. */
function periodeDe(annee: unknown, trimestre: unknown) {
  const a = Number(annee);
  const t = Number(trimestre);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return null;
  if (!Number.isInteger(t) || t < 1 || t > 4) return null;
  return trimestrielle(a, t);
}

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD", "DA"]);
    const db = user.db as PrismaClient;
    const { arrondissementId } = perimetre(user);

    const url = new URL(req.url);
    // `Number(null)` vaut 0 : on vérifie la présence des paramètres avant de
    // convertir, sinon une requête sans période passe pour l'an 0.
    const anneeBrute = url.searchParams.get("annee");
    const trimestreBrut = url.searchParams.get("trimestre");
    if (!anneeBrute || !trimestreBrut) {
      return NextResponse.json({ message: "Période non précisée." }, { status: 400 });
    }
    const p = periodeDe(anneeBrute, trimestreBrut);
    if (!p) return NextResponse.json({ message: "Période demandée invalide." }, { status: 400 });

    const ecrits = await lireRubriques(db, p, arrondissementId);
    const zones = zonesTexte({ arrondissement: user.role === "DA" }).map((z) => ({
      ...z,
      contenu: ecrits.get(z.cle) ?? "",
    }));

    return NextResponse.json({
      periode: { annee: p.annee, trimestre: Number(trimestreBrut), libelle: libelleOfficiel(p) },
      pour: arrondissementId ? "arrondissement" : "departement",
      zones,
      redigees: zones.filter((z) => z.contenu.trim()).length,
      total: zones.length,
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD", "DA"]);
    const db = user.db as PrismaClient;
    const { arrondissementId } = perimetre(user);

    const { annee, trimestre, cle, contenu } = (await req.json()) as {
      annee?: number; trimestre?: number; cle?: string; contenu?: string;
    };
    const p = periodeDe(annee, trimestre);
    if (!p) return NextResponse.json({ message: "Période demandée invalide." }, { status: 400 });
    if (!cle) return NextResponse.json({ message: "Zone non précisée." }, { status: 400 });

    // La clé doit être une zone RÉELLE du canevas. Sans ce contrôle, n'importe
    // quelle chaîne créerait une rubrique fantôme, invisible à l'écran et
    // jamais reprise dans le document.
    const connue = zonesTexte({ arrondissement: user.role === "DA" }).some((z) => z.cle === cle);
    if (!connue) {
      return NextResponse.json({ message: `Zone inconnue du canevas : « ${cle} ».` }, { status: 400 });
    }

    const { enregistre } = await ecrireRubrique(db, p, arrondissementId, cle, contenu ?? "", user.id);

    /*
     * Trace, sans exiger de motif. La règle « jamais de correction silencieuse »
     * vise les DONNÉES saisies, dont on doit pouvoir justifier chaque
     * changement de valeur. Une zone de texte se rédige et se reprend : exiger
     * un motif à chaque enregistrement d'un brouillon rendrait la rédaction
     * impraticable. C'est déjà le parti retenu pour les synthèses mensuelles
     * (`SyntheseSection`), qui ne portent qu'un auteur et une date.
     */
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: enregistre ? "REDACTION_RUBRIQUE_TRIMESTRIELLE" : "EFFACEMENT_RUBRIQUE_TRIMESTRIELLE",
        entite: "RubriqueNarrative",
        entiteId: `${p.annee}-T${trimestre}-${cle}`,
        details: {
          periode: libelleOfficiel(p),
          cle,
          pour: arrondissementId ? "arrondissement" : "departement",
          caracteres: (contenu ?? "").trim().length,
        },
      },
    });

    return NextResponse.json({ enregistre });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

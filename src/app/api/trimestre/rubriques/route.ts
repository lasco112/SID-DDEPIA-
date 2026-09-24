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
 * Qui rédige (décision du Délégué, 24 septembre 2026) : dans un
 * arrondissement, l'agent de saisie rédige et le DA relit — il corrige s'il le
 * veut ; au département, chaque chef de section rédige les zones de son
 * domaine et le DD relit. Le périmètre est lu sur la session, jamais reçu du
 * client — sans quoi il suffirait d'un paramètre pour écrire sous la
 * signature d'un autre.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle, libelleOfficiel, periodePrecedente } from "@/server/periodes/calendrier";
import { TEXTES_FIXES, TEXTES_COMMUNS } from "@/server/trimestre/canevas/textesFixes";
import { chefDeSection } from "@/server/trimestre/canevas/sections";
import { textesCalculesPour } from "@/server/trimestre/analyse/ecranAnalyses";
import { TEXTES_ARRONDISSEMENTS } from "@/server/trimestre/canevas/textesArrondissements";
import { resoudre } from "@/server/trimestre/canevas/types";
import { contextePour, nomArrondissement } from "@/server/trimestre/saisieTrimestrielle";
import { zonesTexte } from "@/server/trimestre/rapportCanevas";
import { lireRubriques, ecrireRubrique } from "@/server/trimestre/rubriques";
import type { PrismaClient } from "@prisma/client";
import type { SessionUser } from "@/lib/permissions";

const ROLES_REDACTION = ["DD", "DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"] as const;
const estArrondissement = (user: SessionUser) => user.role === "DA" || user.role === "AGENT_SAISIE";

/** Pour qui écrit-on : le département (null) ou un arrondissement précis ? */
function perimetre(user: SessionUser): { arrondissementId: string | null } {
  if (estArrondissement(user)) {
    if (!user.arrondissementId) throw new Error("Compte sans arrondissement assigné.");
    return { arrondissementId: user.arrondissementId };
  }
  return { arrondissementId: null };
}

/** Les zones de ce rédacteur : celles de son rapport ; pour un chef de section, celles de son domaine. */
function zonesDe(user: SessionUser) {
  const zones = zonesTexte({ arrondissement: estArrondissement(user) });
  if (!user.role.startsWith("CHEF_")) return zones;
  return zones.filter((z) => chefDeSection(z.sectionCle, z.cle) === user.role);
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
    assertRole(user, [...ROLES_REDACTION]);
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
    // Deux points de départ, que le rédacteur reprend d'un clic puis corrige :
    // le texte de référence, déjà mis à la période (« de Juillet à
    // Septembre 2026 »), et ce qu'il a écrit au trimestre précédent.
    const nom = await nomArrondissement(db, arrondissementId);
    const profil = { role: user.role, arrondissement: nom };
    const references = {
      // La conclusion et la synthèse des productions : un brouillon calculé sur les chiffres.
      ...Object.fromEntries(await textesCalculesPour(db, p, profil)),
      ...Object.fromEntries(TEXTES_COMMUNS),
      ...(nom ? TEXTES_ARRONDISSEMENTS.get(nom) ?? {} : Object.fromEntries(TEXTES_FIXES)),
    };
    const ctx = await contextePour(db, p, profil);
    const precedents = await lireRubriques(db, periodePrecedente(p), arrondissementId).catch(() => new Map<string, string>());
    const zones = zonesDe(user).map((z) => {
      const reference = (references as Record<string, string | undefined>)[z.cle];
      return {
        ...z,
        contenu: ecrits.get(z.cle) ?? "",
        reference: reference ? resoudre(reference, ctx) : null,
        precedent: precedents.get(z.cle) ?? null,
      };
    });

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
    assertRole(user, [...ROLES_REDACTION]);
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
    const connue = zonesDe(user).some((z) => z.cle === cle);
    if (!connue) {
      return NextResponse.json({ message: `Zone inconnue du canevas, ou hors de votre ressort : « ${cle} ».` }, { status: 400 });
    }

    const { enregistre } = await ecrireRubrique(db, user.transaction, p, arrondissementId, cle, contenu ?? "", user.id);

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

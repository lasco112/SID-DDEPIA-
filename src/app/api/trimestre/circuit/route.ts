/**
 * Le circuit de validation du rapport trimestriel.
 *
 *   GET  /api/trimestre/circuit?annee=&trimestre=   l'état du circuit, et ce que CE profil peut faire
 *   POST /api/trimestre/circuit                      une étape :
 *        { action: "transmettre" }                              le DA, pour son arrondissement
 *        { action: "renvoyer", arrondissementId, motif }        un chef de section ou le DD
 *        { action: "valider" }                                  un chef de section, pour son domaine
 *        { action: "annuler", section? }                        le chef pour son domaine, ou le DD
 *
 * Le périmètre est lu sur la session, jamais reçu du client : un DA ne
 * transmet que SON arrondissement, un chef ne valide que SON domaine.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle, libelleOfficiel } from "@/server/periodes/calendrier";
import { periodeTrimestrielle } from "@/server/trimestre/rubriques";
import {
  etatCircuit, transmettre, renvoyer, validerSection, annulerValidationSection, codeSection, RefusCircuit, SECTIONS_CIRCUIT,
} from "@/server/trimestre/circuit";

const ROLES = ["DD", "DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"] as const;

function periodeDe(annee: unknown, trimestre: unknown) {
  const a = Number(annee);
  const t = Number(trimestre);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return null;
  if (![1, 2, 3, 4].includes(t)) return null;
  return trimestrielle(a, t);
}

const erreur = (message: string, status: number) => NextResponse.json({ message }, { status });

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES]);
    const params = new URL(req.url).searchParams;
    const periode = periodeDe(params.get("annee"), params.get("trimestre"));
    if (!periode) return erreur("Période demandée invalide.", 400);
    const etat = await etatCircuit(user.db, periode);
    const sienne = etat.arrondissements.find((a) => a.id === user.arrondissementId) ?? null;
    const maSection = etat.sections.find((s) => s.chef === user.role) ?? null;
    return NextResponse.json({
      periode: libelleOfficiel(periode),
      role: user.role,
      // Un DA et un agent ne voient que leur arrondissement.
      arrondissements: user.role === "DA" || user.role === "AGENT_SAISIE" ? (sienne ? [sienne] : []) : etat.arrondissements,
      sections: etat.sections,
      tousTransmis: etat.tousTransmis,
      complet: etat.complet,
      peut: {
        transmettre: user.role === "DA" && sienne != null && sienne.statut !== "TRANSMIS",
        renvoyer: user.role === "DD" || user.role.startsWith("CHEF_"),
        valider: maSection != null && maSection.statut === "A_VALIDER",
        annulerSection: user.role === "DD" ? "toutes" : maSection?.statut === "VALIDE" ? maSection.code : null,
      },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return erreur(message, status);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES]);
    const body = (await req.json()) as {
      annee?: number; trimestre?: number; action?: string; arrondissementId?: string; motif?: string; section?: string;
    };
    const periode = periodeDe(body.annee, body.trimestre);
    if (!periode) return erreur("Période demandée invalide.", 400);
    const periodeId = await periodeTrimestrielle(user.db, periode);

    let details: Record<string, unknown> = {};
    switch (body.action) {
      case "transmettre": {
        // L'agent prépare, il ne transmet jamais — comme au mensuel.
        if (user.role !== "DA") return erreur("Seul le Délégué d'arrondissement transmet le rapport de son arrondissement.", 403);
        if (!user.arrondissementId) return erreur("Votre compte n'est rattaché à aucun arrondissement.", 400);
        await transmettre(user.db, user.transaction, periodeId, periode, user.arrondissementId, user.id);
        details = { arrondissementId: user.arrondissementId };
        break;
      }
      case "renvoyer": {
        if (user.role !== "DD" && !user.role.startsWith("CHEF_")) {
          return erreur("Seuls un chef de section ou le Délégué départemental renvoient un rapport.", 403);
        }
        if (!body.arrondissementId) return erreur("Arrondissement non précisé.", 400);
        await renvoyer(user.db, user.transaction, periodeId, periode, body.arrondissementId, body.motif ?? "", user.id);
        details = { arrondissementId: body.arrondissementId, motif: body.motif };
        break;
      }
      case "valider": {
        if (!user.role.startsWith("CHEF_")) return erreur("Seul un chef de section valide un domaine du rapport.", 403);
        await validerSection(user.db, user.transaction, periodeId, periode, user.role, user.id);
        details = { section: codeSection(user.role) };
        break;
      }
      case "annuler": {
        // Le chef annule SA validation ; le DD peut annuler celle de n'importe quel domaine.
        const code = user.role === "DD" ? body.section : codeSection(user.role);
        if (!code || !SECTIONS_CIRCUIT.some((s) => s.code === code)) return erreur("Domaine non précisé.", 400);
        if (user.role !== "DD" && !user.role.startsWith("CHEF_")) return erreur("Action non permise.", 403);
        await annulerValidationSection(user.transaction, periodeId, code);
        details = { section: code };
        break;
      }
      default:
        return erreur("Action inconnue.", 400);
    }

    await user.db.auditLog.create({
      data: {
        userId: user.id,
        action: `CIRCUIT_TRIMESTRE_${String(body.action).toUpperCase()}`,
        entite: "CircuitTrimestre",
        entiteId: `${periode.annee}-T${periode.rang}`,
        details: { ...details, periode: libelleOfficiel(periode) } as object,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RefusCircuit) return erreur(e.message, 409);
    const { status, message } = permissionErrorResponse(e);
    return erreur(message, status);
  }
}

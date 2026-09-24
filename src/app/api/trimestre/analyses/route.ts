/**
 * Les analyses des tableaux du rapport trimestriel.
 *
 *   GET    /api/trimestre/analyses?annee=&trimestre=   → les analyses à relire
 *   PUT    /api/trimestre/analyses                     → valider (ou corriger) une analyse
 *   DELETE /api/trimestre/analyses                     → retirer une validation
 *
 * Le texte est CALCULÉ par le SID ; on ne valide que ce qu'il calcule
 * aujourd'hui — la proposition est recalculée ici, jamais reçue du client.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { trimestrielle } from "@/server/periodes/calendrier";
import { periodeTrimestrielle } from "@/server/trimestre/rubriques";
import { nomArrondissement, type Profil } from "@/server/trimestre/saisieTrimestrielle";
import { ecranAnalyses, porteeDe, propositionsPour, ROLES_ANALYSE } from "@/server/trimestre/analyse/ecranAnalyses";
import { validerAnalyse, retirerAnalyse } from "@/server/trimestre/analyse/analyses";
import { motifDeVerrou } from "@/server/trimestre/circuit";

function periodeDe(annee: unknown, trimestre: unknown) {
  const a = Number(annee);
  const t = Number(trimestre);
  if (!Number.isInteger(a) || a < 2000 || a > 2100) return null;
  if (![1, 2, 3, 4].includes(t)) return null;
  return trimestrielle(a, t);
}

async function profilDe(user: Awaited<ReturnType<typeof requireUser>>): Promise<Profil | null> {
  const profil: Profil = { role: user.role, arrondissement: await nomArrondissement(user.db, user.arrondissementId) };
  if ((user.role === "DA" || user.role === "AGENT_SAISIE") && !profil.arrondissement) return null;
  return profil;
}

const erreur = (message: string, status: number) => NextResponse.json({ message }, { status });

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES_ANALYSE]);
    const params = new URL(req.url).searchParams;
    const periode = periodeDe(params.get("annee"), params.get("trimestre"));
    if (!periode) return erreur("Période demandée invalide.", 400);
    const profil = await profilDe(user);
    if (!profil) return erreur("Votre compte n'est rattaché à aucun arrondissement.", 400);
    return NextResponse.json(await ecranAnalyses(user.db, periode, profil));
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return erreur(message, status);
  }
}

/** Le tableau visé, s'il est bien du ressort de ce profil. */
async function cible(user: Awaited<ReturnType<typeof requireUser>>, body: { annee?: number; trimestre?: number; numeroTableau?: number }) {
  const periode = periodeDe(body.annee, body.trimestre);
  if (!periode) return { refus: erreur("Période demandée invalide.", 400) };
  const profil = await profilDe(user);
  if (!profil) return { refus: erreur("Votre compte n'est rattaché à aucun arrondissement.", 400) };
  const proposition = (await propositionsPour(user.db, periode, profil)).find((p) => p.numero === body.numeroTableau);
  if (!proposition) return { refus: erreur("Ce tableau n'a pas d'analyse de votre ressort.", 403) };
  if (proposition.vide) return { refus: erreur("Ce tableau est vide : il n'y a rien à analyser.", 409) };
  const portee = await porteeDe(user.db, profil);
  if (portee == null) return { refus: erreur("Arrondissement introuvable.", 400) };
  // Le circuit : un rapport transmis, un domaine validé, ne se modifient plus.
  const verrou = await motifDeVerrou(user.db, periode, { role: user.role, arrondissementId: user.arrondissementId });
  if (verrou) return { refus: erreur(verrou, 409) };
  return { periode, proposition, portee };
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES_ANALYSE]);
    const body = (await req.json()) as {
      annee?: number; trimestre?: number; numeroTableau?: number; texte?: string | null; explication?: string | null;
    };
    const c = await cible(user, body);
    if ("refus" in c) return c.refus;
    const periodeId = await periodeTrimestrielle(user.db, c.periode);
    await validerAnalyse(
      user.transaction,
      periodeId,
      c.portee,
      c.proposition.numero,
      {
        texteCalcule: c.proposition.texte,
        texte: (body.texte ?? "").trim() || c.proposition.texte,
        explication: body.explication ?? null,
      },
      user.id
    );
    await user.db.auditLog.create({
      data: {
        userId: user.id,
        action: "VALIDATION_ANALYSE",
        entite: "AnalyseCanevas",
        entiteId: `${c.proposition.numero} | ${c.portee || "département"}`,
        details: { annee: c.periode.annee, trimestre: c.periode.rang, corrige: Boolean(body.texte?.trim() && body.texte.trim() !== c.proposition.texte) },
      },
    });
    return NextResponse.json({ valide: true });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return erreur(message, status);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, [...ROLES_ANALYSE]);
    const body = (await req.json()) as { annee?: number; trimestre?: number; numeroTableau?: number };
    const c = await cible(user, body);
    if ("refus" in c) return c.refus;
    const periodeId = await periodeTrimestrielle(user.db, c.periode);
    await retirerAnalyse(user.transaction, periodeId, c.portee, c.proposition.numero);
    return NextResponse.json({ valide: false });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return erreur(message, status);
  }
}

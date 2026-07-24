/**
 * GET/POST /api/da/assignations — organisation du travail des agents de
 * saisie par le DA (demande de la réunion de service) : quel tableau est
 * attribué à quel agent, pour la période active. Purement INDICATIF (choix
 * confirmé du DD) : n'importe quel agent de l'arrondissement reste capable
 * de remplir n'importe quel tableau, l'attribution ne fait qu'organiser
 * visuellement le travail. Réattribuer ne touche jamais aux données déjà
 * saisies (voir AssignationSaisie dans schema.prisma).
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["DA"]);
    const db = user.db;

    if (!user.arrondissementId) {
      return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
    }

    const [periode, agents, templates] = await Promise.all([
      db.periodeReporting.findFirst({ where: { type: "MENSUEL" }, orderBy: [{ annee: "desc" }, { mois: "desc" }] }),
      db.user.findMany({
        where: { role: "AGENT_SAISIE", arrondissementId: user.arrondissementId, actif: true },
        orderBy: { nom: "asc" },
        select: { id: true, nom: true },
      }),
      db.formTemplate.findMany({ where: { actif: true }, orderBy: { ordre: "asc" }, select: { code: true, numero: true, titre: true } }),
    ]);

    let assignations: Array<{ templateCode: string; agentId: string | null }> = [];
    if (periode) {
      assignations = await db.assignationSaisie.findMany({
        where: { periodeId: periode.id, arrondissementId: user.arrondissementId },
        select: { templateCode: true, agentId: true },
      });
    }
    const parCode = new Map(assignations.map((a) => [a.templateCode, a.agentId]));

    return NextResponse.json({
      periode: periode ? { id: periode.id, annee: periode.annee, mois: periode.mois } : null,
      agents,
      tableaux: templates.map((t) => ({ ...t, agentId: parCode.get(t.code) ?? null })),
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA"]);
    const db = user.db;

    if (!user.arrondissementId) {
      return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
    }

    const { templateCode, agentId } = (await req.json()) as { templateCode: string; agentId: string | null };
    if (!templateCode) return NextResponse.json({ message: "templateCode requis" }, { status: 400 });

    const periode = await db.periodeReporting.findFirst({ where: { type: "MENSUEL" }, orderBy: [{ annee: "desc" }, { mois: "desc" }] });
    if (!periode) return NextResponse.json({ message: "Aucune période active." }, { status: 400 });

    if (agentId) {
      const agent = await db.user.findUnique({ where: { id: agentId } });
      if (!agent || agent.role !== "AGENT_SAISIE" || agent.arrondissementId !== user.arrondissementId) {
        return NextResponse.json({ message: "Cet agent n'appartient pas à votre arrondissement." }, { status: 403 });
      }
    }

    await db.assignationSaisie.upsert({
      where: { periodeId_arrondissementId_templateCode: { periodeId: periode.id, arrondissementId: user.arrondissementId, templateCode } },
      update: { agentId, assignePar: user.id, assigneLe: new Date() },
      create: { periodeId: periode.id, arrondissementId: user.arrondissementId, templateCode, agentId, assignePar: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

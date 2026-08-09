/**
 * POST /api/da/fin-de-saisie — un agent de saisie signale qu'il a terminé un
 * tableau. Le Délégué d'Arrondissement en est notifié.
 *
 * Pourquoi cette route : un agent de saisie ne peut JAMAIS soumettre le
 * rapport, c'est le monopole du DA. Il n'avait donc aucun moyen de dire « j'ai
 * fini de mon côté » autrement qu'en appelant son chef au téléphone. Ce signal
 * est sa seule façon de rendre la main.
 *
 * Le DA le retrouve dans « Suivi des agents de saisie ».
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { notifierEvenement } from "@/server/notifications/evenements";
import { resoudrePeriode } from "@/server/periodes/courante";
import type { PrismaClient } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["AGENT_SAISIE", "DA"]);
    const db = user.db;

    if (!user.arrondissementId) {
      return NextResponse.json({ message: "Compte sans arrondissement assigné." }, { status: 400 });
    }

    const { templateCode } = (await req.json()) as { templateCode?: string };
    if (!templateCode) return NextResponse.json({ message: "Tableau non précisé." }, { status: 400 });

    const [periode, template] = await Promise.all([
      resoudrePeriode(db),
      db.formTemplate.findUnique({ where: { code: templateCode } }),
    ]);
    if (!periode) return NextResponse.json({ message: "Aucune période de travail." }, { status: 404 });
    if (!template) return NextResponse.json({ message: "Tableau introuvable." }, { status: 404 });

    // L'assignation peut ne pas exister : le DA n'attribue pas forcément les
    // tableaux nommément. On la crée alors à la volée pour porter le signal.
    const assignation = await db.assignationSaisie.upsert({
      where: {
        periodeId_arrondissementId_templateCode: {
          periodeId: periode.id,
          arrondissementId: user.arrondissementId,
          templateCode,
        },
      },
      update: { termineLe: new Date(), termineParId: user.id },
      create: {
        periodeId: periode.id,
        arrondissementId: user.arrondissementId,
        templateCode,
        agentId: user.role === "AGENT_SAISIE" ? user.id : null,
        assignePar: user.id,
        termineLe: new Date(),
        termineParId: user.id,
      },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "FIN_SAISIE_AGENT",
        entite: "AssignationSaisie",
        entiteId: assignation.id,
        details: { templateCode, periode: `${periode.annee}-${String(periode.mois ?? 0).padStart(2, "0")}` },
      },
    });

    // Seul le DA de l'arrondissement est prévenu : c'est lui qui doit reprendre
    // la main pour contrôler puis transmettre.
    const das = await db.user.findMany({
      where: { role: "DA", actif: true, arrondissementId: user.arrondissementId },
      select: { id: true },
    });
    await notifierEvenement(
      db as PrismaClient,
      { userIds: das.map((d) => d.id), saufUserId: user.id },
      {
        declencheur: "FIN_SAISIE_AGENT",
        message: `${user.username} a terminé la saisie du tableau ${template.numero} ${template.titre}.`,
        lien: `/da/saisie/${templateCode}`,
      }
    );

    return NextResponse.json({ assignation });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

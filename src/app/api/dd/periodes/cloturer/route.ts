/**
 * POST /api/dd/periodes/cloturer — clôture définitive d'une période (§13).
 *
 * Après clôture, les données du mois sont figées : plus aucune saisie,
 * correction, validation ni soumission. Restent possibles : la consultation et
 * le téléchargement des rapports des DA et du rapport départemental.
 *
 * La clôture n'est proposée que lorsque le circuit est complet — le mois n'est
 * pas censé être clos tant qu'un arrondissement n'a pas transmis ou qu'une
 * section n'a pas validé. Le DD dispose de « Valider en tant que DD » pour
 * débloquer une validation manquante.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { verifierCompletudeDD } from "@/server/export/rapport-docx";
import { STATUT_CLOTUREE } from "@/server/periodes/gel";
import { notifierEvenement } from "@/server/notifications/evenements";
import type { PrismaClient } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db;

    const { periodeId } = (await req.json()) as { periodeId: string };
    if (!periodeId) return NextResponse.json({ message: "Période non précisée." }, { status: 400 });

    const periode = await db.periodeReporting.findUnique({ where: { id: periodeId } });
    if (!periode) return NextResponse.json({ message: "Période introuvable." }, { status: 404 });
    if (periode.statut === STATUT_CLOTUREE) {
      return NextResponse.json({ message: "Cette période est déjà clôturée." }, { status: 409 });
    }

    const completude = await verifierCompletudeDD(db, periodeId);
    if (!completude.complet) {
      return NextResponse.json(
        { message: "Clôture impossible : le circuit n'est pas terminé.", ...completude },
        { status: 409 }
      );
    }

    // Le rapport départemental doit exister : clôturer un mois dont le document
    // officiel n'a jamais été produit laisserait une période close sans rapport.
    const rapportDD = await db.exportDocument.count({ where: { periodeId, type: "RAPPORT_DD_DOCX" } });
    if (rapportDD === 0) {
      return NextResponse.json(
        { message: "Clôture impossible : le rapport départemental définitif n'a pas encore été généré." },
        { status: 409 }
      );
    }

    const misAJour = await db.periodeReporting.update({
      where: { id: periodeId },
      data: { statut: STATUT_CLOTUREE, clotureeLe: new Date(), clotureeParId: user.id },
    });

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "CLOTURE_PERIODE",
        entite: "PeriodeReporting",
        entiteId: periodeId,
        details: { periode: `${periode.annee}-${String(periode.mois ?? 0).padStart(2, "0")}`, rapportsDD: rapportDD },
      },
    });

    await notifierEvenement(
      db as PrismaClient,
      { roles: ["DD", "DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"], saufUserId: user.id },
      {
        declencheur: "CLOTURE_PERIODE",
        message: `La période ${String(periode.mois ?? 0).padStart(2, "0")}/${periode.annee} est clôturée : les données de ce mois sont désormais figées.`,
        lien: "/dashboard",
      }
    );

    return NextResponse.json({ periode: misAJour });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

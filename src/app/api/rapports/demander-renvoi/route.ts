/**
 * POST /api/rapports/demander-renvoi — le DA (ou son agent) demande au DD de
 * lui renvoyer un rapport déjà transmis, parce qu'une correction faite sur
 * l'appareil n'a pas pu partir. Même geste quand c'est le mois qui bloque :
 * verrouillé après la date limite (le DD déverrouille) ou clôturé (le DD
 * rouvre).
 *
 * Décision du Délégué, 1er octobre 2026. La demande ne change RIEN au
 * rapport ni aux données : elle notifie le DD (mois et tableaux concernés),
 * et laisse une trace que la Supervision affiche à côté du bouton « Renvoyer
 * au DA ». Le DD reste seul juge.
 */
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { notifierEvenement } from "@/server/notifications/evenements";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";

const NOM_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** Un second clic dans ce délai ne renotifie pas le DD. */
const DELAI_DOUBLON_MS = 10 * 60_000;

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const db = user.db;
    assertRole(user, ["DA", "AGENT_SAISIE"]);
    if (!user.arrondissementId) {
      return NextResponse.json({ message: "Compte sans arrondissement assigné." }, { status: 400 });
    }

    const corps = (await req.json().catch(() => ({}))) as { periodeId?: string; tableaux?: unknown };
    if (!corps.periodeId) {
      return NextResponse.json({ message: "Mois non précisé." }, { status: 400 });
    }
    const tableaux = Array.isArray(corps.tableaux)
      ? corps.tableaux.filter((t): t is string => typeof t === "string").map((t) => t.slice(0, 120)).slice(0, 30)
      : [];

    const rapport = await db.rapportArrondissement.findUnique({
      where: { periodeId_arrondissementId: { periodeId: corps.periodeId, arrondissementId: user.arrondissementId } },
      include: { periode: { select: { mois: true, annee: true, statut: true } }, arrondissement: { select: { nom: true } } },
    });
    if (!rapport) {
      return NextResponse.json({ message: "Aucun rapport pour ce mois." }, { status: 404 });
    }
    // Ce qui bloque, et donc ce que le DD doit faire.
    const blocage =
      rapport.periode.statut === "ARCHIVEE"
        ? "rouvrir le mois (il est clôturé)"
        : rapport.statut === "SOUMIS" || rapport.statut === "CLOTURE"
          ? "renvoyer le rapport"
          : rapport.periode.statut === "VERROUILLEE_DA" && !rapport.deverrouillePar
            ? "déverrouiller le rapport (date limite passée)"
            : null;
    if (!blocage) {
      return NextResponse.json(
        { message: "Ce rapport est déjà ouvert à la correction : vos saisies repartiront toutes seules." },
        { status: 409 }
      );
    }

    const recente = await db.auditLog.findFirst({
      where: { action: "DEMANDE_RENVOI", entiteId: rapport.id, createdAt: { gt: new Date(Date.now() - DELAI_DOUBLON_MS) } },
      select: { id: true },
    });
    if (recente) {
      return NextResponse.json({ deja: true });
    }

    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "DEMANDE_RENVOI",
        entite: "RapportArrondissement",
        entiteId: rapport.id,
        details: { tableaux, demandeur: user.username, blocage },
      },
    });

    const mois = rapport.periode.mois ? `${NOM_MOIS[rapport.periode.mois - 1]} ${rapport.periode.annee}` : String(rapport.periode.annee);
    const ou = tableaux.length > 0 ? ` (${tableaux.slice(0, 3).join(", ")}${tableaux.length > 3 ? `, et ${tableaux.length - 3} autre(s)` : ""})` : "";
    await notifierEvenement(
      db as PrismaClient,
      { roles: ["DD"] },
      {
        declencheur: "DEMANDE_RENVOI",
        message: `${rapport.arrondissement.nom} vous demande de ${blocage} de ${mois} : une correction n'a pas pu partir${ou}.`,
        lien: "/dd/supervision",
      }
    );

    return NextResponse.json({ deja: false });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

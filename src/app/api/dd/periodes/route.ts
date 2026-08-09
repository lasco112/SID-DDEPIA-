/**
 * Gestion des périodes mensuelles par le Délégué Départemental (CDC §2).
 *
 * GET  — état de chaque période : statut, échéances, clôture, réouverture,
 *        et volume de données déjà rattaché (pour ne jamais fermer à l'aveugle).
 * POST — création d'une période, y compris **rétroactive** : reconstituer le
 *        rapport de juin 2026 alors que le SID a été mis en service en juillet
 *        doit être possible (§1).
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { libellePeriode } from "@/server/periodes/courante";

export async function GET() {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db;

    const periodes = await db.periodeReporting.findMany({
      where: { type: "MENSUEL" },
      orderBy: [{ annee: "desc" }, { mois: "desc" }],
      include: {
        clotureePar: { select: { nom: true } },
        _count: { select: { rapports: true, exports: true } },
      },
    });

    return NextResponse.json({
      periodes: periodes.map((p) => ({
        id: p.id,
        mois: p.mois,
        annee: p.annee,
        libelle: libellePeriode(p),
        statut: p.statut,
        dateLimiteDA: p.dateLimiteDA,
        clotureeLe: p.clotureeLe,
        clotureePar: p.clotureePar?.nom ?? null,
        reouverteLe: p.reouverteLe,
        motifReouverture: p.motifReouverture,
        rapports: p._count.rapports,
        documents: p._count.exports,
      })),
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db;

    const { annee, mois } = (await req.json()) as { annee: number; mois: number };
    if (!Number.isInteger(annee) || !Number.isInteger(mois) || mois < 1 || mois > 12) {
      return NextResponse.json({ message: "Mois et année invalides." }, { status: 400 });
    }
    if (annee < 2020 || annee > 2100) {
      return NextResponse.json({ message: "Année hors des bornes admises." }, { status: 400 });
    }

    const existante = await db.periodeReporting.findFirst({ where: { type: "MENSUEL", annee, mois } });
    if (existante) {
      return NextResponse.json(
        { message: `La période ${libellePeriode(existante)} existe déjà.` },
        { status: 409 }
      );
    }

    // Échéances du canevas : DA le 28, chefs de section le 29, DD le 2 du mois
    // suivant. Pour une période rétroactive ces dates sont dépassées : la
    // période est malgré tout créée OUVERTE, c'est le DD qui décide de la
    // fermer — sinon il serait impossible de reconstituer un mois ancien.
    const dateOuverture = new Date(Date.UTC(annee, mois - 1, 1));
    const dateLimiteDA = new Date(Date.UTC(annee, mois - 1, 28, 17, 0));
    const dateLimiteChef = new Date(Date.UTC(annee, mois - 1, 29, 17, 0));
    const dateLimiteDD = new Date(Date.UTC(annee, mois, 2, 17, 0));

    const periode = await db.periodeReporting.create({
      data: { type: "MENSUEL", annee, mois, dateOuverture, dateLimiteDA, dateLimiteChef, dateLimiteDD, statut: "OUVERTE" },
    });

    const retroactive = dateLimiteDA < new Date();
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "CREATION_PERIODE",
        entite: "PeriodeReporting",
        entiteId: periode.id,
        details: { periode: `${annee}-${String(mois).padStart(2, "0")}`, retroactive },
      },
    });

    return NextResponse.json({ periode, retroactive });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

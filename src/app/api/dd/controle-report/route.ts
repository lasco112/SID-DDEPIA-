/**
 * GET /api/dd/controle-report — contrôle du report automatique vers 1.2.
 *
 * Répond à la question que le DD ne pouvait vérifier que depuis une console
 * SQL : les cases « Pondeuse » et « Poulet chair » du tableau 1.2 sont-elles
 * cohérentes avec la somme des tableaux 1.4 et 1.5 ? Et lesquelles ont été
 * modifiées automatiquement ?
 *
 * Lecture seule : cette route ne modifie jamais rien.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { CHAMPS_DERIVES, numeroTableau } from "@/lib/champsDerives";
import { resoudrePeriode } from "@/server/periodes/courante";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);
    const db = user.db;

    const demandee = new URL(req.url).searchParams.get("periodeId");
    const periode = await resoudrePeriode(db, demandee);
    if (!periode) return NextResponse.json({ message: "Aucune période." }, { status: 404 });

    const rapports = await db.rapportArrondissement.findMany({
      where: { periodeId: periode.id },
      include: { arrondissement: true },
      orderBy: { arrondissement: { ordre: "asc" } },
    });

    const lignes = [];
    for (const r of rapports) {
      for (const regle of CHAMPS_DERIVES) {
        const [cible, sources] = await Promise.all([
          db.saisieMatrice.findUnique({
            where: { rapportId_fieldCode: { rapportId: r.id, fieldCode: regle.champCible } },
            select: { valeur: true },
          }),
          db.saisieNominative.findMany({
            where: { rapportId: r.id, fieldCode: regle.champSource, nonRenseigne: false },
            select: { valeur: true },
          }),
        ]);

        const valeur = cible?.valeur == null ? null : Number(cible.valeur);
        const somme = sources.reduce((s, x) => s + Number(x.valeur ?? 0), 0);

        let etat: string;
        if (sources.length === 0) etat = "CONSERVEE";
        else if (valeur == null) etat = "REMPLIE";
        else if (valeur === somme) etat = "COHERENTE";
        else etat = "ECART";

        lignes.push({
          arrondissement: r.arrondissement.nom,
          ligne: regle.champCible === "T12_VOL_MOD_PONDEUSE" ? "Pondeuse — élevage moderne" : "Poulet chair — élevage moderne",
          tableauSource: numeroTableau(regle.templateSource),
          valeurActuelle: valeur,
          sommeSource: somme,
          nbFermes: sources.length,
          etat,
        });
      }
    }

    // Ce que le report a RÉELLEMENT modifié depuis sa mise en service.
    const modifications = await db.correction.findMany({
      where: {
        motif: { contains: "Report automatique" },
        saisieMatrice: { rapport: { periodeId: periode.id } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { saisieMatrice: { include: { rapport: { include: { arrondissement: true } }, field: true } } },
    });

    const lire = (json: string) => {
      try {
        const o = JSON.parse(json);
        return o?.valeur ?? null;
      } catch {
        return null;
      }
    };

    return NextResponse.json({
      periode: { mois: periode.mois, annee: periode.annee },
      lignes,
      resume: {
        ecarts: lignes.filter((l) => l.etat === "ECART").length,
        coherentes: lignes.filter((l) => l.etat === "COHERENTE").length,
        remplies: lignes.filter((l) => l.etat === "REMPLIE").length,
        conservees: lignes.filter((l) => l.etat === "CONSERVEE").length,
      },
      modifications: modifications.map((c) => ({
        date: c.createdAt,
        arrondissement: c.saisieMatrice?.rapport.arrondissement.nom ?? "—",
        donnee: c.saisieMatrice?.field.libelle ?? "—",
        avant: lire(c.valeurAvant),
        apres: lire(c.valeurApres),
      })),
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

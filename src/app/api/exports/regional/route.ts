/**
 * GET /api/exports/regional?annee=&semestre=[&souReserve=1]
 *
 * L'export consolidé du semestre, destiné à la DREPIA-Ouest (lot 16). Monopole
 * du DD, comme tout document transmis à la hiérarchie.
 *
 * Archivé, versionné, avec empreinte SHA-256 et trace d'audit — au même titre
 * que les autres documents officiels : ce qui a été transmis doit pouvoir être
 * relu tel quel des mois plus tard.
 *
 * `souReserve` correspond à la « génération sous réserve » : elle n'est
 * possible que si elle est demandée explicitement, et le document produit porte
 * alors la mention DOCUMENT PROVISOIRE ainsi que la liste des mois manquants.
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { genererExportRegional, periodeSemestrielle } from "@/server/export/regional-xlsx";
import { semestrielle } from "@/server/periodes/calendrier";
import { PeriodeNonCalculableError } from "@/server/trimestre/agregation";
import crypto from "node:crypto";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DD"]);

    const params = new URL(req.url).searchParams;
    const annee = Number(params.get("annee"));
    const semestre = Number(params.get("semestre"));
    if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
      return NextResponse.json({ message: "Année demandée invalide." }, { status: 400 });
    }
    if (semestre !== 1 && semestre !== 2) {
      return NextResponse.json({ message: "Le semestre doit valoir 1 ou 2." }, { status: 400 });
    }

    const periode = semestrielle(annee, semestre);
    const souReserve = params.get("souReserve") === "1";

    const produit = await genererExportRegional(user.db, periode, { autoriserIncomplet: souReserve });
    const hash = crypto.createHash("sha256").update(produit.buffer).digest("hex");

    // La période est matérialisée seulement maintenant : inutile de créer une
    // ligne pour un semestre dont la génération vient d'échouer.
    const periodeId = await periodeSemestrielle(user.db, periode);
    const version =
      (await user.db.exportDocument.count({ where: { periodeId, type: "EXPORT_DREPIA_XLSX" } })) + 1;
    const nomFichier = produit.nomFichier.replace(/\.xlsx$/, `_v${version}.xlsx`);

    await user.transaction(async (tx) => {
      await tx.exportDocument.create({
        data: {
          type: "EXPORT_DREPIA_XLSX",
          periodeId,
          auteurId: user.id,
          version,
          cheminFichier: nomFichier,
          contenu: produit.buffer,
          hashSha256: hash,
        },
      });
      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "EXPORT",
          entite: "ExportDocument",
          details: {
            type: "EXPORT_REGIONAL_SEMESTRIEL",
            annee,
            semestre,
            version,
            hash,
            provisoire: !produit.etat.calculable,
            valeursConsolidees: produit.valeursConsolidees,
          },
        },
      });
    });

    return new NextResponse(new Uint8Array(produit.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
      },
    });
  } catch (e) {
    // Une période incomplète n'est pas une panne : c'est un refus motivé, et le
    // DD doit lire quels mois manquent plutôt qu'une erreur technique.
    // Test par le TYPE : la classe ne renseigne pas `name`, un test par le nom
    // serait donc toujours faux.
    if (e instanceof PeriodeNonCalculableError) {
      return NextResponse.json({ message: e.message }, { status: 409 });
    }
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

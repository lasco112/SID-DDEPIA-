/**
 * POST /api/reports/generate — génération du rapport mensuel (.docx).
 * ---------------------------------------------------------------------------
 * body: { periodeId, type: "DD" | "DA" | "EXACT" | "APERCU" }
 *  - DD : rapport départemental définitif, monopole du rôle DD (CDC §A.2),
 *    bloqué si le workflow est incomplet (rapports non soumis, sections non
 *    validées).
 *  - EXACT : fiche de collecte calquée sur le canevas papier, mêmes conditions.
 *  - DA : chaque DA génère SON rapport, une fois SON rapport soumis.
 *  - APERCU : version provisoire du rapport départemental (§11), disponible à
 *    tout moment pour le DD, portant la mention BROUILLON tant que les
 *    validations ne sont pas toutes obtenues. Non archivée.
 * Les trois premiers sont archivés en base, versionnés, avec hash SHA-256 et
 * entrée d'audit (CDC §9.1/§13).
 */
import { NextResponse } from "next/server";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { verifierCompletudeDD, genererPayloadDD, genererPayloadDA, rendreDocx } from "@/server/export/rapport-docx";
import crypto from "node:crypto";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const db = user.db;
    const { periodeId, type } = (await req.json()) as { periodeId: string; type: "DD" | "DA" | "EXACT" | "APERCU" };

    const periode = await db.periodeReporting.findUnique({ where: { id: periodeId } });
    if (!periode || periode.type !== "MENSUEL" || periode.mois == null) {
      return NextResponse.json({ message: "Période mensuelle introuvable" }, { status: 404 });
    }

    // Mention affichée dans l'en-tête de PAGE du document, répétée sur chaque
    // page. Un seul emplacement existe dans les modèles ({MENTION_DEMO}) : il
    // porte donc toutes les mentions d'en-tête, séparées par un tiret.
    const mentions: string[] = [];
    if (user.isDemo) mentions.push("DOCUMENT DE DÉMONSTRATION — SANS VALEUR ADMINISTRATIVE");

    // L'aperçu (§11) est une version provisoire que le DD peut produire à tout
    // moment pour vérifier la présentation, les tableaux et repérer les valeurs
    // anormales. Il n'attend aucune validation et n'est jamais archivé : ce
    // n'est pas un document administratif, et il ne doit pas consommer un
    // numéro de version du rapport définitif.
    if (type === "APERCU") {
      assertRole(user, ["DD"]);
      const completude = await verifierCompletudeDD(db, periodeId);
      if (!completude.complet) mentions.push("BROUILLON — DONNÉES NON ENTIÈREMENT VALIDÉES");

      const payload = await genererPayloadDD(db, periodeId, true);
      payload.MENTION_DEMO = mentions.join("  —  ");
      const apercu = await rendreDocx("rapport_mensuel_DD.docx", payload);
      const nom = `Apercu_Rapport_DDEPIA-Menoua_${periode.annee}-${String(periode.mois).padStart(2, "0")}.docx`;

      await db.auditLog.create({
        data: {
          userId: user.id,
          action: "EXPORT",
          entite: "ExportDocument",
          details: { type: "APERCU_DD", periodeId, complet: completude.complet },
        },
      });

      return new NextResponse(new Uint8Array(apercu), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${nom}"`,
        },
      });
    }

    let buf: Buffer;
    let fileNameBase: string;
    let exportType: "RAPPORT_DD_DOCX" | "RAPPORT_DA_DOCX" | "RAPPORT_EXACT_DOCX";
    // Renseigné uniquement pour un rapport de DA : un document départemental ne
    // se rattache à aucun arrondissement en particulier.
    let arrondissementId: string | null = null;

    if (type === "DD" || type === "EXACT") {
      assertRole(user, ["DD"]);
      const completude = await verifierCompletudeDD(db, periodeId);
      if (!completude.complet) {
        return NextResponse.json(
          { message: "Génération impossible : workflow incomplet.", ...completude },
          { status: 409 }
        );
      }
      const payload = await genererPayloadDD(db, periodeId, type !== "EXACT");
      payload.MENTION_DEMO = mentions.join("  —  ");
      if (type === "DD") {
        buf = await rendreDocx("rapport_mensuel_DD.docx", payload);
        fileNameBase = `Rapport_Mensuel_DDEPIA-Menoua_${periode.annee}-${String(periode.mois).padStart(2, "0")}`;
        exportType = "RAPPORT_DD_DOCX";
      } else {
        buf = await rendreDocx("rapport_mensuel_exact.docx", payload);
        fileNameBase = `Fiche_Collecte_DDEPIA-Menoua_${periode.annee}-${String(periode.mois).padStart(2, "0")}`;
        exportType = "RAPPORT_EXACT_DOCX";
      }
    } else {
      assertRole(user, ["DA"]);
      if (!user.arrondissementId) {
        return NextResponse.json({ message: "Compte DA sans arrondissement assigné" }, { status: 400 });
      }
      const rapport = await db.rapportArrondissement.findUnique({
        where: { periodeId_arrondissementId: { periodeId, arrondissementId: user.arrondissementId } },
        include: { arrondissement: true },
      });
      if (!rapport || (rapport.statut !== "SOUMIS" && rapport.statut !== "CLOTURE")) {
        return NextResponse.json({ message: "Votre rapport doit être soumis avant de générer le document." }, { status: 409 });
      }
      const payload = await genererPayloadDA(db, periodeId, rapport.arrondissement.code, rapport.arrondissement.nom);
      payload.MENTION_DEMO = mentions.join("  —  ");
      buf = await rendreDocx("rapport_mensuel_DA.docx", payload);
      fileNameBase = `Rapport_Mensuel_${rapport.arrondissement.nom}_${periode.annee}-${String(periode.mois).padStart(2, "0")}`;
      exportType = "RAPPORT_DA_DOCX";
      arrondissementId = rapport.arrondissementId;
    }

    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    // Version comptée par arrondissement pour un rapport de DA : chacun a sa
    // propre numérotation (Santchou v1, v2… indépendamment de Dschang).
    const version =
      (await db.exportDocument.count({ where: { periodeId, type: exportType, arrondissementId } })) + 1;
    const fileName = `${fileNameBase}_v${version}.docx`;

    // Le document est conservé EN BASE : le disque du conteneur Railway est
    // effacé à chaque redéploiement, les fichiers écrits sur disque étaient
    // donc perdus et le DD ne pouvait pas relire un rapport transmis.
    await db.$transaction([
      db.exportDocument.create({
        data: {
          type: exportType,
          periodeId,
          arrondissementId,
          auteurId: user.id,
          version,
          cheminFichier: fileName,
          contenu: buf,
          hashSha256: hash,
        },
      }),
      db.auditLog.create({ data: { userId: user.id, action: "EXPORT", entite: "ExportDocument", details: { type: exportType, periodeId, version, hash } } }),
    ]);

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

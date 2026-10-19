/**
 * GET /api/etablissements/liste — la LISTE des fermes et établissements du
 * registre, par arrondissement ou pour tout le département, par spéculation
 * ou toutes (demande du Délégué, 19 octobre 2026 : « faire la liste des fermes
 * par arrondissement ou département et par spéculation »).
 *
 *   ?typeCode=TOUS|ETAB_COUVOIR|ETAB_FERME_PONTE|ETAB_FERME_CHAIR|ETAB_PROVENDERIE
 *   &arrondissementId=TOUS|<id>     (le DD seulement : un DA ou un agent a le sien)
 *   &actifs=1                       (seulement les établissements en activité)
 *   &format=xlsx                    (le fichier Excel ; sinon du JSON)
 *
 * Lecture seule, par `user.db` : le cloisonnement du département s'applique,
 * et la démonstration lit la base de démonstration.
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { identiteDepartement } from "@/lib/departement";

// Pas exporté : un fichier de route Next n'exporte que ses méthodes.
const SPECULATIONS: Record<string, string> = {
  ETAB_COUVOIR: "Couvoir",
  ETAB_FERME_PONTE: "Ferme de ponte",
  ETAB_FERME_CHAIR: "Ferme de poulets de chair",
  ETAB_PROVENDERIE: "Provenderie",
};

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    assertRole(user, ["DA", "DD", "AGENT_SAISIE"]);
    const q = new URL(req.url).searchParams;

    const typeCode = q.get("typeCode") || "TOUS";
    if (typeCode !== "TOUS" && !SPECULATIONS[typeCode]) return NextResponse.json({ message: "Spéculation inconnue." }, { status: 400 });

    // Un DA ou un agent : son arrondissement, quoi qu'il demande.
    let arrondissementId: string | null;
    if (user.role === "DD") {
      const demande = q.get("arrondissementId") || "TOUS";
      arrondissementId = demande === "TOUS" ? null : demande;
    } else {
      if (!user.arrondissementId) return NextResponse.json({ message: "Compte sans arrondissement assigné." }, { status: 400 });
      arrondissementId = user.arrondissementId;
    }
    const seulementActifs = q.get("actifs") === "1";

    const lignes = await user.db.etablissement.findMany({
      where: {
        typeCode: typeCode === "TOUS" ? { in: Object.keys(SPECULATIONS) } : typeCode,
        ...(arrondissementId ? { arrondissementId } : {}),
        ...(seulementActifs ? { actif: true } : {}),
      },
      select: {
        id: true, typeCode: true, nom: true, localite: true, proprietaire: true, telephone: true, actif: true,
        arrondissement: { select: { nom: true, ordre: true } },
      },
    });
    const ordreType = Object.keys(SPECULATIONS);
    lignes.sort(
      (a, b) =>
        (a.arrondissement.ordre ?? 0) - (b.arrondissement.ordre ?? 0) ||
        ordreType.indexOf(a.typeCode) - ordreType.indexOf(b.typeCode) ||
        a.nom.localeCompare(b.nom, "fr")
    );

    const identite = await identiteDepartement(user.db);
    const portee = arrondissementId ? `Arrondissement de ${lignes[0]?.arrondissement.nom ?? (await user.db.arrondissement.findUnique({ where: { id: arrondissementId }, select: { nom: true } }))?.nom ?? ""}` : `Département ${identite.nomAvecArticle}`;
    const speculation = typeCode === "TOUS" ? "Toutes les spéculations" : SPECULATIONS[typeCode];

    const rangees = lignes.map((l) => ({
      id: l.id,
      arrondissement: l.arrondissement.nom,
      speculation: SPECULATIONS[l.typeCode] ?? l.typeCode,
      nom: l.nom,
      localite: l.localite,
      proprietaire: l.proprietaire,
      telephone: l.telephone,
      actif: l.actif,
    }));

    if (q.get("format") !== "xlsx") {
      return NextResponse.json({ portee, speculation, lignes: rangees });
    }

    // --- Le fichier Excel : la liste, puis le décompte par arrondissement ---
    const classeur = new ExcelJS.Workbook();
    classeur.creator = identite.application;
    const feuille = classeur.addWorksheet("Liste des fermes");
    feuille.addRow([`Liste des fermes — ${portee} — ${speculation}`]).font = { bold: true, size: 13 };
    feuille.addRow([`${identite.intituleCourt} · état au ${new Date().toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" })}${seulementActifs ? " · établissements en activité" : ""}`]);
    feuille.addRow([]);
    const entete = feuille.addRow(["N°", "Arrondissement", "Spéculation", "Nom", "Localité", "Propriétaire", "Téléphone", "Statut"]);
    entete.font = { bold: true };
    entete.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2EFE8" } };
      c.border = { bottom: { style: "thin" } };
    });
    rangees.forEach((r, i) =>
      feuille.addRow([i + 1, r.arrondissement, r.speculation, r.nom, r.localite, r.proprietaire ?? "", r.telephone ?? "", r.actif ? "En activité" : "Désactivé"])
    );
    [6, 18, 26, 32, 22, 24, 16, 13].forEach((w, i) => (feuille.getColumn(i + 1).width = w));

    const decompte = classeur.addWorksheet("Décompte");
    const types = typeCode === "TOUS" ? ordreType : [typeCode];
    decompte.addRow([`Nombre d'établissements — ${portee}`]).font = { bold: true, size: 13 };
    decompte.addRow([]);
    decompte.addRow(["Arrondissement", ...types.map((t) => SPECULATIONS[t]), "Total"]).font = { bold: true };
    const arrs = Array.from(new Set(rangees.map((r) => r.arrondissement)));
    for (const a of arrs) {
      const ici = lignes.filter((l) => l.arrondissement.nom === a);
      decompte.addRow([a, ...types.map((t) => ici.filter((l) => l.typeCode === t).length), ici.length]);
    }
    decompte.addRow(["TOTAL", ...types.map((t) => lignes.filter((l) => l.typeCode === t).length), lignes.length]).font = { bold: true };
    decompte.getColumn(1).width = 22;
    for (let i = 2; i <= types.length + 2; i++) decompte.getColumn(i).width = 18;

    const fichier = Buffer.from(await classeur.xlsx.writeBuffer());
    const nomFichier = `liste-fermes-${(arrondissementId ? rangees[0]?.arrondissement ?? "arrondissement" : identite.nom).toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.xlsx`;
    await user.db.auditLog.create({
      data: { userId: user.id, action: "EXPORT", entite: "Etablissement", entiteId: "liste", details: { portee, speculation, lignes: rangees.length } },
    });
    return new NextResponse(fichier, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
      },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

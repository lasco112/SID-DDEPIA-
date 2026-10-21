/**
 * GET /api/etablissements/liste — la LISTE des fermes et établissements du
 * registre, par arrondissement ou pour tout le département, par spéculation
 * ou toutes (demande du Délégué, 19 octobre 2026 : « faire la liste des fermes
 * par arrondissement ou département et par spéculation »).
 *
 *   ?typeCode=TOUS|ETAB_COUVOIR|…|ETAB_MARCHE|…
 *   &arrondissementId=TOUS|<id>     (le DD seulement : un DA ou un agent a le sien)
 *   &actifs=1                       (seulement les établissements en activité)
 *   &tri=arrondissement|type|nom|localite
 *   &format=xlsx                    le fichier Excel (et sa feuille « Marchés »)
 *   &format=pdf                     la liste en PDF
 *   &format=pdf&fiches=1            les FICHES des marchés, une page chacun, avec la photo
 *   &id=<id>                        un seul établissement (la fiche d'un marché)
 *
 * Lecture seule, par `user.db` : le cloisonnement du département s'applique,
 * et la démonstration lit la base de démonstration.
 */
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser, assertRole, permissionErrorResponse } from "@/lib/permissions";
import { identiteDepartement } from "@/lib/departement";
import { TYPES_ACTEURS, INFRASTRUCTURES_MARCHE, libellesEspeces, libellesInfrastructures, libelleJour } from "@/lib/acteurs";
import {
  ACCES, CONTROLES, EFFECTIFS, ETATS, FONCTIONNEMENTS, PORTEES, TYPES_MARCHE,
  joursEnClair, libelleDe, lieuxEnClair, type FicheMarche,
} from "@/lib/marches";
import { TYPE_MARCHE, communeDe } from "@/server/etablissements/donnees";
import { listePdf, fichesPdf } from "@/server/etablissements/pdf";

// Les neuf types d'acteurs (20 octobre 2026). Pas exporté : un fichier de
// route Next n'exporte que ses méthodes.
const SPECULATIONS: Record<string, string> = Object.fromEntries(TYPES_ACTEURS.map((t) => [t.code, t.libelle]));
const TRIS = ["arrondissement", "type", "nom", "localite"] as const;

const precision = (p: number | null) => (p == null ? "" : ` (± ${String(p).replace(".", ",")} m)`);
/** « Marché à bétail de Foréké » → « marche-a-betail-de-foreke » : un nom de fichier lisible partout. */
const enNomDeFichier = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

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
    const unSeul = q.get("id");

    const lignes = await user.db.etablissement.findMany({
      where: {
        typeCode: typeCode === "TOUS" ? { in: Object.keys(SPECULATIONS) } : typeCode,
        ...(arrondissementId ? { arrondissementId } : {}),
        ...(seulementActifs ? { actif: true } : {}),
        ...(unSeul ? { id: unSeul } : {}),
      },
      select: {
        id: true, typeCode: true, nom: true, localite: true, proprietaire: true, telephone: true, actif: true,
        latitude: true, longitude: true, precisionGPS: true, dateCollecteGPS: true, sourceGPS: true,
        especes: true, joursMarche: true, infrastructures: true, observations: true, fiche: true,
        arrondissement: { select: { nom: true, ordre: true } },
        photo: { select: { prisLe: true } },
      },
    });
    const ordreType = Object.keys(SPECULATIONS);
    const tri = (TRIS as readonly string[]).includes(q.get("tri") ?? "") ? q.get("tri")! : "arrondissement";
    const parArr = (a: (typeof lignes)[number], b: (typeof lignes)[number]) => (a.arrondissement.ordre ?? 0) - (b.arrondissement.ordre ?? 0);
    const parType = (a: (typeof lignes)[number], b: (typeof lignes)[number]) => ordreType.indexOf(a.typeCode) - ordreType.indexOf(b.typeCode);
    const parNom = (a: (typeof lignes)[number], b: (typeof lignes)[number]) => a.nom.localeCompare(b.nom, "fr");
    const parLocalite = (a: (typeof lignes)[number], b: (typeof lignes)[number]) => a.localite.localeCompare(b.localite, "fr");
    const ordres = {
      arrondissement: [parArr, parType, parNom],
      type: [parType, parArr, parNom],
      nom: [parNom, parArr],
      localite: [parLocalite, parNom],
    }[tri as (typeof TRIS)[number]];
    lignes.sort((a, b) => {
      for (const f of ordres) {
        const d = f(a, b);
        if (d) return d;
      }
      return 0;
    });

    const identite = await identiteDepartement(user.db);
    const portee = arrondissementId ? `Arrondissement de ${lignes[0]?.arrondissement.nom ?? (await user.db.arrondissement.findUnique({ where: { id: arrondissementId }, select: { nom: true } }))?.nom ?? ""}` : `Département ${identite.nomAvecArticle}`;
    const speculation = typeCode === "TOUS" ? "Tous les acteurs" : SPECULATIONS[typeCode];
    const etatAu = new Date().toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" });

    const rangees = lignes.map((l) => {
      const marche = l.typeCode === TYPE_MARCHE;
      const f = (l.fiche as FicheMarche | null) ?? {};
      return {
        id: l.id,
        typeCode: l.typeCode,
        arrondissement: l.arrondissement.nom,
        speculation: SPECULATIONS[l.typeCode] ?? l.typeCode,
        nom: l.nom,
        localite: l.localite,
        // Un marché n'a ni propriétaire ni téléphone : c'est la commune qui le gère.
        proprietaire: marche ? null : l.proprietaire,
        telephone: marche ? null : l.telephone,
        gestionnaire: marche ? communeDe(l.arrondissement.nom) : null,
        actif: l.actif,
        latitude: l.latitude,
        longitude: l.longitude,
        precisionGPS: l.precisionGPS,
        especes: libellesEspeces(l.especes),
        joursMarche: marche ? joursEnClair(f, identite.code) ?? "" : l.joursMarche.map(libelleJour).join(", "),
        infrastructures: libellesInfrastructures(l.infrastructures),
        observations: l.observations,
        aPhoto: Boolean(l.photo),
        marche: marche
          ? {
              type: libelleDe(TYPES_MARCHE, f.typeMarche),
              fonctionnement: libelleDe(FONCTIONNEMENTS, f.fonctionnement),
              portee: libelleDe(PORTEES, f.portee),
              effectifs: l.especes.map((e) => `${libellesEspeces([e])} : ${libelleDe(EFFECTIFS, f.effectifs?.[e]) ?? "?"}`).join(" ; "),
              provenance: lieuxEnClair(f.provenances, f.provenancePrincipale, f.provenanceAutre, l.arrondissement.nom),
              destination: lieuxEnClair(f.destinations, f.destinationPrincipale, f.destinationAutre),
              equipements: [
                ...INFRASTRUCTURES_MARCHE.filter((eq) => f.equipements?.[eq.code]).map((eq) => `${eq.libelle} : ${libelleDe(ETATS, f.equipements![eq.code])}`),
                ...(f.equipementAutre ? [`${f.equipementAutre} : ${libelleDe(ETATS, f.etatEquipementAutre) ?? "?"}`] : []),
              ].join(" ; "),
              controle: libelleDe(CONTROLES, f.controleVeterinaire),
              laissezPasser: f.laissezPasser == null ? null : f.laissezPasser ? "Oui" : "Non",
              acces: libelleDe(ACCES, f.acces),
            }
          : null,
      };
    });

    const format = q.get("format");
    const nomFichier = (ext: string, prefixe = "liste-acteurs") =>
      `${prefixe}-${enNomDeFichier(arrondissementId ? rangees[0]?.arrondissement ?? "arrondissement" : identite.nom)}.${ext}`;
    const tracer = (quoi: string) =>
      user.db.auditLog.create({ data: { userId: user.id, action: "EXPORT", entite: "Etablissement", entiteId: "liste", details: { portee, speculation, lignes: rangees.length, format: quoi } } });

    if (format !== "xlsx" && format !== "pdf") {
      return NextResponse.json({ portee, speculation, lignes: rangees });
    }

    // --- Les FICHES des marchés, en PDF : une page chacun, avec la photo ---
    if (format === "pdf" && q.get("fiches") === "1") {
      const marches = lignes.filter((l) => l.typeCode === TYPE_MARCHE);
      const photos = await user.db.photoEtablissement.findMany({
        where: { etablissementId: { in: marches.filter((m) => m.photo).map((m) => m.id) } },
        select: { etablissementId: true, contenu: true, typeMime: true, prisLe: true },
      });
      const fichier = await fichesPdf({
        intitule: `${identite.intituleCourt} · état au ${etatAu}`,
        codeDepartement: identite.code,
        marches: marches.map((m) => ({
          ...m,
          arrondissement: m.arrondissement.nom,
          fiche: (m.fiche as FicheMarche | null) ?? null,
          photo: photos.find((p) => p.etablissementId === m.id) ?? null,
        })),
      });
      await tracer("pdf-fiches");
      const nom = marches.length === 1 ? `fiche-${enNomDeFichier(marches[0].nom)}.pdf` : nomFichier("pdf", "fiches-marches");
      return new NextResponse(new Uint8Array(fichier), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nom}"` } });
    }

    // --- La liste en PDF ---
    if (format === "pdf") {
      const fichier = await listePdf({
        intitule: identite.intituleCourt,
        titre: `Liste des acteurs — ${portee} — ${speculation}`,
        sousTitre: `${rangees.length} établissement(s) · état au ${etatAu}${seulementActifs ? " · établissements en activité" : ""}`,
        lignes: rangees.map((r) => ({
          arrondissement: r.arrondissement,
          speculation: r.speculation,
          nom: r.nom,
          localite: r.localite,
          responsable: r.gestionnaire ?? ([r.proprietaire, r.telephone].filter(Boolean).join(" · ") || "—"),
          detail: [r.marche?.type, r.especes, r.joursMarche].filter(Boolean).join(" · ") || "—",
          gps: r.latitude != null && r.longitude != null ? `${r.latitude}, ${r.longitude}${precision(r.precisionGPS)}` : "—",
          statut: r.actif ? "En activité" : "Désactivé",
        })),
      });
      await tracer("pdf");
      return new NextResponse(new Uint8Array(fichier), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${nomFichier("pdf")}"` } });
    }

    // --- Le fichier Excel : la liste, les marchés en détail, le décompte ---
    const classeur = new ExcelJS.Workbook();
    classeur.creator = identite.application;
    const styleEntete = (r: ExcelJS.Row) => {
      r.font = { bold: true };
      r.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2EFE8" } };
        c.border = { bottom: { style: "thin" } };
      });
    };
    const feuille = classeur.addWorksheet("Liste des acteurs");
    feuille.addRow([`Liste des acteurs — ${portee} — ${speculation}`]).font = { bold: true, size: 13 };
    feuille.addRow([`${identite.intituleCourt} · état au ${etatAu}${seulementActifs ? " · établissements en activité" : ""}`]);
    feuille.addRow([]);
    styleEntete(feuille.addRow([
      "N°", "Arrondissement", "Type d'acteur", "Nom", "Localité", "Gestionnaire / propriétaire", "Téléphone", "Statut",
      "Latitude", "Longitude", "Précision GPS (m)", "Espèces", "Jours de marché", "Équipements", "Observations",
    ]));
    rangees.forEach((r, i) =>
      feuille.addRow([
        i + 1, r.arrondissement, r.speculation, r.nom, r.localite, r.gestionnaire ?? r.proprietaire ?? "", r.telephone ?? "", r.actif ? "En activité" : "Désactivé",
        r.latitude ?? "", r.longitude ?? "", r.precisionGPS ?? "", r.especes, r.joursMarche, r.infrastructures, r.observations ?? "",
      ])
    );
    [6, 18, 26, 32, 22, 26, 16, 13, 12, 12, 12, 30, 34, 34, 40].forEach((w, i) => (feuille.getColumn(i + 1).width = w));

    const marches = rangees.filter((r) => r.marche);
    if (marches.length) {
      const fm = classeur.addWorksheet("Marchés");
      fm.addRow([`Les marchés — ${portee}`]).font = { bold: true, size: 13 };
      fm.addRow([`${identite.intituleCourt} · état au ${etatAu}`]);
      fm.addRow([]);
      styleEntete(fm.addRow([
        "N°", "Arrondissement", "Nom", "Localité", "Géré par", "Type", "État", "Portée", "Jours", "Espèces (taille habituelle)",
        "Provenance (principale d'abord)", "Destinations (principale d'abord)", "Équipements et état", "Agent MINEPIA", "Laissez-passer",
        "Accès", "Latitude", "Longitude", "Précision (m)", "Photo", "Observations", "Statut",
      ]));
      marches.forEach((r, i) =>
        fm.addRow([
          i + 1, r.arrondissement, r.nom, r.localite, r.gestionnaire, r.marche!.type ?? "", r.marche!.fonctionnement ?? "", r.marche!.portee ?? "",
          r.joursMarche, r.marche!.effectifs, r.marche!.provenance ?? "", r.marche!.destination ?? "", r.marche!.equipements, r.marche!.controle ?? "",
          r.marche!.laissezPasser ?? "", r.marche!.acces ?? "", r.latitude ?? "", r.longitude ?? "", r.precisionGPS ?? "", r.aPhoto ? "Oui" : "Non",
          r.observations ?? "", r.actif ? "En activité" : "Désactivé",
        ])
      );
      [6, 16, 28, 20, 22, 18, 22, 22, 40, 40, 40, 40, 50, 14, 14, 26, 12, 12, 12, 8, 40, 13].forEach((w, i) => (fm.getColumn(i + 1).width = w));
    }

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
    await tracer("xlsx");
    return new NextResponse(fichier, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nomFichier("xlsx")}"`,
      },
    });
  } catch (e) {
    const { status, message } = permissionErrorResponse(e);
    return NextResponse.json({ message }, { status });
  }
}

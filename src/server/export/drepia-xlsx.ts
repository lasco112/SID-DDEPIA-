/**
 * drepia-xlsx.ts — Export normalisé vers la Délégation Régionale (DREPIA-Ouest)
 * ---------------------------------------------------------------------------
 * Onglet LISEZ-MOI + un onglet par section : CODE | Indicateur | Unité |
 * 6 arrondissements | TOTAL MENOUA | TOTAL N-1 | ÉCART. Réservé au DD
 * (contrôlé par la route API appelante).
 */

import ExcelJS from "exceljs";
import { db } from "@/lib/db";

const ARR_CODES = ["DSC", "FOK", "FGT", "NKN", "PKM", "STC"] as const;

export async function genererExportDrepia(periodeId: string): Promise<Buffer> {
  const periode = await db.periodeReporting.findUniqueOrThrow({ where: { id: periodeId } });

  const periodeN1 = await db.periodeReporting.findFirst({
    where: {
      type: periode.type,
      annee: periode.annee - 1,
      mois: periode.mois,
      trimestre: periode.trimestre,
      semestre: periode.semestre,
    },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "SID DDEPIA-Menoua";
  wb.created = new Date();

  const meta = wb.addWorksheet("LISEZ-MOI");
  meta.addRows([
    ["EXPORT NORMALISÉ DDEPIA-MENOUA → DREPIA-OUEST"],
    [],
    ["Période", libellePeriode(periode)],
    ["Date de génération", new Date().toLocaleString("fr-FR")],
    ["Source", "Système d'Information Décisionnel DDEPIA-Menoua"],
    [],
    ["Convention", "Les codes de la colonne A sont stables d'un mois à l'autre."],
    ["", "Une cellule 'N/D' signifie donnée non renseignée (≠ zéro)."],
  ]);
  meta.getCell("A1").font = { bold: true, size: 14 };

  const sections = await db.section.findMany({ orderBy: { ordre: "asc" } });
  const unites = await db.referentielItem.findMany({ where: { categorie: "UNITE" } });
  const uniteLibelleParCode = new Map(unites.map((u) => [u.code, u.libelle]));

  for (const section of sections) {
    const templates = await db.formTemplate.findMany({
      where: { sectionId: section.id, actif: true, type: { in: ["MATRICE", "NOMINATIF"] } },
      include: { fields: { where: { actif: true }, orderBy: { ordre: "asc" } } },
      orderBy: { ordre: "asc" },
    });
    if (templates.length === 0) continue;

    const ws = wb.addWorksheet(section.code);
    const header = ["CODE", "Indicateur", "Unité", ...ARR_CODES, "TOTAL MENOUA", `TOTAL ${periode.annee - 1}`, "ECART"];
    ws.addRow(header).font = { bold: true };
    ws.getColumn(1).width = 32;
    ws.getColumn(2).width = 48;

    for (const tpl of templates) {
      const titre = ws.addRow([`— Tableau ${tpl.numero} : ${tpl.titre} —`]);
      titre.font = { bold: true, italic: true };

      for (const field of tpl.fields) {
        const uniteLibelle = field.uniteCode ? uniteLibelleParCode.get(field.uniteCode) ?? field.uniteCode : "";
        const row: (string | number)[] = [field.code, field.libelle, uniteLibelle];

        let totalCourant = 0;
        let auMoinsUneValeur = false;

        for (const arr of ARR_CODES) {
          const v = await sommeField(periodeId, field.code, arr);
          if (v == null) {
            row.push("N/D");
          } else {
            row.push(v);
            totalCourant += v;
            auMoinsUneValeur = true;
          }
        }
        row.push(auMoinsUneValeur ? totalCourant : "N/D");

        if (periodeN1) {
          const vN1 = await sommeField(periodeN1.id, field.code, null);
          row.push(vN1 ?? "N/D");
          row.push(vN1 != null && auMoinsUneValeur ? totalCourant - vN1 : "N/D");
        } else {
          row.push("N/D", "N/D");
        }

        ws.addRow(row);
      }
      ws.addRow([]);
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function sommeField(periodeId: string, fieldCode: string, arrCode: string | null): Promise<number | null> {
  const [matrice, nominatif] = await Promise.all([
    db.saisieMatrice.findMany({
      where: {
        fieldCode,
        nonRenseigne: false,
        rapport: { periodeId, statut: { in: ["SOUMIS", "CLOTURE"] }, ...(arrCode ? { arrondissement: { code: arrCode } } : {}) },
      },
      select: { valeur: true },
    }),
    db.saisieNominative.findMany({
      where: {
        fieldCode,
        nonRenseigne: false,
        rapport: { periodeId, statut: { in: ["SOUMIS", "CLOTURE"] }, ...(arrCode ? { arrondissement: { code: arrCode } } : {}) },
      },
      select: { valeur: true },
    }),
  ]);

  const valeurs = [...matrice, ...nominatif].map((s) => (s.valeur == null ? null : Number(s.valeur))).filter((v): v is number => v != null);
  if (valeurs.length === 0) return null;
  return valeurs.reduce((a, b) => a + b, 0);
}

function libellePeriode(p: { type: string; annee: number; mois: number | null; trimestre: number | null; semestre: number | null }): string {
  const moisFr = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  switch (p.type) {
    case "MENSUEL":
      return `${moisFr[(p.mois ?? 1) - 1]} ${p.annee}`;
    case "TRIMESTRIEL":
      return `${p.trimestre}e trimestre ${p.annee}`;
    case "SEMESTRIEL":
      return `${p.semestre}er semestre ${p.annee}`;
    default:
      return `Année ${p.annee}`;
  }
}

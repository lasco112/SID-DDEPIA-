/**
 * rapport-thematique-render.ts — trois moteurs de rendu (xlsx/docx/pdf) pour
 * le "rapport thématique" (voir rapport-thematique.ts). Ne touche à aucun des
 * générateurs du rapport mensuel classique (buildReportTemplates.ts,
 * rapport-docx.ts) — fonction strictement additive.
 */
import ExcelJS from "exceljs";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, HeadingLevel, WidthType, AlignmentType } from "docx";
import PDFDocument from "pdfkit";
import type { TableauThematique } from "./rapport-thematique";

// ---------------------------------------------------------------------------
// XLSX — un onglet par tableau retenu.
// ---------------------------------------------------------------------------
export async function rendreThematiqueXlsx(tableaux: TableauThematique[], titreGeneral: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SID DDEPIA-Menoua";
  wb.created = new Date();

  const meta = wb.addWorksheet("LISEZ-MOI");
  meta.addRows([
    [titreGeneral],
    [],
    ["Date de génération", new Date().toLocaleString("fr-FR")],
    ["Nombre de tableaux extraits", tableaux.length],
    [],
    ["Ce classeur est une extraction thématique — les valeurs sont brutes (une ligne par saisie ou par"],
    ["arrondissement/période), pas un rapport de synthèse déjà agrégé."],
  ]);
  meta.getCell("A1").font = { bold: true, size: 14 };

  const nomsUtilises = new Set<string>();
  for (const t of tableaux) {
    let nom = `${t.numero} ${t.titre}`.slice(0, 31).replace(/[[\]*?/\\:]/g, "");
    let i = 2;
    while (nomsUtilises.has(nom)) {
      nom = `${nom.slice(0, 28)} ${i}`;
      i++;
    }
    nomsUtilises.add(nom);

    const ws = wb.addWorksheet(nom);
    ws.addRow([`Tableau ${t.numero} — ${t.titre}`]).font = { bold: true, size: 12 };
    ws.addRow([]);
    const headerRow = ws.addRow(t.colonnes);
    headerRow.font = { bold: true };
    headerRow.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } }));
    for (const ligne of t.lignes) ws.addRow(ligne);
    ws.columns.forEach((col) => {
      col.width = 18;
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// ---------------------------------------------------------------------------
// DOCX — un titre + un tableau par tableau retenu.
// ---------------------------------------------------------------------------
export async function rendreThematiqueDocx(tableaux: TableauThematique[], titreGeneral: string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, children: [new TextRun({ text: titreGeneral, bold: true })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Généré le ${new Date().toLocaleString("fr-FR")} — ${tableaux.length} tableau(x) extrait(s)`, italics: true, size: 18 })],
    }),
    new Paragraph({ text: "" }),
  ];

  for (const t of tableaux) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `Tableau ${t.numero} — ${t.titre}`, bold: true })] }));

    const rows: TableRow[] = [
      new TableRow({
        children: t.colonnes.map(
          (c) =>
            new TableCell({
              width: { size: Math.floor(100 / t.colonnes.length), type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: c, bold: true })] })],
            })
        ),
      }),
      ...t.lignes.map(
        (ligne) =>
          new TableRow({
            children: ligne.map(
              (v) =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: String(v) })] })],
                })
            ),
          })
      ),
    ];
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    children.push(new Paragraph({ text: "" }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------------
// PDF — pdfkit ne fournit pas de tableau natif : dessin manuel en colonnes de
// largeur égale, avec saut de page et répétition de l'en-tête si nécessaire.
// ---------------------------------------------------------------------------
export async function rendreThematiquePdf(tableaux: TableauThematique[], titreGeneral: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const marge = 40;
    const largeurPage = doc.page.width - marge * 2;
    const basPage = doc.page.height - marge;

    doc.fontSize(16).font("Helvetica-Bold").text(titreGeneral, { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica").text(`Généré le ${new Date().toLocaleString("fr-FR")} — ${tableaux.length} tableau(x) extrait(s)`, { align: "center" });
    doc.moveDown();

    for (const t of tableaux) {
      if (doc.y > basPage - 100) doc.addPage();
      doc.fontSize(12).font("Helvetica-Bold").text(`Tableau ${t.numero} — ${t.titre}`);
      doc.moveDown(0.3);

      const nbCols = t.colonnes.length;
      const largeurCol = largeurPage / nbCols;

      const dessinerEntete = () => {
        const y = doc.y;
        doc.fontSize(8).font("Helvetica-Bold");
        t.colonnes.forEach((c, i) => doc.text(c, marge + i * largeurCol, y, { width: largeurCol - 4 }));
        doc.moveDown(0.8);
        doc.moveTo(marge, doc.y).lineTo(marge + largeurPage, doc.y).strokeColor("#999999").stroke();
        doc.moveDown(0.2);
      };

      dessinerEntete();
      doc.font("Helvetica").fontSize(8);
      for (const ligne of t.lignes) {
        if (doc.y > basPage - 20) {
          doc.addPage();
          dessinerEntete();
          doc.font("Helvetica").fontSize(8);
        }
        const y = doc.y;
        ligne.forEach((v, i) => doc.text(String(v), marge + i * largeurCol, y, { width: largeurCol - 4 }));
        doc.moveDown(0.6);
      }
      doc.moveDown();
    }

    doc.end();
  });
}

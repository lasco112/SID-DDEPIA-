/**
 * Les graphiques du rapport, écrits comme de VRAIS graphiques Word.
 *
 * La bibliothèque `docx` ne sait pas dessiner un graphique. Le rendu pose donc
 * un paragraphe-repère à l'endroit de chaque graphique ; ici, une fois le
 * document produit, chaque repère est remplacé par le graphique :
 *
 *   word/charts/chartN.xml              le graphique (barres groupées)
 *   word/charts/_rels/chartN.xml.rels   son lien vers sa feuille de données
 *   word/embeddings/…N.xlsx             la feuille de données, dans le document
 *
 * La feuille est EMBARQUÉE : dans Word, « Modifier les données » ouvre les
 * chiffres du graphique, sans fichier Excel à retrouver. Les valeurs sont
 * aussi écrites dans le graphique lui-même (le « cache ») : il s'affiche
 * partout, même là où la feuille n'est pas lue (téléphone, aperçu, WPS).
 *
 * Une case sans chiffre ne produit AUCUN point : jamais un zéro inventé.
 */
import PizZip from "pizzip";
import ExcelJS from "exceljs";
import { repereGraphique, type DonneesGraphique } from "./graphiques";

const FEUILLE = "Feuil1";
/** Couleurs des séries, dans l'ordre : lisibles en couleur comme en noir et blanc. */
const COULEURS = ["1F4E79", "C55A11", "7F7F7F", "BF9000", "2E75B6", "548235", "7030A0", "C00000", "00B0B0", "404040"];
/** 15,2 cm × 8,9 cm : la largeur utile d'une page A4 du rapport. */
const LARGEUR = 5486400;
const HAUTEUR = 3200400;

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** « B » pour 1, « AA » pour 26… : la colonne Excel de la série n° i (0 = B). */
function colonne(i: number): string {
  let n = i + 1;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function chartXml(g: DonneesGraphique): string {
  const n = g.categories.length;
  const fin = n + 1;
  const cat =
    `<c:cat><c:strRef><c:f>${FEUILLE}!$A$2:$A$${fin}</c:f><c:strCache><c:ptCount val="${n}"/>` +
    g.categories.map((c, i) => `<c:pt idx="${i}"><c:v>${xml(c)}</c:v></c:pt>`).join("") +
    `</c:strCache></c:strRef></c:cat>`;
  // Une seule série : la valeur s'écrit au-dessus de chaque barre, la légende est inutile.
  const seule = g.series.length === 1;
  const etiquettes = seule
    ? `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
    : "";
  const series = g.series
    .map((s, i) => {
      const col = colonne(i);
      const points = s.valeurs.map((v, k) => (v == null ? "" : `<c:pt idx="${k}"><c:v>${v}</c:v></c:pt>`)).join("");
      return (
        `<c:ser><c:idx val="${i}"/><c:order val="${i}"/>` +
        `<c:tx><c:strRef><c:f>${FEUILLE}!$${col}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xml(s.nom)}</c:v></c:pt></c:strCache></c:strRef></c:tx>` +
        `<c:spPr><a:solidFill><a:srgbClr val="${COULEURS[i % COULEURS.length]}"/></a:solidFill></c:spPr>` +
        `<c:invertIfNegative val="0"/>` +
        etiquettes +
        cat +
        `<c:val><c:numRef><c:f>${FEUILLE}!$${col}$2:$${col}$${fin}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${points}</c:numCache></c:numRef></c:val>` +
        `</c:ser>`
      );
    })
    .join("");
  const texte = (taille: number) =>
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${taille}"><a:latin typeface="Times New Roman"/><a:cs typeface="Times New Roman"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:date1904 val="0"/><c:lang val="fr-FR"/><c:roundedCorners val="0"/>` +
    `<c:chart><c:autoTitleDeleted val="1"/>` +
    `<c:plotArea><c:layout/>` +
    `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="${seule ? 80 : 150}"/><c:axId val="48650112"/><c:axId val="48672768"/></c:barChart>` +
    `<c:catAx><c:axId val="48650112"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>` +
    `<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:crossAx val="48672768"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="48672768"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>` +
    `<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D9D9D9"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>` +
    `<c:numFmt formatCode="#,##0" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>` +
    `<c:crossAx val="48650112"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>` +
    `</c:plotArea>` +
    (seule ? "" : `<c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>`) +
    `<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>` +
    texte(900) +
    `<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>` +
    `</c:chartSpace>`
  );
}

/** La feuille de données du graphique : les catégories en colonne A, une série par colonne. */
async function feuilleDeDonnees(g: DonneesGraphique): Promise<Buffer> {
  const classeur = new ExcelJS.Workbook();
  const feuille = classeur.addWorksheet(FEUILLE);
  feuille.addRow(["", ...g.series.map((s) => s.nom)]);
  g.categories.forEach((c, k) => feuille.addRow([c, ...g.series.map((s) => s.valeurs[k])]));
  feuille.getColumn(1).width = 28;
  return Buffer.from(await classeur.xlsx.writeBuffer());
}

/** Le paragraphe qui porte le graphique, centré, à la place du repère. */
function dessin(rang: number, titre: string): string {
  return (
    `<w:p><w:pPr><w:keepNext/><w:jc w:val="center"/></w:pPr><w:r><w:drawing>` +
    `<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${LARGEUR}" cy="${HAUTEUR}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="${880000 + rang}" name="Graphique ${rang}" descr="${xml(titre)}"/><wp:cNvGraphicFramePr/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdSidGraphique${rang}"/>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

/**
 * Remplace chaque repère par son graphique. `graphiques[i]` est celui du
 * repère n° i + 1. Un repère sans graphique (ou l'inverse) est une erreur de
 * programme : le document ne partirait pas avec « @@SID-GRAPHIQUE-3@@ » imprimé.
 */
export async function insererGraphiques(buffer: Buffer, graphiques: DonneesGraphique[]): Promise<Buffer> {
  if (graphiques.length === 0) return buffer;
  const zip = new PizZip(buffer);
  let document = zip.file("word/document.xml")!.asText();
  let liens = zip.file("word/_rels/document.xml.rels")!.asText();
  let types = zip.file("[Content_Types].xml")!.asText();

  if (!/Extension="xlsx"/.test(types)) {
    types = types.replace(
      "</Types>",
      `<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/></Types>`
    );
  }

  for (let i = 0; i < graphiques.length; i++) {
    const rang = i + 1;
    const g = graphiques[i];
    const repere = repereGraphique(rang);
    const position = document.indexOf(repere);
    if (position < 0) throw new Error(`Graphique ${rang} (« ${g.titre} ») : son emplacement est introuvable dans le document.`);
    // Le paragraphe entier qui porte le repère : de son <w:p …> à son </w:p>.
    const avant = document.slice(0, position);
    const debut = Math.max(avant.lastIndexOf("<w:p>"), avant.lastIndexOf("<w:p "));
    const fin = document.indexOf("</w:p>", position) + "</w:p>".length;
    if (debut < 0 || fin < "</w:p>".length) throw new Error(`Graphique ${rang} : paragraphe du repère illisible.`);
    document = document.slice(0, debut) + dessin(rang, g.titre) + document.slice(fin);

    zip.file(`word/charts/chartSid${rang}.xml`, chartXml(g));
    zip.file(
      `word/charts/_rels/chartSid${rang}.xml.rels`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../embeddings/Graphique_SID_${rang}.xlsx"/>` +
        `</Relationships>`
    );
    zip.file(`word/embeddings/Graphique_SID_${rang}.xlsx`, await feuilleDeDonnees(g));
    liens = liens.replace(
      "</Relationships>",
      `<Relationship Id="rIdSidGraphique${rang}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/chartSid${rang}.xml"/></Relationships>`
    );
    types = types.replace(
      "</Types>",
      `<Override PartName="/word/charts/chartSid${rang}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`
    );
  }

  if (/@@SID-GRAPHIQUE-\d+@@/.test(document)) throw new Error("Un emplacement de graphique est resté sans graphique.");

  zip.file("word/document.xml", document);
  zip.file("word/_rels/document.xml.rels", liens);
  zip.file("[Content_Types].xml", types);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

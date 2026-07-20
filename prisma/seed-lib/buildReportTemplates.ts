/**
 * buildReportTemplates.ts — Génère templates/rapport_mensuel_DD.docx et
 * templates/rapport_mensuel_DA.docx à partir du dictionnaire de données.
 * ---------------------------------------------------------------------------
 * Reproduit la structure du canevas officiel (CANEVAS STAT MENOUA.doc fourni
 * par le DD) : en-tête bilingue République/Republic, 5 sections, un tableau
 * par tableau du canevas. Exigence explicite du DD : l'organisation
 * lignes/colonnes de CHAQUE tableau doit être identique au canevas papier —
 * voir canevasLayout.ts pour la description tableau par tableau, partagée
 * avec le moteur d'agrégation (src/server/export/rapport-docx.ts).
 *
 * Rapport DD : reproduit fidèlement chaque tableau (lignes = arrondissements
 * pour 1.1/1.2/2.1/2.2/2.5/2.6, tableau départemental unique sans colonne par
 * arrondissement pour 2.4/3.4/5.x, liste des établissements pour les
 * tableaux NOMINATIF, liste des événements déclarés pour les tableaux
 * EVENEMENT — avec colonne Arrondissement ajoutée pour la consolidation).
 * Rapport DA : fiche de collecte d'un seul arrondissement — valeur unique
 * (mois courant / mois précédent) pour les tableaux MATRICE, liste des
 * établissements/événements de CET arrondissement pour NOMINATIF/EVENEMENT
 * (identique à la fiche papier que le DA remplit lui-même).
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  VerticalMergeType,
  ShadingType,
} from "docx";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import path from "node:path";
import { CANEVAS_LAYOUTS, ColDef } from "./canevasLayout";

const prisma = new PrismaClient();

const ARR_CODES = ["DSC", "FOK", "FGT", "NKN", "PKM", "STC"] as const;
// Graphie exacte du canevas officiel (majuscules, sans accent ni tiret) — utilisée dans les
// tableaux générés pour rester identique au document papier (DSCHANG, FOKOUE, FONGO TONGO...).
const ARR_NOMS: Record<string, string> = {
  DSC: "DSCHANG",
  FOK: "FOKOUE",
  FGT: "FONGO TONGO",
  NKN: "NKONG NI",
  PKM: "PENKA MICHEL",
  STC: "SANTCHOU",
};

function cell(text: string, opts: { bold?: boolean; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold })] })],
  });
}

/** Cellule d'en-tête fusionnée (colonnes et/ou lignes) — en-têtes à 2/3 niveaux du canevas (2.6, 5.x). */
function cellMerged(text: string, opts: { bold?: boolean; columnSpan?: number; verticalMerge?: "restart" | "continue" } = {}): TableCell {
  return new TableCell({
    columnSpan: opts.columnSpan,
    verticalMerge: opts.verticalMerge === "restart" ? VerticalMergeType.RESTART : opts.verticalMerge === "continue" ? VerticalMergeType.CONTINUE : undefined,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: opts.bold })] })],
  });
}

function row(cells: string[], opts: { bold?: boolean } = {}): TableRow {
  return new TableRow({ children: cells.map((c) => cell(c, { bold: opts.bold })) });
}

function table(rows: TableRow[]): Table {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function headerBlock(): Table {
  const fr = [
    "RÉPUBLIQUE DU CAMEROUN",
    "Paix – Travail – Patrie",
    "RÉGION DE L'OUEST",
    "DÉPARTEMENT DE LA MENOUA",
    "DÉLÉGATION DÉPARTEMENTALE DE L'ÉLEVAGE,",
    "DES PÊCHES ET DES INDUSTRIES ANIMALES",
  ];
  const en = [
    "REPUBLIC OF CAMEROON",
    "Peace – Work – Fatherland",
    "WEST REGION",
    "MENOUA DIVISION",
    "DIVISIONAL DELEGATION OF LIVESTOCK,",
    "FISHERIES AND ANIMAL INDUSTRIES",
  ];
  const rows = fr.map(
    (line, i) =>
      new TableRow({
        children: [
          new TableCell({
            borders: NO_BORDERS,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: line, bold: i === 0, size: i === 0 ? 22 : 18 })] })],
          }),
          new TableCell({
            borders: NO_BORDERS,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: en[i], bold: i === 0, size: i === 0 ? 22 : 18 })] })],
          }),
        ],
      })
  );
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

const NO_BORDERS = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

function sectionTitle(numero: string): string | null {
  const n = numero.split(".")[0];
  const titres: Record<string, string> = {
    "1": "SECTION 1 : PRODUCTIONS ANIMALES ET HALIEUTIQUES",
    "2": "SECTION 2 : INDUSTRIES ANIMALES ET HALIEUTIQUES",
    "3": "SECTION 3 : SERVICES VÉTÉRINAIRES",
    "4": "SECTION 4 : IMPORT / EXPORT / TRANSIT / CIRCULATION DE BÉTAIL",
    "5": "SECTION 5 : COMMERCIALISATION DES ANIMAUX",
  };
  return titres[n] ?? null;
}

async function chargerTemplates() {
  return prisma.formTemplate.findMany({
    where: { actif: true },
    orderBy: { ordre: "asc" },
    include: { fields: { where: { actif: true }, orderBy: { ordre: "asc" } } },
  });
}

// ---------------------------------------------------------------------------
// Colonnes dynamiques (§ propositions de référentiel validées par le DD) —
// T11/T12/T17 : les espèces/volailles/poissons approuvés après le seed initial
// ne sont pas dans la liste statique de canevasLayout.ts ; on les ajoute en
// fin de tableau à partir des FormField réellement actifs en base, sans
// jamais modifier l'ordre/les colonnes du canevas d'origine.
// ---------------------------------------------------------------------------

function fusionnerColonnes(cols: ColDef[], fields: { code: string; libelle: string }[]): ColDef[] {
  const existants = new Set(cols.map((c) => c.code));
  const ajouts = fields.filter((f) => !existants.has(f.code)).map((f) => ({ code: f.code, label: f.libelle }));
  return [...cols, ...ajouts];
}

function fusionnerSousLignes(
  subRows: { label: string; cols: ColDef[] }[],
  fields: { code: string; libelle: string }[],
  prefixes: string[]
): { label: string; cols: ColDef[] }[] {
  return subRows.map((sr, i) => {
    const prefix = prefixes[i];
    const existants = new Set(sr.cols.map((c) => c.code));
    const ajouts = fields.filter((f) => f.code.startsWith(prefix) && !existants.has(f.code)).map((f) => ({ code: f.code, label: f.libelle }));
    return { ...sr, cols: [...sr.cols, ...ajouts] };
  });
}

const ESPECES_PISCICULTURE_INITIALES = new Set(["CLARIAS", "CARPE", "KANGA", "HEMICHROMIS", "TILAPIA"]);

/** Espèces halieutiques ajoutées après le seed initial (approuvées par le DD), sous forme [suffixe, libellé]. */
function especesPiscicultureSupplementaires(fields: { code: string; libelle: string }[]): [string, string][] {
  const trouve = new Map<string, string>();
  for (const f of fields) {
    const m = f.code.match(/^T17_ALEVINS_(.+)$/);
    if (m && !ESPECES_PISCICULTURE_INITIALES.has(m[1])) {
      trouve.set(m[1], f.libelle.replace(/\s*\(production d'alevins\)\s*$/i, ""));
    }
  }
  return Array.from(trouve.entries());
}

// ---------------------------------------------------------------------------
// Rendu DD — un tableau par mise en page canevas
// ---------------------------------------------------------------------------

function renderArrRows(cols: ColDef[], groups?: { label: string; span: number }[]): Table {
  const headerRows: TableRow[] = [];
  if (groups) {
    headerRows.push(
      new TableRow({
        children: [
          cellMerged("ARRONDISSEMENTS", { bold: true, verticalMerge: "restart" }),
          ...groups.map((g) => cellMerged(g.label, { bold: true, columnSpan: g.span })),
        ],
      })
    );
    headerRows.push(
      new TableRow({
        children: [cellMerged("", { verticalMerge: "continue" }), ...cols.map((c) => cell(c.label, { bold: true }))],
      })
    );
  } else {
    headerRows.push(row(["ARRONDISSEMENTS", ...cols.map((c) => c.label)], { bold: true }));
  }
  const rows = [...headerRows];
  for (const arr of ARR_CODES) {
    rows.push(row([ARR_NOMS[arr], ...cols.map((c) => `{${c.code}_${arr}}`)]));
  }
  // Champs texte (ex. Lieux) : jamais sommés, ligne de total laissée vide pour cette colonne.
  rows.push(row(["Total Mois Courant", ...cols.map((c) => (c.texte ? "" : `{${c.code}_TOTAL}`))], { bold: true }));
  rows.push(row(["Total Mois Précédent", ...cols.map((c) => (c.texte ? "" : `{${c.code}_TOTAL_PREC}`))]));
  return table(rows);
}

function renderArrRowsGrouped(subRows: { label: string; cols: ColDef[] }[]): Table {
  const colLabels = subRows[0].cols.map((c) => c.label);
  const rows = [row(["ARRONDISSEMENTS", "Catégorie", ...colLabels], { bold: true })];
  for (const arr of ARR_CODES) {
    subRows.forEach((sr, i) => {
      rows.push(row([i === 0 ? ARR_NOMS[arr] : "", sr.label, ...sr.cols.map((c) => `{${c.code}_${arr}}`)]));
    });
  }
  subRows.forEach((sr) => rows.push(row(["Total Mois Courant", sr.label, ...sr.cols.map((c) => `{${c.code}_TOTAL}`)], { bold: true })));
  subRows.forEach((sr) => rows.push(row(["Total Mois Précédent", sr.label, ...sr.cols.map((c) => `{${c.code}_TOTAL_PREC}`)])));
  return table(rows);
}

function renderDeptTable(templateCode: string, colHeaders: string[], rows_: { label: string; codes: (string | null)[] }[], showTotalRow?: boolean): Table {
  const rows = [row(["", ...colHeaders], { bold: true })];
  for (const r of rows_) {
    rows.push(row([r.label, ...r.codes.map((c) => (c ? `{${c}_TOTAL}` : ""))]));
  }
  if (showTotalRow) {
    rows.push(row(["Total Mois Courant", ...colHeaders.map((_, j) => `{${templateCode}_COLTOTAL_${j}}`)], { bold: true }));
    rows.push(row(["Total Mois Précédent", ...colHeaders.map((_, j) => `{${templateCode}_COLTOTAL_${j}_PREC}`)]));
  }
  return table(rows);
}

/** En-tête à 2 niveaux du canevas (3.4) : Produit/Unité fusionnés verticalement, "Mois Courant"/"Mois
 *  Précédent" fusionnés horizontalement sur les sous-colonnes (Quantité Inspectée/Quantité Saisie). */
function renderDeptTablePrecHeader(colHeaders: string[]): TableRow[] {
  return [
    new TableRow({
      children: [
        cellMerged("Produit", { bold: true, verticalMerge: "restart" }),
        cellMerged("Unité de Mesure", { bold: true, verticalMerge: "restart" }),
        cellMerged("Mois Courant", { bold: true, columnSpan: colHeaders.length }),
        cellMerged("Mois Précédent", { bold: true, columnSpan: colHeaders.length }),
      ],
    }),
    new TableRow({
      children: [
        cellMerged("", { verticalMerge: "continue" }),
        cellMerged("", { verticalMerge: "continue" }),
        ...colHeaders.map((h) => cell(h, { bold: true })),
        ...colHeaders.map((h) => cell(h, { bold: true })),
      ],
    }),
  ];
}

function renderDeptTablePrec(colHeaders: string[], rows_: { label: string; unite?: string; codes: (string | null)[] }[]): Table {
  const rows = renderDeptTablePrecHeader(colHeaders);
  for (const r of rows_) {
    const moisCourant = r.codes.map((c) => (c ? `{${c}_TOTAL}` : ""));
    const moisPrecedent = r.codes.map((c) => (c ? `{${c}_TOTAL_PREC}` : ""));
    rows.push(row([r.label, r.unite ?? "", ...moisCourant, ...moisPrecedent]));
  }
  return table(rows);
}

/** Section 5 (commercialisation) : en-tête à 3 niveaux du canevas — Catégories/Prix moyen fusionnés
 *  verticalement, "Nombre (Mois courant)" scindé en MIS EN VENTE/VENDUS puis en 3 décades chacun. */
function renderCommercialisationHeader(): TableRow[] {
  return [
    new TableRow({
      children: [
        cellMerged("Catégories", { bold: true, verticalMerge: "restart" }),
        cellMerged("Nombre (Mois Courant)", { bold: true, columnSpan: 6 }),
        cellMerged("Prix moyen", { bold: true, verticalMerge: "restart" }),
      ],
    }),
    new TableRow({
      children: [
        cellMerged("", { verticalMerge: "continue" }),
        cellMerged("MIS EN VENTE", { bold: true, columnSpan: 3 }),
        cellMerged("VENDUS", { bold: true, columnSpan: 3 }),
        cellMerged("", { verticalMerge: "continue" }),
      ],
    }),
    new TableRow({
      children: [
        cellMerged("", { verticalMerge: "continue" }),
        ...["Décade 1", "Décade 2", "Décade 3", "Décade 1", "Décade 2", "Décade 3"].map((d) => cell(d, { bold: true })),
        cellMerged("", { verticalMerge: "continue" }),
      ],
    }),
  ];
}

function renderCommercialisation(templateCode: string, rows_: { label: string; codes: string[] }[]): Table {
  const rows = renderCommercialisationHeader();
  for (const r of rows_) rows.push(row([r.label, ...r.codes.map((c) => `{${c}_TOTAL}`)]));
  rows.push(row(["Total Mois Courant", ...Array.from({ length: 7 }, (_, j) => `{${templateCode}_COLTOTAL_${j}}`)], { bold: true }));
  rows.push(row(["Total Mois Précédent", ...Array.from({ length: 7 }, (_, j) => `{${templateCode}_COLTOTAL_${j}_PREC}`)]));
  return table(rows);
}

function renderCommercialisationDA(templateCode: string, rows_: { label: string; codes: string[] }[]): Table {
  const rows = renderCommercialisationHeader();
  for (const r of rows_) rows.push(row([r.label, ...r.codes.map((c) => `{${c}}`)]));
  rows.push(row(["Total Mois Courant", ...Array.from({ length: 7 }, (_, j) => `{${templateCode}_COLTOTAL_${j}}`)], { bold: true }));
  rows.push(row(["Total Mois Précédent", ...Array.from({ length: 7 }, (_, j) => `{${templateCode}_COLTOTAL_${j}_PREC}`)]));
  return table(rows);
}

// Le canevas affiche littéralement DEUX colonnes "Pêche maritime artisanale et semi-Industrielle"
// consécutives (confirmé sur le XML du .doc source : deux cellules distinctes, sans fusion) alors
// que le dictionnaire ne porte qu'un seul champ par espèce pour la pêche maritime. Faute d'une
// source de données distincte pour les 2 colonnes, la même valeur est reproduite dans les deux —
// structure identique au canevas, mais à confirmer avec le DD si une vraie ventilation existe.
function renderT16(): Table {
  const rows = [
    row(["Espèces", "Pêche continentale", "Pêche maritime artisanale et semi-industrielle", "Pêche maritime artisanale et semi-industrielle", "Total"], { bold: true }),
  ];
  rows.push(row(["POISSONS", "{T16_POISSON_CONTINENTALE_TOTAL}", "{T16_POISSON_MARITIME_TOTAL}", "{T16_POISSON_MARITIME_TOTAL}", "{T16_POISSON_TOTAL}"]));
  rows.push(row(["CREVETTE", "{T16_CREVETTE_CONTINENTALE_TOTAL}", "{T16_CREVETTE_MARITIME_TOTAL}", "{T16_CREVETTE_MARITIME_TOTAL}", "{T16_CREVETTE_TOTAL}"]));
  rows.push(row(["Total mois courant", "{T16_ROWTOTAL_CONTINENTALE}", "{T16_ROWTOTAL_MARITIME}", "{T16_ROWTOTAL_MARITIME}", "{T16_ROWTOTAL_TOTAL}"], { bold: true }));
  rows.push(row(["Total mois précédent", "{T16_ROWTOTAL_CONTINENTALE_PREC}", "{T16_ROWTOTAL_MARITIME_PREC}", "{T16_ROWTOTAL_MARITIME_PREC}", "{T16_ROWTOTAL_TOTAL_PREC}"]));
  return table(rows);
}

function renderT17(especesSupp: [string, string][] = []): Table[] {
  const t1 = table([
    row(["Nombre d'étang / Cages", "{T17_NB_ETANGS_TOTAL}"]),
    row(["Superficie total (en m²)", "{T17_SUPERFICIE_TOTAL}"]),
  ]);
  const especes: [string, string][] = [
    ["CLARIAS", "CLARIAS"],
    ["CARPE", "CARPES"],
    ["KANGA", "KANGA"],
    ["HEMICHROMIS", "HEMICHROMIS"],
    ["TILAPIA", "TILAPIA"],
    ...especesSupp,
  ];
  const t2 = table([
    row(["Espèces", "Production des alevins (en unité)", "Production de poissons (en tonnes)"], { bold: true }),
    ...especes.map(([suffix, label]) => row([label, `{T17_ALEVINS_${suffix}_TOTAL}`, `{T17_POISSON_${suffix}_TOTAL}`])),
    row(["Total Mois Courant", "{T17_ROWTOTAL_ALEVINS}", "{T17_ROWTOTAL_POISSON}"], { bold: true }),
    row(["Total Mois Précédent", "{T17_ROWTOTAL_ALEVINS_PREC}", "{T17_ROWTOTAL_POISSON_PREC}"]),
  ]);
  return [t1, t2];
}

/** Cellule de boucle docxtemplater : le tag d'ouverture/fermeture encadre la ligne de tableau entière. */
function loopRow(loopTag: string, values: string[], open: boolean, close: boolean): TableRow {
  const cells = values.map((v) => v);
  if (open) cells[0] = `{#${loopTag}}${cells[0]}`;
  if (close) cells[cells.length - 1] = `${cells[cells.length - 1]}{/${loopTag}}`;
  return new TableRow({ children: cells.map((c) => cell(c)) });
}

function renderNominatifLoop(templateCode: string, cols: ColDef[], withArr: boolean): Table {
  const headerLabels = [...(withArr ? ["Arrondissement"] : []), "Nom", "Localité", ...cols.map((c) => c.label)];
  const dataPlaceholders = [...(withArr ? ["{ARR}"] : []), "{NOM}", "{LOCALITE}", ...cols.map((c) => `{${c.code}}`)];
  const rows = [row(headerLabels, { bold: true }), loopRow(templateCode, dataPlaceholders, true, true)];
  const leadingBlanks = Array((withArr ? 1 : 0) + 1).fill(""); // Nom + Localité (+ Arrondissement) moins la cellule de libellé
  rows.push(row(["TOTAL MOIS COURANT", ...leadingBlanks, ...cols.map((c) => `{${c.code}_TOTAL}`)], { bold: true }));
  rows.push(row(["TOTAL MOIS PRÉCÉDENT", ...leadingBlanks, ...cols.map((c) => `{${c.code}_TOTAL_PREC}`)]));
  return table(rows);
}

function renderEvenementLoop(loopTag: string, cols: { key: string; label: string; numeric?: boolean }[], withArr: boolean, extraCols: string[] = []): Table {
  const headerLabels = [...(withArr ? ["Arrondissement"] : []), ...cols.map((c) => c.label), ...extraCols];
  const dataPlaceholders = [...(withArr ? ["{ARR}"] : []), ...cols.map((c) => `{${c.key}}`), ...extraCols.map(() => "")];
  const rows = [row(headerLabels, { bold: true }), loopRow(loopTag, dataPlaceholders, true, true)];
  const totalCells = (prec: boolean) =>
    cols.map((c) => (c.numeric ? `{${loopTag}_${c.key}_TOTAL${prec ? "_PREC" : ""}}` : ""));
  rows.push(row([...(withArr ? [""] : []), "TOTAL MOIS COURANT", ...totalCells(false).slice(1), ...extraCols.map(() => "")], { bold: true }));
  rows.push(row([...(withArr ? [""] : []), "TOTAL MOIS PRÉCÉDENT", ...totalCells(true).slice(1), ...extraCols.map(() => "")]));
  return table(rows);
}

/** Rapport DD uniquement : la même liste d'événements que renderEvenementLoop, mais groupée par
 *  arrondissement (en-tête fusionné/ombré + sous-total) au lieu d'une colonne Arrondissement répétée
 *  à plat sur chaque ligne — demande explicite du chef de section vétérinaire, qui doit vérifier
 *  minutieusement chaque arrondissement contre le terrain ; une longue liste plate rendait cette
 *  vérification illisible. Boucle imbriquée docxtemplater : {#loopTag} sur le groupe (arrondissement),
 *  {#items} sur les événements de ce groupe — voir evenementLoopRowsGroupes dans rapport-docx.ts. */
function renderEvenementLoopGroupe(loopTag: string, cols: { key: string; label: string; numeric?: boolean }[]): Table {
  const nCols = cols.length;
  const rows: TableRow[] = [row(cols.map((c) => c.label), { bold: true })];

  rows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: nCols,
          shading: { type: ShadingType.CLEAR, fill: "E8E8E8" },
          children: [new Paragraph({ children: [new TextRun({ text: `{#${loopTag}}{ARR_NOM}`, bold: true })] })],
        }),
      ],
    })
  );

  rows.push(loopRow("items", cols.map((c) => `{${c.key}}`), true, true));

  const sousTotalCells = cols.map((c, i) => (i === 0 ? "Sous-total {ARR_NOM}" : c.numeric ? `{${c.key}_SOUSTOTAL}` : ""));
  rows.push(
    new TableRow({
      children: sousTotalCells.map((text, i) => cell(i === nCols - 1 ? `${text}{/${loopTag}}` : text, { bold: true })),
    })
  );

  const totalCells = (prec: boolean) => cols.map((c) => (c.numeric ? `{${loopTag}_${c.key}_TOTAL${prec ? "_PREC" : ""}}` : ""));
  rows.push(row(["TOTAL MOIS COURANT", ...totalCells(false).slice(1)], { bold: true }));
  rows.push(row(["TOTAL MOIS PRÉCÉDENT", ...totalCells(true).slice(1)]));

  return table(rows);
}

// ---------------------------------------------------------------------------
// Rendu DA — fiche de collecte d'un seul arrondissement, mêmes colonnes que le
// canevas (une seule ligne de données au lieu de 6, plus "Mois Précédent").
// ---------------------------------------------------------------------------

function renderArrRowsDA(cols: ColDef[], groups?: { label: string; span: number }[]): Table {
  const headerRows: TableRow[] = [];
  if (groups) {
    headerRows.push(
      new TableRow({
        children: [
          cellMerged("ARRONDISSEMENT", { bold: true, verticalMerge: "restart" }),
          ...groups.map((g) => cellMerged(g.label, { bold: true, columnSpan: g.span })),
        ],
      })
    );
    headerRows.push(
      new TableRow({
        children: [cellMerged("", { verticalMerge: "continue" }), ...cols.map((c) => cell(c.label, { bold: true }))],
      })
    );
  } else {
    headerRows.push(row(["ARRONDISSEMENT", ...cols.map((c) => c.label)], { bold: true }));
  }
  const rows = [...headerRows];
  rows.push(row(["{ARRONDISSEMENT_NOM_CANEVAS}", ...cols.map((c) => `{${c.code}}`)]));
  rows.push(row(["Mois Précédent", ...cols.map((c) => (c.texte ? "" : `{${c.code}_PREC}`))]));
  return table(rows);
}

function renderArrRowsGroupedDA(subRows: { label: string; cols: ColDef[] }[]): Table {
  const colLabels = subRows[0].cols.map((c) => c.label);
  const rows = [row(["ARRONDISSEMENT", "Catégorie", ...colLabels], { bold: true })];
  subRows.forEach((sr, i) => rows.push(row([i === 0 ? "{ARRONDISSEMENT_NOM_CANEVAS}" : "", sr.label, ...sr.cols.map((c) => `{${c.code}}`)])));
  subRows.forEach((sr) => rows.push(row(["Mois Précédent", sr.label, ...sr.cols.map((c) => `{${c.code}_PREC}`)])));
  return table(rows);
}

function renderDeptTableDA(templateCode: string, colHeaders: string[], rows_: { label: string; codes: (string | null)[] }[], showTotalRow?: boolean): Table {
  const rows = [row(["", ...colHeaders], { bold: true })];
  for (const r of rows_) {
    rows.push(row([r.label, ...r.codes.map((c) => (c ? `{${c}}` : ""))]));
  }
  if (showTotalRow) {
    rows.push(row(["Total Mois Courant", ...colHeaders.map((_, j) => `{${templateCode}_COLTOTAL_${j}}`)], { bold: true }));
    rows.push(row(["Total Mois Précédent", ...colHeaders.map((_, j) => `{${templateCode}_COLTOTAL_${j}_PREC}`)]));
  }
  return table(rows);
}

function renderDeptTablePrecDA(colHeaders: string[], rows_: { label: string; unite?: string; codes: (string | null)[] }[]): Table {
  const rows = renderDeptTablePrecHeader(colHeaders);
  for (const r of rows_) {
    const moisCourant = r.codes.map((c) => (c ? `{${c}}` : ""));
    const moisPrecedent = r.codes.map((c) => (c ? `{${c}_PREC}` : ""));
    rows.push(row([r.label, r.unite ?? "", ...moisCourant, ...moisPrecedent]));
  }
  return table(rows);
}

function renderT16DA(): Table {
  const rows = [
    row(["Espèces", "Pêche continentale", "Pêche maritime artisanale et semi-industrielle", "Pêche maritime artisanale et semi-industrielle", "Total"], { bold: true }),
  ];
  rows.push(row(["POISSONS", "{T16_POISSON_CONTINENTALE}", "{T16_POISSON_MARITIME}", "{T16_POISSON_MARITIME}", "{T16_POISSON_TOTAL}"]));
  rows.push(row(["CREVETTE", "{T16_CREVETTE_CONTINENTALE}", "{T16_CREVETTE_MARITIME}", "{T16_CREVETTE_MARITIME}", "{T16_CREVETTE_TOTAL}"]));
  rows.push(row(["Total mois courant", "{T16_ROWTOTAL_CONTINENTALE}", "{T16_ROWTOTAL_MARITIME}", "{T16_ROWTOTAL_MARITIME}", "{T16_ROWTOTAL_TOTAL}"], { bold: true }));
  rows.push(row(["Total mois précédent", "{T16_ROWTOTAL_CONTINENTALE_PREC}", "{T16_ROWTOTAL_MARITIME_PREC}", "{T16_ROWTOTAL_MARITIME_PREC}", "{T16_ROWTOTAL_TOTAL_PREC}"]));
  return table(rows);
}

function renderT17DA(especesSupp: [string, string][] = []): Table[] {
  const t1 = table([
    row(["Nombre d'étang / Cages", "{T17_NB_ETANGS}"]),
    row(["Superficie total (en m²)", "{T17_SUPERFICIE}"]),
  ]);
  const especes: [string, string][] = [
    ["CLARIAS", "CLARIAS"],
    ["CARPE", "CARPES"],
    ["KANGA", "KANGA"],
    ["HEMICHROMIS", "HEMICHROMIS"],
    ["TILAPIA", "TILAPIA"],
    ...especesSupp,
  ];
  const t2 = table([
    row(["Espèces", "Production des alevins (en unité)", "Production de poissons (en tonnes)"], { bold: true }),
    ...especes.map(([suffix, label]) => row([label, `{T17_ALEVINS_${suffix}}`, `{T17_POISSON_${suffix}}`])),
    row(["Total Mois Courant", "{T17_ROWTOTAL_ALEVINS}", "{T17_ROWTOTAL_POISSON}"], { bold: true }),
    row(["Total Mois Précédent", "{T17_ROWTOTAL_ALEVINS_PREC}", "{T17_ROWTOTAL_POISSON_PREC}"]),
  ]);
  return [t1, t2];
}

type TemplateWithRows = Awaited<ReturnType<typeof chargerTemplates>>[number];

/** Rendu d'un tableau départemental (DD ou "exact canevas") selon sa mise en page. */
function renderCanevasTable(
  t: TemplateWithRows,
  layout: NonNullable<(typeof CANEVAS_LAYOUTS)[string]>,
  loopWithArr: boolean,
  groupePourLisibilite = false
): Table[] {
  switch (layout.kind) {
    case "ARR_ROWS":
      return [renderArrRows(t.code === "T11" ? fusionnerColonnes(layout.cols, t.fields) : layout.cols, layout.groups)];
    case "ARR_ROWS_GROUPED":
      return [renderArrRowsGrouped(t.code === "T12" ? fusionnerSousLignes(layout.subRows, t.fields, ["T12_VOL_MOD_", "T12_VOL_TRAD_"]) : layout.subRows)];
    case "DEPT_TABLE":
      return [renderDeptTable(t.code, layout.colHeaders, layout.rows, layout.showTotalRow)];
    case "DEPT_TABLE_PREC":
      return [renderDeptTablePrec(layout.colHeaders, layout.rows)];
    case "COMMERCIALISATION":
      return [renderCommercialisation(t.code, layout.rows)];
    case "NOMINATIF_LOOP":
      return [renderNominatifLoop(t.code, layout.cols, loopWithArr)];
    case "EVENEMENT_LOOP":
      return [groupePourLisibilite ? renderEvenementLoopGroupe(t.code, layout.cols) : renderEvenementLoop(t.code, layout.cols, loopWithArr)];
    case "T16_SPECIAL":
      return [renderT16()];
    case "T17_SPECIAL":
      return renderT17(especesPiscicultureSupplementaires(t.fields));
  }
}

/** Rendu d'un tableau pour le rapport DA (une seule ligne de données : leur arrondissement). */
function renderCanevasTableDA(t: TemplateWithRows, layout: NonNullable<(typeof CANEVAS_LAYOUTS)[string]>): Table[] {
  switch (layout.kind) {
    case "ARR_ROWS":
      return [renderArrRowsDA(t.code === "T11" ? fusionnerColonnes(layout.cols, t.fields) : layout.cols, layout.groups)];
    case "ARR_ROWS_GROUPED":
      return [renderArrRowsGroupedDA(t.code === "T12" ? fusionnerSousLignes(layout.subRows, t.fields, ["T12_VOL_MOD_", "T12_VOL_TRAD_"]) : layout.subRows)];
    case "DEPT_TABLE":
      return [renderDeptTableDA(t.code, layout.colHeaders, layout.rows, layout.showTotalRow)];
    case "DEPT_TABLE_PREC":
      return [renderDeptTablePrecDA(layout.colHeaders, layout.rows)];
    case "COMMERCIALISATION":
      return [renderCommercialisationDA(t.code, layout.rows)];
    case "NOMINATIF_LOOP":
      return [renderNominatifLoop(t.code, layout.cols, false)];
    case "EVENEMENT_LOOP":
      return [renderEvenementLoop(t.code, layout.cols, false)];
    case "T16_SPECIAL":
      return [renderT16DA()];
    case "T17_SPECIAL":
      return renderT17DA(especesPiscicultureSupplementaires(t.fields));
  }
}

function buildDoc(mode: "DD" | "DA", templates: Awaited<ReturnType<typeof chargerTemplates>>): Document {
  const children: (Paragraph | Table)[] = [];

  children.push(headerBlock());
  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text:
            mode === "DD"
              ? "RAPPORT MENSUEL DÉPARTEMENTAL DES STATISTIQUES"
              : "FICHE DE COLLECTE DES STATISTIQUES MENSUELLES",
          bold: true,
        }),
      ],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "Région : OUEST — Département : MENOUA" })],
    })
  );
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text:
            mode === "DD"
              ? "Mois : {MOIS_LIBELLE}   Année : {ANNEE}   —   Généré le {DATE_GENERATION}"
              : "Arrondissement : {ARRONDISSEMENT_NOM}   —   Mois : {MOIS_LIBELLE}   Année : {ANNEE}",
        }),
      ],
    })
  );
  children.push(new Paragraph({ text: "" }));

  let derniereSection: string | null = null;

  for (const t of templates) {
    const titreSection = sectionTitle(t.numero);
    if (titreSection && titreSection !== derniereSection) {
      derniereSection = titreSection;
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: titreSection, bold: true })] }));
    }

    children.push(new Paragraph({ children: [new TextRun({ text: `Tableau ${t.numero} : ${t.titre}`, bold: true, italics: true })] }));

    const layout = CANEVAS_LAYOUTS[t.code];
    if (!layout) throw new Error(`Aucune mise en page canevas définie pour ${t.code}`);

    const tables = mode === "DA" ? renderCanevasTableDA(t, layout) : renderCanevasTable(t, layout, true, true);
    for (const tb of tables) children.push(tb);
    children.push(new Paragraph({ text: "" }));
  }

  if (mode === "DD") {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "SYNTHÈSES D'ANALYSE DES SECTIONS", bold: true })] }));
    for (const code of ["BAC", "PSA", "SSV", "SPAIH"]) {
      children.push(new Paragraph({ children: [new TextRun({ text: code, bold: true })] }));
      children.push(new Paragraph({ children: [new TextRun({ text: `{ANALYSE_${code}}` })] }));
      children.push(new Paragraph({ text: "" }));
    }
  }

  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: mode === "DD" ? "Le Délégué Départemental" : "Le Délégué d'Arrondissement" })],
    })
  );

  return new Document({ sections: [{ children }] });
}

/**
 * Rapport "exact canevas" — reproduction structurelle littérale du document
 * transmis par le DD (CANEVAS STAT MENOUA.doc), sans les ajouts du rapport DD
 * enrichi (pas de synthèses d'analyse, pas de colonne Arrondissement sur les
 * tableaux NOMINATIF/EVENEMENT — seul le tableau 3.3, qui regroupe déjà par
 * DAEPIA dans le canevas, en conserve une). Utilise les mêmes données
 * consolidées au niveau départemental que le rapport DD (genererPayloadDD).
 */
function buildDocExact(templates: Awaited<ReturnType<typeof chargerTemplates>>): Document {
  const children: (Paragraph | Table)[] = [];

  children.push(headerBlock());
  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "FICHE DE COLLECTE DES STATISTIQUES MENSUELLES", bold: true })],
    })
  );
  children.push(new Paragraph({ children: [new TextRun({ text: "REGION : OUEST                                                                    Visa   DDEPIA" })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: "DEPARTEMENT : MENOUA" })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: "MOIS : {MOIS_LIBELLE}          ANNEE : {ANNEE}" })] }));
  children.push(new Paragraph({ text: "" }));

  let derniereSection: string | null = null;

  for (const t of templates) {
    const titreSection = sectionTitle(t.numero);
    if (titreSection && titreSection !== derniereSection) {
      derniereSection = titreSection;
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: titreSection, bold: true })] }));
    }

    children.push(new Paragraph({ children: [new TextRun({ text: `Tableau ${t.numero} : ${t.titre}.`, bold: true })] }));

    const layout = CANEVAS_LAYOUTS[t.code];
    if (!layout) throw new Error(`Aucune mise en page canevas définie pour ${t.code}`);
    const loopWithArr = t.code === "T33";
    for (const tb of renderCanevasTable(t, layout, loopWithArr)) children.push(tb);
    children.push(new Paragraph({ text: "" }));

    if (t.code === "T44") {
      // Tableau XVI : doublon du 4.3 (Transit) présent tel quel dans le canevas officiel.
      children.push(new Paragraph({ children: [new TextRun({ text: "Tableau XVI : Transit", bold: true })] }));
      const t43Layout = CANEVAS_LAYOUTS.T43;
      if (t43Layout.kind === "EVENEMENT_LOOP") {
        children.push(renderEvenementLoop("T43", t43Layout.cols, true, ["Observations"]));
      }
      children.push(new Paragraph({ text: "" }));
    }
  }

  children.push(new Paragraph({ text: "" }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: "Le Délégué Départemental" })],
    })
  );
  children.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "(é)" })] }));

  return new Document({ sections: [{ children }] });
}

async function main() {
  const templates = await chargerTemplates();
  const outDir = path.join(process.cwd(), "templates");
  await fs.mkdir(outDir, { recursive: true });

  const dd = buildDoc("DD", templates);
  await fs.writeFile(path.join(outDir, "rapport_mensuel_DD.docx"), await Packer.toBuffer(dd));

  const da = buildDoc("DA", templates);
  await fs.writeFile(path.join(outDir, "rapport_mensuel_DA.docx"), await Packer.toBuffer(da));

  const exact = buildDocExact(templates);
  await fs.writeFile(path.join(outDir, "rapport_mensuel_exact.docx"), await Packer.toBuffer(exact));

  console.log("Templates générés : rapport_mensuel_DD.docx, rapport_mensuel_DA.docx, rapport_mensuel_exact.docx");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

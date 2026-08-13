/**
 * Rendu .docx d'une section du canevas trimestriel.
 *
 * Le rendu est PILOTÉ PAR LA DESCRIPTION, jamais par les données : le nombre de
 * colonnes, leur intitulé et les libellés de ligne viennent du canevas, et
 * uniquement de lui. Les valeurs se contentent de remplir des cases déjà
 * dessinées. Si le SID n'a pas la donnée, la case reste vide — comme sur la
 * fiche papier.
 *
 * C'est l'inverse de la première tentative, qui dessinait les tableaux à partir
 * des champs du SID et produisait un document que le canevas ne reconnaissait
 * pas.
 */
import {
  Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel,
  WidthType, BorderStyle, AlignmentType,
} from "docx";
import { type Bloc, type ContexteCanevas, type SectionCanevas, resoudre } from "./types";

/**
 * Fournit la valeur d'une case. Renvoie `null` quand le SID ne porte pas la
 * donnée — la case est alors laissée vide, jamais remplie d'un zéro inventé.
 */
export type FournisseurValeur = (params: {
  numeroTableau: number | null;
  ligne: string;
  colonne: string;
  indexColonne: number;
}) => string | null;

/** Aucune donnée : toutes les cases restent vides. */
export const AUCUNE_VALEUR: FournisseurValeur = () => null;

const BORDURES = {
  top: { style: BorderStyle.SINGLE, size: 1 },
  bottom: { style: BorderStyle.SINGLE, size: 1 },
  left: { style: BorderStyle.SINGLE, size: 1 },
  right: { style: BorderStyle.SINGLE, size: 1 },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
  insideVertical: { style: BorderStyle.SINGLE, size: 1 },
};

function cellule(texte: string, o: { gras?: boolean; fond?: string; droite?: boolean } = {}): TableCell {
  return new TableCell({
    shading: o.fond ? { fill: o.fond } : undefined,
    children: [
      new Paragraph({
        alignment: o.droite ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [new TextRun({ text: texte, bold: o.gras, size: 18 })],
      }),
    ],
  });
}

/** Colonnes effectives d'un tableau, jetons de période résolus. */
export function colonnesDe(bloc: Extract<Bloc, { type: "tableau" }>, ctx: ContexteCanevas): string[] {
  if (bloc.kind === "arrondissements") {
    return [bloc.enteteLibelle, ...ctx.arrondissements, `TOTAL ${ctx.periodeCourt}`, `TOTAL ${ctx.periodeCourtN1}`];
  }
  return bloc.entetes.map((e) => resoudre(e, ctx));
}

function rendreTableau(
  bloc: Extract<Bloc, { type: "tableau" }>,
  ctx: ContexteCanevas,
  valeur: FournisseurValeur
): (Paragraph | Table)[] {
  const colonnes = colonnesDe(bloc, ctx);
  const lignes = bloc.lignes.map((l) => resoudre(l, ctx));

  const entete = new TableRow({
    tableHeader: true,
    children: colonnes.map((c) => cellule(c, { gras: true, fond: "E8E8E8" })),
  });

  const corps = lignes.map((lib) => {
    const estTotal = /^TOTAL|^ÉCART/i.test(lib);
    return new TableRow({
      children: colonnes.map((col, i) => {
        if (i === 0) return cellule(lib, { gras: estTotal });
        const v = valeur({ numeroTableau: bloc.numero, ligne: lib, colonne: col, indexColonne: i });
        return cellule(v ?? "", { gras: estTotal, droite: true });
      }),
    });
  });

  const titre = bloc.numero == null
    ? bloc.titre
    : `Tableau n° ${bloc.numero} : ${bloc.titre}`;

  return [
    new Paragraph({ children: [new TextRun({ text: titre, bold: true, italics: true, size: 20 })] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDURES, rows: [entete, ...corps] }),
    new Paragraph({ text: "" }),
  ];
}

/**
 * Texte d'une zone analytique. `textes` porte ce que l'émetteur a validé ; à
 * défaut, la consigne du canevas est rappelée en gris, entre crochets, comme
 * dans le document officiel — le rédacteur voit ainsi ce qui est attendu.
 */
function rendreZoneTexte(
  bloc: Extract<Bloc, { type: "zoneTexte" }>,
  textes: Map<string, string>
): Paragraph[] {
  const saisi = textes.get(bloc.cle);
  if (saisi && saisi.trim()) {
    return [new Paragraph({ children: [new TextRun({ text: saisi.trim(), size: 20 })] }), new Paragraph({ text: "" })];
  }
  return [
    new Paragraph({
      children: [new TextRun({ text: `[ ${bloc.consigne} ]`, italics: true, color: "808080", size: 18 })],
    }),
    new Paragraph({ text: "" }),
  ];
}

const NIVEAUX = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const;

export interface OptionsRendu {
  ctx: ContexteCanevas;
  /** Valeurs des cases. Par défaut : aucune. */
  valeur?: FournisseurValeur;
  /** Textes analytiques déjà validés, par clé de zone. */
  textes?: Map<string, string>;
}

/** Rend une section complète du canevas. */
export function rendreSection(section: SectionCanevas, o: OptionsRendu): (Paragraph | Table)[] {
  const valeur = o.valeur ?? AUCUNE_VALEUR;
  const textes = o.textes ?? new Map<string, string>();
  const sortie: (Paragraph | Table)[] = [];

  for (const bloc of section.blocs) {
    if (bloc.type === "titre") {
      sortie.push(
        new Paragraph({
          heading: NIVEAUX[bloc.niveau],
          children: [new TextRun({ text: bloc.texte, bold: true })],
        })
      );
    } else if (bloc.type === "zoneTexte") {
      sortie.push(...rendreZoneTexte(bloc, textes));
    } else {
      sortie.push(...rendreTableau(bloc, o.ctx, valeur));
    }
  }
  return sortie;
}

/** Compte ce que la section contient — sert aux tests de conformité. */
export function inventaireSection(section: SectionCanevas, ctx: ContexteCanevas) {
  const tableaux = section.blocs.filter((b): b is Extract<Bloc, { type: "tableau" }> => b.type === "tableau");
  return {
    titres: section.blocs.filter((b) => b.type === "titre").length,
    zonesTexte: section.blocs.filter((b) => b.type === "zoneTexte").length,
    tableaux: tableaux.length,
    detail: tableaux.map((t) => ({
      numero: t.numero,
      titre: t.titre,
      colonnes: colonnesDe(t, ctx).length,
      lignes: t.lignes.length,
      entetes: colonnesDe(t, ctx),
    })),
  };
}

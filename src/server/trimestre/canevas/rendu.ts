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
  WidthType, BorderStyle, AlignmentType, SimpleField, TableOfContents,
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

/**
 * Légende d'un tableau, avec numérotation AUTOMATIQUE.
 *
 * Le canevas officiel n'écrit jamais le numéro en dur : il pose un champ Word
 * `SEQ Tableau \* ARABIC`, présent 72 fois dans le document. C'est ce champ qui
 * fait que les tableaux se renumérotent seuls quand on en insère un, et surtout
 * c'est lui que `TOC \a "Tableau"` collecte pour bâtir la liste des tableaux.
 * Écrire « Tableau n° 7 » en clair produirait un document où la liste des
 * tableaux resterait vide.
 *
 * Le style « Caption » est celui que Word nomme Légende : sans lui, la légende
 * n'entre pas dans la liste.
 */
export function legendeTableau(titre: string, numeroAttendu: number | null): Paragraph {
  return new Paragraph({
    style: "Caption",
    children: [
      new TextRun({ text: "Tableau n° ", bold: true }),
      // La valeur affichée avant recalcul par Word : le numéro connu de la
      // description, pour qu'un lecteur qui n'actualise pas les champs voie
      // tout de même un nombre cohérent.
      new SimpleField("SEQ Tableau \\* ARABIC", numeroAttendu == null ? undefined : String(numeroAttendu)),
      new TextRun({ text: ` : ${titre}`, bold: true }),
    ],
  });
}

/**
 * Les trois champs automatiques du canevas, dans son ordre :
 * sommaire, liste des tableaux, liste des graphiques.
 * Word les remplit à l'ouverture du document (Ctrl+A puis F9).
 */
export function champsAutomatiques(): (Paragraph | TableOfContents)[] {
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "SOMMAIRE", bold: true })] }),
    new TableOfContents("Sommaire", { hyperlink: true, headingStyleRange: "1-4" }),
    new Paragraph({ text: "" }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "LISTE DES TABLEAUX", bold: true })] }),
    new TableOfContents("Liste des tableaux", { hyperlink: true, captionLabel: "Tableau" }),
    new Paragraph({ text: "" }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "LISTE DES GRAPHIQUES", bold: true })] }),
    new TableOfContents("Liste des graphiques", { hyperlink: true, captionLabel: "Graphique" }),
    new Paragraph({ text: "" }),
  ];
}

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
  // Même jeton que pour les lignes : un tableau « libre » peut lui aussi
  // porter une colonne par arrondissement — le tableau 13 des recettes en est.
  return bloc.entetes
    .flatMap((e) => (e === "{ARRONDISSEMENTS}" ? ctx.arrondissements : [e]))
    .map((e) => resoudre(e, ctx));
}

/**
 * Libellés de ligne effectifs, jetons résolus.
 *
 * `{ARRONDISSEMENTS}` se déplie en une ligne par arrondissement. Les nommer
 * dans la description figerait le canevas sur la Menoua ; le jour où le SID
 * servira un autre département, la liste viendra de la base sans qu'on touche
 * au canevas. Le test de conformité passe par cette même fonction : il compare
 * donc ce qui sera RÉELLEMENT rendu, et non la description brute.
 */
export function lignesDe(bloc: Extract<Bloc, { type: "tableau" }>, ctx: ContexteCanevas): string[] {
  return bloc.lignes
    .flatMap((l) => (l === "{ARRONDISSEMENTS}" ? ctx.arrondissements : [l]))
    .map((l) => resoudre(l, ctx));
}

function rendreTableau(
  bloc: Extract<Bloc, { type: "tableau" }>,
  ctx: ContexteCanevas,
  valeur: FournisseurValeur
): (Paragraph | Table)[] {
  const colonnes = colonnesDe(bloc, ctx);
  const lignes = lignesDe(bloc, ctx);

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

  const tableau = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: BORDURES,
    rows: [entete, ...corps],
  });

  // Certains tableaux du canevas n'ont PAS de légende — ceux du
  // budget-programme, par exemple. Leur en inventer une les ferait apparaître
  // dans la liste des tableaux, où le canevas ne les met pas.
  return bloc.titre
    ? [legendeTableau(bloc.titre, bloc.numero), tableau, new Paragraph({ text: "" })]
    : [tableau, new Paragraph({ text: "" })];
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
    // Un texte de plusieurs paragraphes arrive séparé par des lignes vides.
    // Le rendre d'un bloc collerait l'introduction en un seul pavé illisible.
    return [
      ...saisi
        .trim()
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((p) => new Paragraph({ children: [new TextRun({ text: p.trim(), size: 20 })] })),
      new Paragraph({ text: "" }),
    ];
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
  4: HeadingLevel.HEADING_4,
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

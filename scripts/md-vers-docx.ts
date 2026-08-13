/**
 * Convertit un document Markdown du dépôt en .docx transmissible.
 *
 * Les notes de décision du SID sont écrites en Markdown — elles se versionnent,
 * se relisent en revue et ne dépendent d'aucun logiciel. Mais elles se
 * transmettent à la hiérarchie en Word. Ce convertisseur évite d'entretenir
 * deux fois le même texte.
 *
 * Il ne prétend pas couvrir tout Markdown : seulement ce que les notes du SID
 * emploient — titres, paragraphes, listes, tableaux, blocs de code, gras et
 * code en ligne.
 *
 *   npm run doc:word -- docs/MEMORANDUM_ARCHITECTURE.md
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, BorderStyle, AlignmentType,
} from "docx";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BORDURES = {
  top: { style: BorderStyle.SINGLE, size: 1 },
  bottom: { style: BorderStyle.SINGLE, size: 1 },
  left: { style: BorderStyle.SINGLE, size: 1 },
  right: { style: BorderStyle.SINGLE, size: 1 },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
  insideVertical: { style: BorderStyle.SINGLE, size: 1 },
};

/** Découpe une ligne en fragments gras / code / normal. */
function fragments(ligne: string, taille = 20): TextRun[] {
  const runs: TextRun[] = [];
  // On traite **gras**, `code` et le reste. Les guillemets typographiques et
  // les caractères accentués passent tels quels.
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let dernier = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ligne))) {
    if (m.index > dernier) runs.push(new TextRun({ text: ligne.slice(dernier, m.index), size: taille }));
    const jeton = m[0];
    if (jeton.startsWith("**")) runs.push(new TextRun({ text: jeton.slice(2, -2), bold: true, size: taille }));
    else runs.push(new TextRun({ text: jeton.slice(1, -1), font: "Consolas", size: taille - 2 }));
    dernier = m.index + jeton.length;
  }
  if (dernier < ligne.length) runs.push(new TextRun({ text: ligne.slice(dernier), size: taille }));
  return runs.length ? runs : [new TextRun({ text: "", size: taille })];
}

const cellulesDe = (ligne: string) =>
  ligne.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

const estSeparateur = (ligne: string) => /^\|[\s:|-]+\|$/.test(ligne.trim());

export function markdownVersElements(markdown: string): (Paragraph | Table)[] {
  const lignes = markdown.replace(/\r\n/g, "\n").split("\n");
  const sortie: (Paragraph | Table)[] = [];
  let i = 0;

  while (i < lignes.length) {
    const l = lignes[i];

    // --- bloc de code ---
    if (l.trim().startsWith("```")) {
      i++;
      const code: string[] = [];
      while (i < lignes.length && !lignes[i].trim().startsWith("```")) code.push(lignes[i++]);
      i++;
      for (const c of code) {
        sortie.push(
          new Paragraph({
            shading: { fill: "F4F4F4" },
            children: [new TextRun({ text: c || " ", font: "Consolas", size: 16 })],
          })
        );
      }
      sortie.push(new Paragraph({ text: "" }));
      continue;
    }

    // --- tableau ---
    if (l.trim().startsWith("|") && i + 1 < lignes.length && estSeparateur(lignes[i + 1])) {
      const entetes = cellulesDe(l);
      i += 2;
      const corps: string[][] = [];
      while (i < lignes.length && lignes[i].trim().startsWith("|")) corps.push(cellulesDe(lignes[i++]));

      const cellule = (texte: string, gras: boolean) =>
        new TableCell({
          shading: gras ? { fill: "E8E8E8" } : undefined,
          children: [new Paragraph({ children: fragments(texte, 18).map((r) => r) })],
        });

      sortie.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: BORDURES,
          rows: [
            new TableRow({ tableHeader: true, children: entetes.map((e) => cellule(e, true)) }),
            ...corps.map((r) => new TableRow({ children: r.map((c) => cellule(c, false)) })),
          ],
        })
      );
      sortie.push(new Paragraph({ text: "" }));
      continue;
    }

    // --- titres ---
    const titre = /^(#{1,4})\s+(.*)$/.exec(l);
    if (titre) {
      const niveaux = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
      sortie.push(
        new Paragraph({
          heading: niveaux[titre[1].length - 1],
          children: fragments(titre[2], 24 - titre[1].length * 2).map((r) => r),
        })
      );
      i++;
      continue;
    }

    // --- filet horizontal ---
    if (/^---+$/.test(l.trim())) {
      sortie.push(new Paragraph({ text: "", border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } } }));
      i++;
      continue;
    }

    // --- listes ---
    const puce = /^[-*]\s+(.*)$/.exec(l);
    if (puce) {
      sortie.push(new Paragraph({ bullet: { level: 0 }, children: fragments(puce[1]) }));
      i++;
      continue;
    }
    const numerotee = /^(\d+)\.\s+(.*)$/.exec(l);
    if (numerotee) {
      sortie.push(new Paragraph({ bullet: { level: 0 }, children: fragments(numerotee[2]) }));
      i++;
      continue;
    }

    // --- citation ---
    const citation = /^>\s?(.*)$/.exec(l);
    if (citation) {
      sortie.push(
        new Paragraph({
          indent: { left: 400 },
          children: fragments(citation[1]).map(() => new TextRun({ text: citation[1], italics: true, size: 20 })),
        })
      );
      i++;
      continue;
    }

    // --- paragraphe : on recolle les lignes consécutives ---
    if (l.trim() === "") {
      i++;
      continue;
    }
    const bloc: string[] = [];
    while (
      i < lignes.length &&
      lignes[i].trim() !== "" &&
      !lignes[i].trim().startsWith("|") &&
      !lignes[i].trim().startsWith("```") &&
      !/^#{1,4}\s/.test(lignes[i]) &&
      !/^[-*]\s/.test(lignes[i]) &&
      !/^>/.test(lignes[i]) &&
      !/^---+$/.test(lignes[i].trim())
    ) {
      bloc.push(lignes[i++].trim());
    }
    if (bloc.length) {
      sortie.push(new Paragraph({ children: fragments(bloc.join(" ")), spacing: { after: 120 } }));
    } else {
      i++;
    }
  }
  return sortie;
}

async function principal() {
  const source = process.argv[2];
  if (!source) {
    console.error("Usage : npm run doc:word -- <fichier.md>");
    process.exit(1);
  }
  const markdown = readFileSync(source, "utf8");
  const document = new Document({ sections: [{ children: markdownVersElements(markdown) }] });
  const buffer = Buffer.from(await Packer.toBuffer(document));

  mkdirSync("storage/exports", { recursive: true });
  const nom = path.basename(source).replace(/\.md$/i, "") + ".docx";
  writeFileSync(path.join("storage/exports", nom), buffer);
  console.log(`${nom} — ${(buffer.length / 1024).toFixed(1)} Ko`);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * La note de situation en document WORD : le même contenu que la
 * présentation, à imprimer ou à joindre à un courrier. Les graphiques sont de
 * vrais graphiques Word (canevas/graphiquesWord.ts), comme ceux du rapport
 * trimestriel.
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, HeadingLevel, ShadingType,
} from "docx";
import { repereGraphique, type DonneesGraphique } from "@/server/trimestre/canevas/graphiques";
import { insererGraphiques } from "@/server/trimestre/canevas/graphiquesWord";
import { legendeGraphique } from "@/server/trimestre/canevas/rendu";
import { nb, type NoteSituation } from "./noteSituation";
import {
  COULEURS, evolutionTexte, faitsRetenus, indicateursAffiches, phraseComparaison, phraseCouverture, sousTitreNote, titreNote,
  valeurTexte, type Retouches,
} from "./presentation";

const BORDS = {
  top: { style: BorderStyle.SINGLE, size: 2, color: COULEURS.ligne },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: COULEURS.ligne },
  left: { style: BorderStyle.SINGLE, size: 2, color: COULEURS.ligne },
  right: { style: BorderStyle.SINGLE, size: 2, color: COULEURS.ligne },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: COULEURS.ligne },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: COULEURS.ligne },
};

const texte = (t: string, o: { gras?: boolean; couleur?: string; taille?: number; italique?: boolean } = {}) =>
  new TextRun({ text: t, bold: o.gras, color: o.couleur, size: o.taille ?? 22, italics: o.italique });

const titre = (t: string) =>
  new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 280, after: 120 }, children: [texte(t, { gras: true, couleur: COULEURS.primaire, taille: 30 })] });

function cellule(t: string, o: { entete?: boolean; fond?: string; couleur?: string; droite?: boolean; gras?: boolean; centre?: boolean } = {}) {
  return new TableCell({
    shading: o.entete ? { type: ShadingType.CLEAR, color: "auto", fill: COULEURS.primaire } : o.fond ? { type: ShadingType.CLEAR, color: "auto", fill: o.fond } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: o.centre ? AlignmentType.CENTER : o.droite ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [texte(t, { gras: o.entete || o.gras, couleur: o.entete ? "FFFFFF" : o.couleur ?? COULEURS.fonce, taille: 20 })],
      }),
    ],
  });
}

const tableau = (lignes: TableRow[]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDS, rows: lignes });

export async function rendreNoteDocx(note: NoteSituation, retouches: Retouches = {}): Promise<Buffer> {
  const graphiques: DonneesGraphique[] = [];
  const graphique = (g: DonneesGraphique | null): Paragraph[] => {
    if (!g) return [];
    graphiques.push(g);
    const rang = graphiques.length;
    return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(repereGraphique(rang))] }), legendeGraphique(g.titre, rang)];
  };

  const enfants: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [texte("RÉPUBLIQUE DU CAMEROUN — Paix – Travail – Patrie", { taille: 18, couleur: COULEURS.gris })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [texte(`MINISTÈRE DE L'ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES — ${note.departement.sigle}`, { taille: 18, couleur: COULEURS.gris, gras: true })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [texte("NOTE DE SITUATION", { gras: true, taille: 36, couleur: COULEURS.primaire })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [texte(titreNote, { gras: true, taille: 26, couleur: COULEURS.fonce })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [texte(sousTitreNote(note), { taille: 24 })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [texte(`Établie le ${note.produitLe}. ${phraseCouverture(note)}`, { italique: true, taille: 20, couleur: COULEURS.gris })],
    }),
  ];

  // L'essentiel en chiffres.
  enfants.push(titre("L'essentiel en chiffres"));
  enfants.push(new Paragraph({ spacing: { after: 120 }, children: [texte(phraseComparaison(note), { italique: true, taille: 20, couleur: COULEURS.gris })] }));
  enfants.push(
    tableau([
      new TableRow({ tableHeader: true, children: [cellule("Indicateur", { entete: true }), cellule("Valeur", { entete: true }), cellule("Évolution", { entete: true })] }),
      ...indicateursAffiches(note).map((i) => {
        const e = evolutionTexte(i);
        return new TableRow({
          children: [cellule(i.libelle), cellule(`${valeurTexte(i)} ${i.unite}`, { droite: true, gras: true }), cellule(e.texte, { couleur: e.couleur, droite: true, gras: true })],
        });
      }),
    ])
  );

  // Les faits saillants.
  const faits = faitsRetenus(note, retouches);
  if (faits.length) {
    enfants.push(titre("Faits saillants"));
    const couleur: Record<string, string> = { hausse: COULEURS.vert, baisse: COULEURS.rouge, alerte: COULEURS.rouge, fiabilite: COULEURS.ambre, info: COULEURS.primaire };
    for (const f of faits) {
      enfants.push(
        new Paragraph({
          spacing: { after: 100 },
          indent: { left: 360, hanging: 360 },
          alignment: AlignmentType.JUSTIFIED,
          children: [texte("■  ", { couleur: couleur[f.genre] ?? COULEURS.primaire }), texte(f.texte)],
        })
      );
    }
  }

  // Le cheptel, les abattages.
  if (note.graphiques.cheptel) enfants.push(titre("Le cheptel"), ...graphique(note.graphiques.cheptel));
  if (note.graphiques.abattages) enfants.push(titre("Abattages et productions"), ...graphique(note.graphiques.abattages));

  // La santé animale.
  enfants.push(titre("Santé animale"));
  if (note.sante.foyers.length) {
    enfants.push(
      tableau([
        new TableRow({ tableHeader: true, children: ["Maladie", "Foyers", "Morts", "Arrondissements"].map((t) => cellule(t, { entete: true })) }),
        ...note.sante.foyers.map(
          (f) =>
            new TableRow({
              children: [cellule(f.maladie), cellule(nb(f.foyers), { droite: true }), cellule(f.morts ? nb(f.morts) : "—", { droite: true }), cellule(f.arrondissements.join(", "))],
            })
        ),
      ])
    );
  } else {
    enfants.push(new Paragraph({ children: [texte("Aucun foyer de maladie déclaré sur la période.", { gras: true, couleur: COULEURS.vert })] }));
  }
  enfants.push(new Paragraph({ text: "" }));
  if (note.graphiques.vaccinations) enfants.push(...graphique(note.graphiques.vaccinations));
  else enfants.push(new Paragraph({ children: [texte("Aucune vaccination déclarée sur la période.", { couleur: COULEURS.gris })] }));

  // La commercialisation.
  if (note.graphiques.ventes) enfants.push(titre("Commercialisation"), ...graphique(note.graphiques.ventes));

  // Ce que valent les chiffres.
  const cv = note.couverture;
  enfants.push(titre("Fiabilité des chiffres"));
  enfants.push(new Paragraph({ spacing: { after: 120 }, children: [texte(phraseCouverture(note), { italique: true })] }));
  enfants.push(
    tableau([
      new TableRow({ tableHeader: true, children: [cellule("Arrondissement", { entete: true }), ...cv.mois.map((m) => cellule(m, { entete: true }))] }),
      ...cv.arrondissements.map(
        (a, i) =>
          new TableRow({
            children: [
              cellule(a),
              ...cv.transmis[i].map((ok) => cellule(ok ? "✓" : "✗", { centre: true, gras: true, couleur: ok ? COULEURS.vert : COULEURS.rouge, fond: ok ? "E6F5EF" : "FBEBEC" })),
            ],
          })
      ),
    ])
  );

  const remarques = retouches.remarques?.trim();
  if (remarques) {
    enfants.push(titre("Remarques du Délégué"));
    for (const p of remarques.split(/\n\s*\n|\n/).filter((x) => x.trim())) {
      enfants.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 100 }, children: [texte(p.trim())] }));
    }
  }

  const document = new Document({
    creator: note.departement.sigle,
    title: `${titreNote} — ${note.periode.libelle}`,
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children: enfants }],
  });
  return insererGraphiques(Buffer.from(await Packer.toBuffer(document)), graphiques);
}

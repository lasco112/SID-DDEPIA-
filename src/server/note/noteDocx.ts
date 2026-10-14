/**
 * La note de situation en document WORD : le même contenu que la
 * présentation, dans le même ordre, à imprimer ou à joindre à un courrier.
 * En-tête officiel bilingue et logo du ministère, comme la page de garde des
 * rapports ; sections numérotées ; vrais graphiques Word
 * (canevas/graphiquesWord.ts).
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, HeadingLevel,
  ShadingType, ImageRun, VerticalAlign, Footer, PageNumber,
} from "docx";
import { repereGraphique, type DonneesGraphique } from "@/server/trimestre/canevas/graphiques";
import { insererGraphiques } from "@/server/trimestre/canevas/graphiquesWord";
import { legendeGraphique } from "@/server/trimestre/canevas/rendu";
import { nb, type NoteSituation } from "./noteSituation";
import {
  COULEURS, ENTETE, evolutionTexte, faitsRetenus, indicateursAffiches, logoMinepia, phraseComparaison, phraseCouverture,
  sousTitreNote, titreNote, valeurTexte, type Retouches,
} from "./presentation";

const LIGNE = { style: BorderStyle.SINGLE, size: 2, color: COULEURS.ligne };
const AUCUNE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const BORDS = { top: LIGNE, bottom: LIGNE, left: LIGNE, right: LIGNE, insideHorizontal: LIGNE, insideVertical: LIGNE };
const SANS_BORDS = { top: AUCUNE, bottom: AUCUNE, left: AUCUNE, right: AUCUNE, insideHorizontal: AUCUNE, insideVertical: AUCUNE };

const texte = (t: string, o: { gras?: boolean; couleur?: string; taille?: number; italique?: boolean } = {}) =>
  new TextRun({ text: t, bold: o.gras, color: o.couleur, size: o.taille ?? 22, italics: o.italique });

function cellule(t: string, o: { entete?: boolean; fond?: string; couleur?: string; droite?: boolean; gras?: boolean; centre?: boolean; taille?: number } = {}) {
  return new TableCell({
    shading: o.entete ? { type: ShadingType.CLEAR, color: "auto", fill: COULEURS.primaire } : o.fond ? { type: ShadingType.CLEAR, color: "auto", fill: o.fond } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: o.centre ? AlignmentType.CENTER : o.droite ? AlignmentType.RIGHT : AlignmentType.LEFT,
        children: [texte(t, { gras: o.entete || o.gras, couleur: o.entete ? "FFFFFF" : o.couleur ?? COULEURS.fonce, taille: o.taille ?? 20 })],
      }),
    ],
  });
}

const tableau = (lignes: TableRow[]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: BORDS, rows: lignes });
const enteteTableau = (titres: string[]) => new TableRow({ tableHeader: true, children: titres.map((t) => cellule(t, { entete: true })) });

export async function rendreNoteDocx(note: NoteSituation, retouches: Retouches = {}): Promise<Buffer> {
  const graphiques: DonneesGraphique[] = [];
  const graphique = (g: DonneesGraphique | null): Paragraph[] => {
    if (!g) return [];
    graphiques.push(g);
    const rang = graphiques.length;
    return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(repereGraphique(rang))] }), legendeGraphique(g.titre, rang)];
  };
  let numero = 0;
  const titre = (t: string) => {
    numero += 1;
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 320, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COULEURS.primaire, space: 2 } },
      children: [texte(`${numero}. ${t}`, { gras: true, couleur: COULEURS.primaire, taille: 28 })],
    });
  };
  const note_ = (t: string) => new Paragraph({ spacing: { after: 120 }, children: [texte(t, { italique: true, taille: 20, couleur: COULEURS.gris })] });

  // ---- L'en-tête officiel : français, logo, anglais.
  const logo = logoMinepia();
  const bloc = (lignes: string[]) =>
    lignes.flatMap((t, k) => [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [texte(t, { gras: k !== 1, italique: k === 1, taille: 16 })] }),
      ...(k >= 1 && k <= 3 ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [texte("———", { taille: 14, couleur: COULEURS.gris })] })] : []),
    ]);
  const enfants: (Paragraph | Table)[] = [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: SANS_BORDS,
      rows: [
        new TableRow({
          children: [
            new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: bloc(ENTETE.fr(note)) }),
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: logo ? [new ImageRun({ type: "png", data: logo, transformation: { width: 100, height: 91 } })] : [] })],
            }),
            new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, verticalAlign: VerticalAlign.CENTER, children: bloc(ENTETE.en(note)) }),
          ],
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    // Le titre, dans un cadre de la couleur du SID.
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: SANS_BORDS,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, color: "auto", fill: COULEURS.primaire },
              margins: { top: 200, bottom: 200, left: 240, right: 240 },
              children: [
                new Paragraph({ children: [texte("NOTE DE SITUATION", { gras: true, taille: 22, couleur: "D9A84E" })] }),
                new Paragraph({ spacing: { before: 80 }, children: [texte(titreNote, { gras: true, taille: 34, couleur: "FFFFFF" })] }),
                new Paragraph({ spacing: { before: 80 }, children: [texte(sousTitreNote(note), { taille: 26, couleur: "FFFFFF" })] }),
              ],
            }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { before: 160 }, children: [texte("LE DÉLÉGUÉ DÉPARTEMENTAL", { gras: true, taille: 20 }), texte(`   ·   ${note.departement.sigle} · ${note.produitLe}`, { taille: 20, couleur: COULEURS.gris })] }),
    note_(phraseCouverture(note)),
  ];

  // ---- 1. L'essentiel en chiffres.
  enfants.push(titre("L'essentiel en chiffres"), note_(phraseComparaison(note)));
  enfants.push(
    tableau([
      enteteTableau(["Indicateur", "Valeur", "Évolution"]),
      ...indicateursAffiches(note).map((i) => {
        const e = evolutionTexte(i);
        return new TableRow({
          children: [cellule(i.libelle), cellule(`${valeurTexte(i)} ${i.unite}`, { droite: true, gras: true }), cellule(e.texte, { couleur: e.couleur, droite: true, gras: true })],
        });
      }),
    ])
  );

  // ---- 2. Les faits saillants.
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

  // ---- Les chiffres de l'élevage.
  if (note.graphiques.cheptel) enfants.push(titre("Le cheptel"), note_("Effectifs déclarés au dernier mois de la période."), ...graphique(note.graphiques.cheptel));
  if (note.graphiques.abattages) enfants.push(titre("Abattages et productions"), ...graphique(note.graphiques.abattages));
  if (note.graphiques.ventes) enfants.push(titre("Commercialisation"), ...graphique(note.graphiques.ventes));

  // ---- La santé animale.
  enfants.push(titre("Santé animale"));
  if (note.sante.foyers.length) {
    enfants.push(
      tableau([
        enteteTableau(["Maladie", "Foyers", "Morts", "Arrondissements"]),
        ...note.sante.foyers.map(
          (f) => new TableRow({ children: [cellule(f.maladie), cellule(nb(f.foyers), { droite: true }), cellule(f.morts ? nb(f.morts) : "—", { droite: true }), cellule(f.arrondissements.join(", "))] })
        ),
      ])
    );
  } else {
    enfants.push(new Paragraph({ children: [texte("Aucun foyer de maladie déclaré sur la période.", { gras: true, couleur: COULEURS.vert })] }));
  }
  enfants.push(new Paragraph({ text: "" }));
  if (note.graphiques.vaccinations) enfants.push(...graphique(note.graphiques.vaccinations));

  // ---- Les épisodes épidémiques et leur gestion.
  if (note.episodes.length) {
    enfants.push(titre("Épisodes épidémiques et leur gestion"), note_("Foyers déclarés dans les rapports mensuels : où, combien, et les mesures prises."));
    enfants.push(
      tableau([
        enteteTableau(["Maladie", "Où", "Foyers", "Touchés", "Morts", "Mesures prises"]),
        ...note.episodes.map(
          (e) =>
            new TableRow({
              children: [
                cellule(e.maladie, { gras: true }),
                cellule(`${e.arrondissement}${e.localites.length ? ` — ${e.localites.join(", ")}` : ""}`, { taille: 18 }),
                cellule(nb(e.foyers), { droite: true }),
                cellule(e.touches ? nb(e.touches) : "—", { droite: true }),
                cellule(e.morts ? nb(e.morts) : "—", { droite: true, couleur: e.morts ? COULEURS.rouge : undefined }),
                cellule(e.mesures.length ? e.mesures.join(" ; ") : "Non précisées", { taille: 18, couleur: e.mesures.length ? undefined : COULEURS.gris }),
              ],
            })
        ),
      ])
    );
  }

  // ---- Les événements particuliers.
  const evenements = (retouches.evenements ?? []).filter((e) => e.titre.trim() || e.texte.trim());
  if (evenements.length) {
    enfants.push(titre("Événements particuliers"));
    for (const e of evenements) {
      enfants.push(
        new Paragraph({
          spacing: { before: 120, after: 40 },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: COULEURS.ambre, space: 8 } },
          children: [texte(e.titre.trim() || "Événement", { gras: true, couleur: COULEURS.primaire })],
        }),
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 100 },
          border: { left: { style: BorderStyle.SINGLE, size: 18, color: COULEURS.ambre, space: 8 } },
          children: [texte(e.texte.trim())],
        })
      );
    }
  }

  // ---- Le budget.
  const { recettes, credits, marches } = note.budget;
  if (recettes || credits) {
    enfants.push(titre("Budget : recettes et crédits"));
    const lignes: TableRow[] = [enteteTableau(["Poste", "Montant (FCFA)", "Évolution"])];
    const ind = note.indicateurs.find((i) => i.cle === "recettes");
    if (ind) {
      const e = evolutionTexte(ind);
      lignes.push(new TableRow({ children: [cellule("Recettes encaissées"), cellule(valeurTexte(ind), { droite: true, gras: true }), cellule(e.texte, { droite: true, gras: true, couleur: e.couleur })] }));
    }
    if (credits?.fonctionnement != null) lignes.push(new TableRow({ children: [cellule(`Crédits de fonctionnement (${credits.trimestre})`), cellule(nb(credits.fonctionnement), { droite: true, gras: true }), cellule("—", { droite: true })] }));
    if (credits?.investissement != null) lignes.push(new TableRow({ children: [cellule(`Crédits d'investissement (${credits.trimestre})`), cellule(nb(credits.investissement), { droite: true, gras: true }), cellule("—", { droite: true })] }));
    enfants.push(tableau(lignes));
    if (recettes?.libelleReference) enfants.push(note_(`Recettes comparées à ${recettes.libelleReference}.`));
    enfants.push(...graphique(note.graphiques.recettes));
  }
  if (marches) {
    enfants.push(
      titre("Marchés du budget d'investissement public"),
      note_(`${marches.lignes.length} marché(s) suivi(s) au ${marches.trimestre}${marches.montantTotal ? ` pour ${nb(marches.montantTotal)} FCFA` : ""} : ${marches.parNiveau.map((p) => `${p.nombre} ${p.niveau.toLowerCase()}`).join(", ")}.`),
      tableau([
        enteteTableau(["Infrastructure", "Arrondissement / commune", "Montant (FCFA)", "Exécution"]),
        ...marches.lignes.map(
          (m) =>
            new TableRow({
              children: [
                cellule(m.infrastructure),
                cellule(m.lieu),
                cellule(m.montant != null ? nb(m.montant) : "—", { droite: true }),
                cellule(m.niveau, { gras: true, couleur: m.niveau === "Construit" ? COULEURS.vert : m.niveau === "En cours" ? COULEURS.ambre : m.niveau === "Non précisé" ? COULEURS.gris : COULEURS.rouge }),
              ],
            })
        ),
      ])
    );
  }

  // ---- Ce que valent les chiffres.
  const cv = note.couverture;
  enfants.push(titre("Fiabilité des chiffres"), note_(phraseCouverture(note)));
  enfants.push(
    tableau([
      enteteTableau(["Arrondissement", ...cv.mois]),
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
    for (const p of remarques.split(/\n+/).filter((x) => x.trim())) {
      enfants.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 100 }, children: [texte(p.trim())] }));
    }
  }

  const document = new Document({
    creator: note.departement.sigle,
    title: `${titreNote} — ${note.periode.libelle}`,
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 1000, right: 1000 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: `${note.departement.sigle} · Note de situation · ${note.periode.libelle} · page `, size: 16, color: COULEURS.gris }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: COULEURS.gris }),
                  new TextRun({ text: " / ", size: 16, color: COULEURS.gris }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: COULEURS.gris }),
                ],
              }),
            ],
          }),
        },
        children: enfants,
      },
    ],
  });
  return insererGraphiques(Buffer.from(await Packer.toBuffer(document)), graphiques);
}

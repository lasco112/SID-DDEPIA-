/**
 * Produit une section du canevas trimestriel en .docx, pour relecture.
 *
 * Sert à faire valider le canevas section par section par le Délégué avant de
 * passer à la suivante — plutôt que de livrer 81 tableaux d'un coup et de tout
 * reprendre si la première section était fausse.
 *
 * Le document sort VIDE de données : ce qu'on valide ici, c'est la STRUCTURE —
 * les colonnes, les libellés de ligne, les zones de texte, dans l'ordre.
 *
 *   npm run canevas:section -- I 2026 3
 */
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from "docx";
import { writeFileSync, mkdirSync } from "node:fs";
import { SECTION_I } from "../src/server/trimestre/canevas/sectionI";
import { SECTION_BUDGET } from "../src/server/trimestre/canevas/sectionBudget";
import { SECTION_II_BOVIN } from "../src/server/trimestre/canevas/sectionBovin";
import { rendreSection, inventaireSection, champsAutomatiques } from "../src/server/trimestre/canevas/rendu";
import type { ContexteCanevas, SectionCanevas } from "../src/server/trimestre/canevas/types";
import { trimestrielle, libelleOfficiel, libelleCourt, memePeriodeAnneePrecedente, moisDeLaPeriode } from "../src/server/periodes/calendrier";

const MOIS_MAJ = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

const SECTIONS: Record<string, SectionCanevas> = { I: SECTION_I, BUDGET: SECTION_BUDGET, "II-1": SECTION_II_BOVIN };

async function principal() {
  const cle = (process.argv[2] ?? "I").toUpperCase();
  const annee = Number(process.argv[3] ?? 2026);
  const trimestre = Number(process.argv[4] ?? 3);

  const section = SECTIONS[cle];
  if (!section) {
    console.error(`Section inconnue : ${cle}. Disponibles : ${Object.keys(SECTIONS).join(", ")}`);
    process.exit(1);
  }

  const p = trimestrielle(annee, trimestre);
  const ctx: ContexteCanevas = {
    periodeCourt: libelleCourt(p),
    periodeCourtN1: libelleCourt(memePeriodeAnneePrecedente(p)),
    annee,
    mois: moisDeLaPeriode(p).map((m) => MOIS_MAJ[m.mois - 1]),
    arrondissements: ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"],
  };

  const centre = (texte: string, taille: number, gras = false) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: texte, bold: gras, size: taille })],
    });

  const enfants = [
    centre("RÉPUBLIQUE DU CAMEROUN", 22, true),
    centre("Paix – Travail – Patrie", 18),
    centre("RÉGION DE L’OUEST", 18),
    centre(
      "DÉLÉGATION DÉPARTEMENTALE DE L’ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES DE LA MENOUA",
      18
    ),
    new Paragraph({ text: "" }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `RAPPORT DU ${libelleOfficiel(p)}`, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${section.titre} — structure soumise à validation, sans données`,
          italics: true,
          size: 18,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    // Sommaire, liste des tableaux, liste des graphiques — champs Word, comme
    // dans le canevas officiel. Ils se remplissent à l'ouverture du document.
    ...champsAutomatiques(),
    ...rendreSection(section, { ctx }),
  ];

  const document = new Document({ sections: [{ children: enfants }] });
  const buffer = Buffer.from(await Packer.toBuffer(document));

  mkdirSync("storage/exports", { recursive: true });
  const nom = `CANEVAS_SECTION_${cle}_${libelleCourt(p).replace(/\s/g, "")}.docx`;
  writeFileSync(`storage/exports/${nom}`, buffer);

  const inv = inventaireSection(section, ctx);
  console.log(`${nom} — ${(buffer.length / 1024).toFixed(1)} Ko`);
  console.log(`  ${inv.titres} titres · ${inv.zonesTexte} zones de texte · ${inv.tableaux} tableaux`);
  console.log(`  éléments rendus : ${enfants.length}`);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});

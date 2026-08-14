/**
 * Production du rapport trimestriel conforme au canevas.
 *
 * Remplace le premier générateur, qui dessinait ses propres tableaux à partir
 * des champs du SID et produisait un document que le canevas ne reconnaissait
 * pas. Ici, c'est le canevas qui commande : les 78 tableaux sont rendus dans
 * leur forme officielle, et les valeurs consolidées viennent remplir les cases
 * pour lesquelles une liaison a été écrite.
 *
 * Ce module est appelé aussi bien par la route de l'application que par le
 * script en ligne de commande : un seul chemin de production, donc un seul
 * comportement à vérifier.
 */
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, Header } from "docx";
import type { PrismaClient } from "@prisma/client";
import { SECTION_I } from "./canevas/sectionI";
import { SECTION_BUDGET } from "./canevas/sectionBudget";
import { SECTION_II_BOVIN } from "./canevas/sectionBovin";
import { SECTION_II_OVIN, SECTION_II_CAPRIN, SECTION_II_EQUIDES } from "./canevas/sectionElevages";
import { SECTION_II_PORCIN, SECTION_II_AVICOLE } from "./canevas/sectionPorcinAvicole";
import { SECTION_II_AUTRES, SECTION_III_PECHE } from "./canevas/sectionPecheEtDivers";
import { SECTION_IV_SANTE } from "./canevas/sectionSanteAnimale";
import { rendreSection, champsAutomatiques } from "./canevas/rendu";
import { TEXTES_FIXES } from "./canevas/textesFixes";
import type { ContexteCanevas, SectionCanevas } from "./canevas/types";
import { champsMobilises, bilanLiaisons } from "./liaison";
import { preparer, fournisseur } from "./remplissage";
import { inspecterPeriode, type EtatPeriode } from "./agregation";
import {
  type Periode, libelleOfficiel, libelleCourt, memePeriodeAnneePrecedente, moisDeLaPeriode,
} from "../periodes/calendrier";

const MOIS_MAJ = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

/** Les onze sections décrites, dans l'ordre du canevas. */
export const SECTIONS_CANEVAS: SectionCanevas[] = [
  SECTION_I, SECTION_BUDGET, SECTION_II_BOVIN, SECTION_II_OVIN, SECTION_II_CAPRIN,
  SECTION_II_EQUIDES, SECTION_II_PORCIN, SECTION_II_AVICOLE, SECTION_II_AUTRES,
  SECTION_III_PECHE, SECTION_IV_SANTE,
];

/** Les six arrondissements, dans l'ordre du canevas. */
async function arrondissementsDe(db: PrismaClient): Promise<string[]> {
  const a = await db.arrondissement.findMany({ orderBy: { ordre: "asc" }, select: { nom: true } });
  return a.map((x) => x.nom);
}

export interface RapportProduit {
  buffer: Buffer;
  nomFichier: string;
  etat: EtatPeriode;
  /** Nombre de rubriques que le SID alimente automatiquement. */
  rubriquesAlimentees: number;
  /** Nombre de valeurs effectivement consolidées. */
  valeursConsolidees: number;
}

export async function genererRapportCanevas(
  db: PrismaClient,
  periode: Periode,
  options: { autoriserIncomplet?: boolean; textes?: Map<string, string> } = {}
): Promise<RapportProduit> {
  const etat = await inspecterPeriode(db, periode);

  const ctx: ContexteCanevas = {
    periodeCourt: libelleCourt(periode),
    periodeCourtN1: libelleCourt(memePeriodeAnneePrecedente(periode)),
    annee: periode.annee,
    mois: moisDeLaPeriode(periode).map((m) => MOIS_MAJ[m.mois - 1]),
    arrondissements: await arrondissementsDe(db),
  };

  const donnees = await preparer(db, periode, champsMobilises(), {
    autoriserIncomplet: options.autoriserIncomplet,
  });
  const valeur = fournisseur(donnees, ctx);
  const bilan = bilanLiaisons();
  const provisoire = !etat.calculable;

  const centre = (texte: string, taille: number, gras = false) =>
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: texte, bold: gras, size: taille })] });

  const enfants: unknown[] = [
    centre("RÉPUBLIQUE DU CAMEROUN", 22, true),
    centre("Paix – Travail – Patrie", 18),
    centre("RÉGION DE L’OUEST", 18),
    centre("DÉLÉGATION DÉPARTEMENTALE DE L’ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES DE LA MENOUA", 18),
    new Paragraph({ text: "" }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `RAPPORT DU ${libelleOfficiel(periode)}`, bold: true })],
    }),
    new Paragraph({ text: "" }),
  ];

  if (provisoire) {
    const raisons = [...etat.moisAbsents, ...etat.moisIncomplets];
    enfants.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `DOCUMENT PROVISOIRE — période incomplète : ${raisons.join(", ")}`,
            bold: true, color: "B00020", size: 20,
          }),
        ],
      }),
      new Paragraph({ text: "" })
    );
  }

  enfants.push(
    new Paragraph({
      children: [
        new TextRun({
          text:
            `${bilan.casesLiees} rubriques sont renseignées automatiquement par le SID. ` +
            `Les cases laissées vides correspondent à des données que la collecte mensuelle ne recueille pas : ` +
            `elles sont à compléter à la main.`,
          italics: true, size: 18,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    ...champsAutomatiques()
  );

  // Les textes qui ne changent pas d'une période à l'autre — présentation du
  // département, missions, vision, organisation — sont repris automatiquement.
  // Un texte fourni pour la période l'emporte sur le texte fixe : le Délégué
  // garde le dernier mot sur ce qui sort sous sa signature.
  const textes = new Map(TEXTES_FIXES);
  options.textes?.forEach((t, cle) => textes.set(cle, t));

  for (const section of SECTIONS_CANEVAS) {
    enfants.push(...rendreSection(section, { ctx, valeur, textes }));
  }

  enfants.push(
    new Paragraph({ text: "" }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Le Délégué Départemental", size: 20 })] })
  );

  const document = new Document({
    sections: [
      {
        headers: provisoire
          ? {
              default: new Header({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: "BROUILLON — PÉRIODE INCOMPLÈTE", bold: true, color: "B00020", size: 20 })],
                  }),
                ],
              }),
            }
          : undefined,
        children: enfants as never,
      },
    ],
  });

  const buffer = Buffer.from(await Packer.toBuffer(document));
  const nomFichier =
    `Rapport_${libelleCourt(periode).replace(/\s/g, "")}_DDEPIA-Menoua` +
    `${provisoire ? "_BROUILLON" : ""}.docx`;

  return {
    buffer,
    nomFichier,
    etat,
    rubriquesAlimentees: bilan.casesLiees,
    valeursConsolidees: donnees.renseignees,
  };
}

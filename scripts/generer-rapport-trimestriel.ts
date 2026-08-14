/**
 * Produit le rapport trimestriel complet : les 78 tableaux du canevas, remplis
 * des valeurs consolidées là où une liaison a été établie.
 *
 * Le document sort conforme au canevas dans tous les cas. Les cases non liées
 * restent vides — comme la fiche papier avant remplissage — et le rapport
 * indique en tête ce qui est alimenté et ce qui ne l'est pas encore.
 *
 *   npm run trimestre:rapport -- 2026 3
 */
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from "docx";
import { writeFileSync, mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { SECTION_I } from "../src/server/trimestre/canevas/sectionI";
import { SECTION_BUDGET } from "../src/server/trimestre/canevas/sectionBudget";
import { SECTION_II_BOVIN } from "../src/server/trimestre/canevas/sectionBovin";
import { SECTION_II_OVIN, SECTION_II_CAPRIN, SECTION_II_EQUIDES } from "../src/server/trimestre/canevas/sectionElevages";
import { SECTION_II_PORCIN, SECTION_II_AVICOLE } from "../src/server/trimestre/canevas/sectionPorcinAvicole";
import { SECTION_II_AUTRES, SECTION_III_PECHE } from "../src/server/trimestre/canevas/sectionPecheEtDivers";
import { SECTION_IV_SANTE } from "../src/server/trimestre/canevas/sectionSanteAnimale";
import { rendreSection, champsAutomatiques } from "../src/server/trimestre/canevas/rendu";
import type { ContexteCanevas } from "../src/server/trimestre/canevas/types";
import { champsMobilises, bilanLiaisons } from "../src/server/trimestre/liaison";
import { preparer, fournisseur } from "../src/server/trimestre/remplissage";
import { inspecterPeriode } from "../src/server/trimestre/agregation";
import {
  trimestrielle, libelleOfficiel, libelleCourt, memePeriodeAnneePrecedente, moisDeLaPeriode,
} from "../src/server/periodes/calendrier";

const MOIS_MAJ = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

const SECTIONS = [
  SECTION_I, SECTION_BUDGET, SECTION_II_BOVIN, SECTION_II_OVIN, SECTION_II_CAPRIN,
  SECTION_II_EQUIDES, SECTION_II_PORCIN, SECTION_II_AVICOLE, SECTION_II_AUTRES,
  SECTION_III_PECHE, SECTION_IV_SANTE,
];

async function principal() {
  const annee = Number(process.argv[2] ?? 2026);
  const trimestre = Number(process.argv[3] ?? 3);
  const p = trimestrielle(annee, trimestre);

  const db = new PrismaClient();
  const etat = await inspecterPeriode(db, p);

  const ctx: ContexteCanevas = {
    periodeCourt: libelleCourt(p),
    periodeCourtN1: libelleCourt(memePeriodeAnneePrecedente(p)),
    annee,
    mois: moisDeLaPeriode(p).map((m) => MOIS_MAJ[m.mois - 1]),
    arrondissements: ["Dschang", "Fokoué", "Fongo-Tongo", "Nkong-Ni", "Penka-Michel", "Santchou"],
  };

  // Un rapport sur période incomplète reste produit, mais il le dit.
  const donnees = await preparer(db, p, champsMobilises(), { autoriserIncomplet: true });
  const valeur = fournisseur(donnees, ctx);
  const bilan = bilanLiaisons();

  const centre = (texte: string, taille: number, gras = false) =>
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: texte, bold: gras, size: taille })] });

  const enfants: (Paragraph | ReturnType<typeof rendreSection>[number])[] = [
    centre("RÉPUBLIQUE DU CAMEROUN", 22, true),
    centre("Paix – Travail – Patrie", 18),
    centre("RÉGION DE L’OUEST", 18),
    centre("DÉLÉGATION DÉPARTEMENTALE DE L’ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES DE LA MENOUA", 18),
    new Paragraph({ text: "" }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `RAPPORT DU ${libelleOfficiel(p)}`, bold: true })],
    }),
    new Paragraph({ text: "" }),
  ];

  if (!etat.calculable) {
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
            `Alimentation automatique : ${bilan.casesLiees} rubriques renseignées par le SID sur ` +
            `${bilan.casesLiees + bilan.casesNonCollectees} des tableaux liés. Les autres cases sont à ` +
            `compléter à la main : la donnée n'est pas encore collectée.`,
          italics: true, size: 18,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    ...champsAutomatiques()
  );

  for (const section of SECTIONS) enfants.push(...rendreSection(section, { ctx, valeur }));

  enfants.push(
    new Paragraph({ text: "" }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Le Délégué Départemental", size: 20 })] })
  );

  const document = new Document({ sections: [{ children: enfants as never }] });
  const buffer = Buffer.from(await Packer.toBuffer(document));

  mkdirSync("storage/exports", { recursive: true });
  const nom = `RAPPORT_${libelleCourt(p).replace(/\s/g, "")}_DDEPIA-Menoua${etat.calculable ? "" : "_PROVISOIRE"}.docx`;
  writeFileSync(`storage/exports/${nom}`, buffer);

  console.log(`${nom} — ${(buffer.length / 1024).toFixed(1)} Ko`);
  console.log(`  période : ${libelleOfficiel(p)} · ${etat.calculable ? "complète" : "INCOMPLÈTE"}`);
  console.log(`  liaisons : ${bilan.tableaux} tableaux, ${bilan.casesLiees} rubriques alimentées`);
  console.log(`  moteur   : ${donnees.renseignees} valeurs consolidées`);

  await db.$disconnect();
}

principal().catch((e) => { console.error(e); process.exit(1); });

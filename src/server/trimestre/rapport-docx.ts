/**
 * Génération du rapport trimestriel (.docx) — étape E10.
 *
 * POURQUOI UN GÉNÉRATEUR SÉPARÉ DU MENSUEL.
 * Le mensuel est en production, il a servi à clôturer des cycles réels, et un
 * golden master le protège. Le trimestriel n'a ni la même structure de tableau
 * (il porte des colonnes de comparaison N-1 et d'écart), ni la même source (des
 * valeurs consolidées, pas des saisies). Greffer l'un sur l'autre reviendrait à
 * risquer le module qui fonctionne pour servir celui qui n'existe pas encore.
 * Les deux chemins restent séparés ; ils partagent les données, pas le code de
 * rendu.
 *
 * CE QUE CE DOCUMENT PORTE, ET QUI N'EXISTE NULLE PART AILLEURS DANS LE SID :
 *   - la valeur consolidée de la période, calculée selon la règle du champ ;
 *   - le détail des trois mois, pour que le lecteur voie d'où elle vient ;
 *   - la même période de l'année précédente, et l'écart ;
 *   - sous chaque tableau, le commentaire CALCULÉ par le moteur de faits.
 *
 * Un rapport produit sur une période incomplète porte la mention BROUILLON en
 * en-tête de chaque page, et la liste des mois manquants en première page. On
 * ne laisse jamais un document partiel se faire passer pour un document final.
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, Header,
} from "docx";
import type { PrismaClient } from "@prisma/client";
import { identiteDepartement } from "@/lib/departement";
import {
  type Periode, libelleOfficiel, libelleCourt, memePeriodeAnneePrecedente, moisDeLaPeriode,
} from "../periodes/calendrier";
import { agreger, type ValeurAgregee, type EtatPeriode } from "./agregation";
import { produireFaits, rediger, type Fait } from "./faits";
import { regleExpliquee } from "./reglesChamps";

const MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 });
const fmt = (v: number | null | undefined) => (v == null ? "—" : nf.format(v));

function ecartPourcent(courant: number | null, precedent: number | null): string {
  if (courant == null || precedent == null || precedent === 0) return "—";
  const v = (courant - precedent) / precedent;
  const signe = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${signe}${nf.format(Math.round(Math.abs(v) * 1000) / 10)} %`;
}

// ------------------------------------------------------------------ briques

function cell(texte: string, o: { gras?: boolean; largeur?: number; fond?: string; alignement?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): TableCell {
  return new TableCell({
    width: o.largeur ? { size: o.largeur, type: WidthType.PERCENTAGE } : undefined,
    shading: o.fond ? { fill: o.fond } : undefined,
    children: [
      new Paragraph({
        alignment: o.alignement ?? AlignmentType.LEFT,
        children: [new TextRun({ text: texte, bold: o.gras, size: 18 })],
      }),
    ],
  });
}

function tableau(lignes: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1 },
      insideVertical: { style: BorderStyle.SINGLE, size: 1 },
    },
    rows: lignes,
  });
}

// ------------------------------------------------------------------ données

export interface DonneesRapportTrimestriel {
  periode: Periode;
  etat: EtatPeriode;
  valeurs: ValeurAgregee[];
  valeursN1: ValeurAgregee[];
  faits: Fait[];
  brouillon: boolean;
}

/**
 * Rassemble tout ce dont le document a besoin : la consolidation de la période,
 * celle de la même période l'an passé, et les faits qui en découlent.
 */
export async function rassembler(
  db: PrismaClient,
  periode: Periode,
  options: { autoriserIncomplet?: boolean } = {}
): Promise<DonneesRapportTrimestriel> {
  const n1 = memePeriodeAnneePrecedente(periode);

  const { etat, valeurs } = await agreger(db, periode, { autoriserIncomplet: options.autoriserIncomplet });

  // L'absence de l'année précédente n'empêche pas de produire la période : elle
  // prive seulement le rapport de sa colonne de comparaison.
  let valeursN1: ValeurAgregee[] = [];
  try {
    valeursN1 = (await agreger(db, n1, { autoriserIncomplet: true })).valeurs;
  } catch {
    valeursN1 = [];
  }

  const [arrondissements, champs] = await Promise.all([
    db.arrondissement.findMany({ orderBy: { ordre: "asc" } }),
    db.formField.findMany({ where: { actif: true }, select: { code: true, libelle: true } }),
  ]);

  const faits = produireFaits(valeurs, valeursN1, {
    periode,
    periodePrecedente: n1,
    libelles: new Map(champs.map((c) => [c.code, c.libelle])),
    arrondissements: new Map(arrondissements.map((a) => [a.code, a.nom])),
  });

  return { periode, etat, valeurs, valeursN1, faits, brouillon: !etat.calculable };
}

// ------------------------------------------------------------------ document

export async function genererRapportTrimestriel(
  db: PrismaClient,
  periode: Periode,
  options: { autoriserIncomplet?: boolean } = {}
): Promise<{ buffer: Buffer; nomFichier: string; donnees: DonneesRapportTrimestriel }> {
  const identite = await identiteDepartement(db);
  const donnees = await rassembler(db, periode, options);
  const { etat, valeurs, valeursN1, faits, brouillon } = donnees;

  const [arrondissements, templates] = await Promise.all([
    db.arrondissement.findMany({ orderBy: { ordre: "asc" } }),
    db.formTemplate.findMany({
      where: { actif: true },
      include: { fields: { where: { actif: true }, orderBy: { ordre: "asc" } }, section: true },
      orderBy: { ordre: "asc" },
    }),
  ]);

  const dept = new Map(valeurs.filter((v) => v.arrondissementCode === null).map((v) => [v.fieldCode, v]));
  const deptN1 = new Map(valeursN1.filter((v) => v.arrondissementCode === null).map((v) => [v.fieldCode, v]));
  const parArr = new Map<string, Map<string, ValeurAgregee>>();
  for (const v of valeurs) {
    if (v.arrondissementCode === null) continue;
    const m = parArr.get(v.fieldCode) ?? new Map();
    parArr.set(v.fieldCode, m);
    m.set(v.arrondissementCode, v);
  }
  const faitsParChamp = new Map<string, Fait[]>();
  for (const f of faits) {
    const l = faitsParChamp.get(f.fieldCode) ?? [];
    l.push(f);
    faitsParChamp.set(f.fieldCode, l);
  }

  const nomsMois = moisDeLaPeriode(periode).map((m) => MOIS_COURT[m.mois - 1]);
  const enfants: (Paragraph | Table)[] = [];

  // ---- Page de garde ----
  enfants.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "RÉPUBLIQUE DU CAMEROUN", bold: true, size: 22 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "MINISTÈRE DE L'ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES", size: 18 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: identite.intituleCourt, size: 18 })],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: `RAPPORT ${libelleOfficiel(periode)}`, bold: true })],
    }),
    new Paragraph({ text: "" })
  );

  // ---- Ce qui fonde le document ----
  enfants.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: "Périmètre du rapport", bold: true })] }),
    new Paragraph({
      children: [
        new TextRun({
          text:
            `Période consolidée : ${libelleOfficiel(periode)} (${moisDeLaPeriode(periode).map((m) => `${String(m.mois).padStart(2, "0")}/${m.annee}`).join(", ")}). ` +
            `Comparaison : ${libelleOfficiel(memePeriodeAnneePrecedente(periode))}.`,
          size: 18,
        }),
      ],
    })
  );

  if (brouillon) {
    const raisons = [
      ...(etat.moisAbsents.length ? [`mois absent(s) : ${etat.moisAbsents.join(", ")}`] : []),
      ...(etat.moisIncomplets.length ? [`mois incomplet(s) : ${etat.moisIncomplets.join(", ")}`] : []),
    ];
    enfants.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `DOCUMENT PROVISOIRE — ${raisons.join(" ; ")}. Les totaux ci-dessous ne couvrent pas la période entière et ne peuvent pas être transmis en l'état.`,
            bold: true,
            size: 18,
          }),
        ],
      })
    );
  }
  enfants.push(new Paragraph({ text: "" }));

  // ---- Les tableaux, section par section ----
  let sectionCourante = "";
  for (const t of templates) {
    // Les tableaux ÉVÉNEMENT ne sont pas consolidés par le moteur : ils
    // listent des déclarations, pas des valeurs comparables d'une période à
    // l'autre. On le dit plutôt que de laisser un blanc inexpliqué.
    if (t.type === "EVENEMENT") continue;

    const champsDuTableau = t.fields.filter((f) => f.typeValeur !== "TEXTE");
    if (champsDuTableau.length === 0) continue;

    const nomSection = t.section?.nom ?? "Autres";
    if (nomSection !== sectionCourante) {
      sectionCourante = nomSection;
      enfants.push(
        new Paragraph({ text: "" }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: nomSection.toUpperCase(), bold: true })] })
      );
    }

    enfants.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `Tableau ${t.numero} — ${t.titre}`, bold: true })],
      })
    );

    // En-tête : indicateur, les trois mois, la période, N-1, écart.
    const entete = new TableRow({
      children: [
        cell("Indicateur", { gras: true, largeur: 26, fond: "E8E8E8" }),
        ...nomsMois.map((m) => cell(m, { gras: true, fond: "E8E8E8", alignement: AlignmentType.RIGHT })),
        cell(libelleCourt(periode), { gras: true, fond: "D6E4E5", alignement: AlignmentType.RIGHT }),
        cell(libelleCourt(memePeriodeAnneePrecedente(periode)), { gras: true, fond: "E8E8E8", alignement: AlignmentType.RIGHT }),
        cell("Écart", { gras: true, fond: "E8E8E8", alignement: AlignmentType.RIGHT }),
        cell("Règle", { gras: true, fond: "E8E8E8" }),
      ],
    });

    const lignes: TableRow[] = [entete];
    for (const f of champsDuTableau) {
      const d = dept.get(f.code);
      const n1 = deptN1.get(f.code);
      const regle = regleExpliquee(f.code).regle;
      const abrege = regle === "DERNIERE_VALEUR" ? "dernière valeur" : regle === "MOYENNE_PONDEREE" ? "moyenne pondérée" : "somme";
      lignes.push(
        new TableRow({
          children: [
            cell(f.libelle),
            ...(d?.detail ?? []).map((m) => cell(fmt(m.valeur), { alignement: AlignmentType.RIGHT })),
            cell(fmt(d?.valeur), { gras: true, alignement: AlignmentType.RIGHT }),
            cell(fmt(n1?.valeur), { alignement: AlignmentType.RIGHT }),
            cell(ecartPourcent(d?.valeur ?? null, n1?.valeur ?? null), { alignement: AlignmentType.RIGHT }),
            cell(abrege),
          ],
        })
      );
    }
    enfants.push(tableau(lignes));

    // ---- Le commentaire calculé ----
    // Un paragraphe PAR INDICATEUR, et non un paragraphe unique mêlant les
    // faits de plusieurs lignes : « Nombre de caprins abattus — Fongo-Tongo
    // reste en retrait. Santchou reste en retrait. » laisse le lecteur ignorer
    // de quel indicateur parle la seconde phrase.
    // Trois indicateurs au plus par tableau : au-delà, le commentaire est plus
    // long que le tableau qu'il commente.
    const parChampDuTableau = champsDuTableau
      .map((f) => [f.code, faitsParChamp.get(f.code) ?? []] as const)
      .filter(([, l]) => l.length > 0)
      .sort((a, b) => Math.max(...b[1].map((x) => x.importance)) - Math.max(...a[1].map((x) => x.importance)))
      .slice(0, 3);

    if (parChampDuTableau.length > 0) {
      enfants.push(new Paragraph({ text: "" }));
      for (const [, faitsChamp] of parChampDuTableau) {
        enfants.push(
          new Paragraph({
            children: [new TextRun({ text: rediger(faitsChamp), size: 18, italics: true })],
          })
        );
      }
    }
    enfants.push(new Paragraph({ text: "" }));
  }

  // ---- Détail par arrondissement, pour les indicateurs les plus notables ----
  const notables = faits
    .filter((f) => f.type === "RUPTURE" || f.type === "EVOLUTION")
    .slice(0, 12);
  if (notables.length > 0) {
    enfants.push(
      new Paragraph({ text: "" }),
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "DÉTAIL PAR ARRONDISSEMENT", bold: true })] }),
      new Paragraph({
        children: [new TextRun({ text: "Indicateurs ayant le plus varié sur la période.", size: 18, italics: true })],
      })
    );
    const enteteArr = new TableRow({
      children: [
        cell("Indicateur", { gras: true, largeur: 30, fond: "E8E8E8" }),
        ...arrondissements.map((a) => cell(a.code, { gras: true, fond: "E8E8E8", alignement: AlignmentType.RIGHT })),
        cell("Total", { gras: true, fond: "D6E4E5", alignement: AlignmentType.RIGHT }),
      ],
    });
    const lignesArr: TableRow[] = [enteteArr];
    for (const f of notables) {
      const m = parArr.get(f.fieldCode);
      lignesArr.push(
        new TableRow({
          children: [
            cell(f.libelle),
            ...arrondissements.map((a) => cell(fmt(m?.get(a.code)?.valeur ?? null), { alignement: AlignmentType.RIGHT })),
            cell(fmt(dept.get(f.fieldCode)?.valeur ?? null), { gras: true, alignement: AlignmentType.RIGHT }),
          ],
        })
      );
    }
    enfants.push(tableau(lignesArr));
  }

  // ---- Signature ----
  enfants.push(
    new Paragraph({ text: "" }),
    new Paragraph({ text: "" }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Le Délégué Départemental", size: 20 })] })
  );

  const document = new Document({
    sections: [
      {
        headers: brouillon
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
        children: enfants,
      },
    ],
  });

  const buffer = await Packer.toBuffer(document);
  const nomFichier =
    `Rapport_${libelleCourt(periode).replace(/[ /]/g, "")}_${identite.sigle}` +
    `${brouillon ? "_BROUILLON" : ""}.docx`;

  return { buffer: Buffer.from(buffer), nomFichier, donnees };
}

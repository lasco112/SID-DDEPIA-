/**
 * Page de garde et pièces liminaires du rapport trimestriel ou semestriel.
 *
 * DÉCISION DU DÉLÉGUÉ : la page de garde est celle du rapport départemental
 * (« canevas de rapport a prendre.docx »), le reste suit le canevas régional.
 * Elle se compose :
 *   - d'un en-tête bilingue sur trois colonnes — français, armoiries, anglais ;
 *   - du titre, CALCULÉ : « RAPPORT TRIMESTRIEL » ou « SEMESTRIEL » selon la
 *     période, puis les mois couverts et le rappel de la période ;
 *   - de la mention « LE DÉLÉGUÉ DÉPARTEMENTAL, », SANS NOM (décision D5) : le
 *     cachet nominatif la complète, et la page reste juste quand le Délégué
 *     change.
 *
 * Les armoiries sont l'image de l'en-tête du rapport départemental, rangée
 * dans templates/. Si le fichier manque, la page sort sans image plutôt que
 * de faire échouer le rapport.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType,
  WidthType, BorderStyle, PageBreak, VerticalAlign,
} from "docx";
import type { IdentiteDepartement } from "@/lib/departement";
import {
  type Periode, libelleOfficiel, moisDeLaPeriode,
} from "../../periodes/calendrier";

const MOIS_MAJ = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

/**
 * Adresse postale de chaque délégation départementale, par code de
 * département. Elle n'est pas en base : l'y mettre demanderait une migration
 * pour deux lignes de texte. Un département absent d'ici n'a simplement pas de
 * ligne d'adresse sur sa page de garde.
 */
const ADRESSES: Record<string, { fr: string; en: string }> = {
  MEN: { fr: "BP : 55 DSCHANG, Tel : 233 45 13 12", en: "PO BOX: 55 DSCHANG" },
};

const SANS_BORDURE = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const ligne = (texte: string, o: { gras?: boolean; taille?: number } = {}) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: texte, bold: o.gras ?? true, size: o.taille ?? 20 })],
  });

const SEPARATEUR = "---------";

/** « trimestriel », « semestriel », « annuel » — l'adjectif du titre. */
function nature(p: Periode): string {
  if (p.type === "SEMESTRIEL") return "SEMESTRIEL";
  if (p.type === "ANNUEL") return "ANNUEL";
  if (p.type === "MENSUEL") return "MENSUEL";
  return "TRIMESTRIEL";
}

/** « (JUILLET – SEPTEMBRE 2026) » */
export function moisCouverts(p: Periode): string {
  const mois = moisDeLaPeriode(p);
  const premier = MOIS_MAJ[mois[0].mois - 1];
  const dernier = MOIS_MAJ[mois[mois.length - 1].mois - 1];
  return premier === dernier ? `(${premier} ${p.annee})` : `(${premier} – ${dernier} ${p.annee})`;
}

function armoiries(): ImageRun | null {
  const fichier = path.join(process.cwd(), "templates", "armoiries-minepia.png");
  if (!existsSync(fichier)) return null;
  // 312 × 285 pixels à l'origine : proportions conservées.
  return new ImageRun({ type: "png", data: readFileSync(fichier), transformation: { width: 110, height: 100 } });
}

function cellule(enfants: Paragraph[], largeur: number): TableCell {
  return new TableCell({
    width: { size: largeur, type: WidthType.PERCENTAGE },
    verticalAlign: VerticalAlign.CENTER,
    children: enfants,
  });
}

export interface OptionsPageDeGarde {
  identite: IdentiteDepartement;
  periode: Periode;
  /** Nom de l'arrondissement, pour le rapport d'un DA. */
  arrondissement?: string;
}

/** La page de garde complète, suivie d'un saut de page. */
export function pageDeGarde(o: OptionsPageDeGarde): (Paragraph | Table)[] {
  const dep = o.identite.nomCanevas;
  const arr = o.arrondissement?.toUpperCase();
  const adresse = o.arrondissement ? undefined : ADRESSES[o.identite.code];

  const francais = [
    ligne("RÉPUBLIQUE DU CAMEROUN"),
    ligne("Paix – Travail – Patrie", { gras: false }),
    ligne(SEPARATEUR),
    ligne("MINISTÈRE DE L’ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES"),
    ligne(SEPARATEUR),
    ligne("DÉLÉGATION RÉGIONALE DE L’OUEST"),
    ligne(SEPARATEUR),
    ligne(`DÉLÉGATION DÉPARTEMENTALE ${o.identite.nomAvecArticle.toUpperCase()}`),
    ...(arr ? [ligne(SEPARATEUR), ligne(`DÉLÉGATION D’ARRONDISSEMENT DE ${arr}`)] : []),
    ...(adresse ? [ligne(SEPARATEUR), ligne(adresse.fr, { taille: 16 })] : []),
  ];
  // L'anglais reprend les intitulés du rapport départemental, tels quels.
  const anglais = [
    ligne("REPUBLIC OF CAMEROON"),
    ligne("Peace – Work – Fatherland", { gras: false }),
    ligne(SEPARATEUR),
    ligne("MINISTRY OF LIVESTOCK, FISHERIES AND ANIMAL INDUSTRIES"),
    ligne(SEPARATEUR),
    ligne("REGIONAL DELEGATION OF WEST"),
    ligne(SEPARATEUR),
    ligne(`DIVISIONAL DELEGATION OF ${dep}`),
    ...(arr ? [ligne(SEPARATEUR), ligne(`SUBDIVISIONAL DELEGATION OF ${arr}`)] : []),
    ...(adresse ? [ligne(SEPARATEUR), ligne(adresse.en, { taille: 16 })] : []),
  ];
  const image = armoiries();
  const entete = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SANS_BORDURE,
    rows: [
      new TableRow({
        children: [
          cellule(francais, 42),
          cellule([new Paragraph({ alignment: AlignmentType.CENTER, children: image ? [image] : [] })], 16),
          cellule(anglais, 42),
        ],
      }),
    ],
  });

  const intitule = arr
    ? `DÉLÉGATION D’ARRONDISSEMENT DE L’ÉLEVAGE, DES PÊCHES ET DES INDUSTRIES ANIMALES DE ${arr}`
    : o.identite.intituleOfficiel;
  const vide = (n: number) => Array.from({ length: n }, () => new Paragraph({ text: "" }));

  return [
    entete,
    ...vide(6),
    ligne(`RAPPORT ${nature(o.periode)} DES ACTIVITÉS DE LA ${intitule}`, { taille: 28 }),
    ...vide(1),
    ligne(moisCouverts(o.periode), { taille: 32 }),
    ...vide(4),
    ligne(`RAPPORT DU ${libelleOfficiel(o.periode)}`, { gras: false, taille: 20 }),
    ...vide(6),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({
          text: arr ? "LE DÉLÉGUÉ D’ARRONDISSEMENT," : "LE DÉLÉGUÉ DÉPARTEMENTAL,",
          bold: true,
          size: 28,
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

/**
 * Liste des acronymes, sigles et abréviations : celle du canevas régional, que
 * le rapport départemental reprend à l'identique (39 cases, dont plusieurs
 * regroupent deux à six sigles). Les sigles regroupés sont ici séparés, un par
 * ligne. S'y ajoutent ceux que le rapport emploie désormais — BIP, IAHP,
 * PDCVEP, SE — marqués d'un commentaire.
 */
export const ACRONYMES: [string, string][] = [
  ["ACEFA", "Programme d'Amélioration de la Compétitivité des Exploitations Familiales Agropastorales"],
  ["ADOP", "Assemblée Départementale des Organisations des Producteurs"],
  ["AFOP", "Programme d’Appui à la rénovation et au développement de la Formation Professionnelle dans les secteurs de l’agriculture, de l’élevage et de la pêche"],
  ["AMO", "Programme d’Appui à la Maîtrise d’Ouvrage des Administrations du Secteur Rural MINADER – MINEPIA"],
  // Ajouté : employé par le tableau des infrastructures d'élevage.
  ["BIP", "Budget d’Investissement Public"],
  ["C2D", "Contrat Désendettement et Développement"],
  ["CACP", "Centre d’alevinage et de contrôle de pêche"],
  ["CDSP", "Commission Départementale de Sélection des Projets"],
  ["CGO", "Conseiller de Groupement des Organisations"],
  ["CGP", "Conseiller de Groupement des Producteurs"],
  ["CN", "Coordination Nationale"],
  ["CNFZV", "Centre National de Formation Zootechnique et Vétérinaire"],
  ["CODAC", "Commission Départementale d’Appui Conseil"],
  ["Cont. Adm", "Contractuel d’Administration"],
  ["CPY", "Centre Pasteur de Yaoundé"],
  ["CR", "Coordination Régionale"],
  ["CS", "Conseiller Spécialisé"],
  ["CTD", "Cellule Technique Départementale ou Collectivités Territoriales Décentralisées"],
  ["CTS", "Conseiller Technique Spécialisé"],
  ["CZV", "Centre Zootechnique et Vétérinaire"],
  ["DAC", "Dispositif d’Appui Conseil"],
  ["DAEPIA", "Délégation d’Arrondissement de l’Élevage, des Pêches et des Industries Animales"],
  ["DDEPIA", "Délégation Départementale de l’Élevage, des Pêches et des Industries Animales"],
  ["DDPIA", "Direction du Développement des Productions et des Industries Animales"],
  ["DHLPP", "Distemper Hepatitis Leptospirosis Parvo Parainfluenza"],
  ["DPAIH", "Direction de la Pêche, de l'Aquaculture et des Industries Halieutiques"],
  ["DREPIA", "Délégation Régionale de l’Élevage, des Pêches et des Industries Animales"],
  ["EFA", "Exploitation Familiale Agropastorale"],
  ["GIC", "Groupe d’Initiative Commune"],
  ["GP", "Groupement des Producteurs"],
  // Ajouté : surveillance sentinelle, chapitre IV.
  ["IAHP", "Influenza Aviaire Hautement Pathogène"],
  ["IBD", "Infectious Bursal Disease"],
  ["IPAVIC", "Interprofession Avicole du Cameroun"],
  ["ISV", "Inspection Sanitaire Vétérinaire"],
  ["JAPAP", "Journées d’Animation et de Promotion des Activités de Pêche"],
  ["Kg", "Kilogramme"],
  ["L", "Litre"],
  ["MINADER", "Ministère de l’Agriculture et du Développement Rural"],
  ["MINEPAT", "Ministère de l’Économie, de la Planification et de l’Aménagement du Territoire"],
  ["MINEPIA", "Ministère de l’Élevage, des Pêches et des Industries Animales"],
  ["MNC", "Maladie de New Castle"],
  ["OIE", "Organisation Internationale des Épizooties"],
  ["ONG", "Organisation Non Gouvernementale"],
  ["OPA", "Organisation des Producteurs Agropastoraux"],
  ["OU", "Ouest"],
  ["PACA", "Projet d’Amélioration de la Compétitivité Agricole"],
  // Ajouté : projet présenté en I-5-3.
  ["PDCVEP", "Projet de Développement des Chaînes de Valeur de l’Élevage et de la Pisciculture"],
  ["PNDP", "Programme National de Développement Participatif"],
  ["PNVRA", "Programme National de Vulgarisation et de Recherche Agricoles"],
  ["PPA", "Peste Porcine Africaine"],
  ["PPCB", "Péripneumonie Contagieuse des Bovidés"],
  ["PPR", "Peste des Petits Ruminants"],
  ["PRODEL", "Projet de Développement de l’Élevage"],
  ["PSREP", "Programme de Sécurisation des Recettes de l’Élevage et des Pêches"],
  ["QTE", "Quantité"],
  ["RCTE", "Responsable du Conseil Technico-économique"],
  // Ajouté : bilan épidémiologique, chapitre IV.
  ["SE", "Semaine épidémiologique"],
];

/** Le tableau des acronymes, sans légende — comme au régional. */
export function tableauAcronymes(): Table {
  const bordure = { style: BorderStyle.SINGLE, size: 1 };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: bordure, bottom: bordure, left: bordure, right: bordure,
      insideHorizontal: bordure, insideVertical: bordure,
    },
    rows: ACRONYMES.map(
      ([sigle, sens]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 20, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: sigle, bold: true, size: 20 })] })],
            }),
            new TableCell({
              width: { size: 80, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: sens, size: 20 })] })],
            }),
          ],
        })
    ),
  });
}

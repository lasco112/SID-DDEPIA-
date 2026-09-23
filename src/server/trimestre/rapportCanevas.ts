/**
 * Production du rapport trimestriel conforme au canevas.
 *
 * Remplace le premier générateur, qui dessinait ses propres tableaux à partir
 * des champs du SID et produisait un document que le canevas ne reconnaissait
 * pas. Ici, c'est le canevas qui commande : les 87 tableaux sont rendus dans
 * leur forme officielle, et les valeurs consolidées viennent remplir les cases
 * pour lesquelles une liaison a été écrite.
 *
 * Ce module est appelé aussi bien par la route de l'application que par le
 * script en ligne de commande : un seul chemin de production, donc un seul
 * comportement à vérifier.
 */
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, Header, PageBreak } from "docx";
import type { PrismaClient } from "@prisma/client";
import { SECTIONS_CANEVAS } from "./canevas/sections";
import { rendreSection, champsAutomatiques } from "./canevas/rendu";
import { pageDeGarde, tableauAcronymes } from "./canevas/pageDeGarde";
import { preremplirTablesAutomatiques } from "./canevas/tablesAutomatiques";
import { TEXTES_FIXES } from "./canevas/textesFixes";
import { TEXTES_ARRONDISSEMENTS } from "./canevas/textesArrondissements";
import type { ContexteCanevas, SectionCanevas } from "./canevas/types";
import { identiteDepartement } from "@/lib/departement";
import { passerControles, messageBlocage } from "./controles";

/** Un contrôle croisé du canevas a constaté une incohérence : on ne produit pas. */
export class ControlesCroisesError extends Error {
  name = "ControlesCroisesError";
}
import { champsMobilises, bilanLiaisons } from "./liaison";
import { lireRubriques } from "./rubriques";
import { preparer, fournisseur } from "./remplissage";
import type { LigneNonClassee } from "./evenements";
import { inspecterPeriode, type EtatPeriode } from "./agregation";
import {
  type Periode, libelleOfficiel, libelleCourt, memePeriodeAnneePrecedente, moisDeLaPeriode,
} from "../periodes/calendrier";

const MOIS_MAJ = [
  "JANVIER", "FÉVRIER", "MARS", "AVRIL", "MAI", "JUIN",
  "JUILLET", "AOÛT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DÉCEMBRE",
];

/** Les onze sections décrites, dans l'ordre du canevas (canevas/sections.ts). */
export { SECTIONS_CANEVAS };

/** Une zone de texte analytique du canevas, repérée dans sa section. */
export interface ZoneTexte {
  cle: string;
  consigne: string;
  sectionCle: string;
  sectionTitre: string;
  /** Le dernier titre rencontré avant la zone — situe le rédacteur. */
  contexte: string;
  /** Vrai si un texte fixe couvre déjà cette zone (introduction, missions…). */
  fixe: boolean;
}

/**
 * Les zones de texte du canevas, dans l'ordre où le rédacteur les rencontre.
 *
 * L'inventaire est déduit de la description du canevas, jamais tenu à jour à la
 * main : décrire une nouvelle zone dans une section la fait apparaître à
 * l'écran de rédaction sans autre intervention.
 */
export function zonesTexte(options: { arrondissement?: boolean } = {}): ZoneTexte[] {
  // Les zones qui ont un texte de référence : celles du département, ou
  // celles que chaque arrondissement reçoit toutes rédigées.
  const fixes = options.arrondissement
    ? new Set(Array.from(TEXTES_ARRONDISSEMENTS.values()).flatMap((t) => Object.keys(t)))
    : new Set(Array.from(TEXTES_FIXES.keys()));

  const zones: ZoneTexte[] = [];
  for (const section of SECTIONS_CANEVAS) {
    let contexte = section.titre;
    for (const bloc of section.blocs) {
      if (bloc.type === "titre") contexte = bloc.texte;
      else if (bloc.type === "zoneTexte") {
        zones.push({
          cle: bloc.cle,
          consigne: bloc.consigne,
          sectionCle: section.cle,
          sectionTitre: section.titre,
          contexte,
          fixe: fixes.has(bloc.cle),
        });
      }
    }
  }
  return zones;
}

/** Les six arrondissements, dans l'ordre du canevas. */
async function arrondissementsDe(db: PrismaClient): Promise<{ id: string; nom: string }[]> {
  return db.arrondissement.findMany({ orderBy: { ordre: "asc" }, select: { id: true, nom: true } });
}

export interface RapportProduit {
  buffer: Buffer;
  nomFichier: string;
  etat: EtatPeriode;
  /** Nombre de rubriques que le SID alimente automatiquement. */
  rubriquesAlimentees: number;
  /** Nombre de valeurs effectivement consolidées. */
  valeursConsolidees: number;
  /**
   * Lignes des listes mensuelles (vaccinations, cliniques, circulation) qui ne
   * correspondent à aucune case du canevas : le Délégué décide de leur sort.
   */
  lignesNonClassees: LigneNonClassee[];
}

export async function genererRapportCanevas(
  db: PrismaClient,
  periode: Periode,
  options: {
    autoriserIncomplet?: boolean;
    textes?: Map<string, string>;
    /**
     * Nom d'un arrondissement pour produire SON rapport, au lieu du rapport
     * départemental. Le canevas est alors rendu avec une seule colonne
     * territoriale — la sienne — exactement comme le canevas départemental est
     * le canevas régional ramené aux six arrondissements.
     */
    arrondissement?: string;
  } = {}
): Promise<RapportProduit> {
  const identite = await identiteDepartement(db);
  const tous = await arrondissementsDe(db);
  const sien = options.arrondissement
    ? tous.find((a) => a.nom === options.arrondissement)
    : undefined;
  if (options.arrondissement && !sien) {
    throw new Error(
      `Arrondissement inconnu : « ${options.arrondissement} ». ` +
        `Attendu l'un de : ${tous.map((a) => a.nom).join(", ")}.`
    );
  }

  // Le rapport d'un DA est jugé complet sur SES transmissions ; le rapport
  // départemental attend les six arrondissements.
  const etat = await inspecterPeriode(db, periode, { arrondissementId: sien?.id });

  const ctx: ContexteCanevas = {
    periodeCourt: libelleCourt(periode),
    periodeCourtN1: libelleCourt(memePeriodeAnneePrecedente(periode)),
    annee: periode.annee,
    mois: moisDeLaPeriode(periode).map((m) => MOIS_MAJ[m.mois - 1]),
    arrondissements: sien ? [sien.nom] : tous.map((a) => a.nom),
    arrondissement: options.arrondissement,
    departement: { nomAvecArticle: identite.nomAvecArticle, sigle: identite.sigle },
  };

  /*
   * Les contrôles croisés du canevas (CDC) : « aucune génération n'est possible
   * tant que ces contrôles échouent ». Un contrôle NON CALCULABLE ne bloque
   * pas — il n'a rien constaté ; seul un contrôle qui a vu une incohérence
   * arrête la production. Le rapport d'un arrondissement n'y est pas soumis :
   * ces contrôles portent sur des tableaux départementaux.
   */
  const trimestreExistant = await db.periodeReporting.findFirst({
    where: { type: "TRIMESTRIEL", annee: periode.annee, trimestre: periode.rang },
    select: { id: true },
  });
  const controles = options.arrondissement
    ? null
    : await passerControles(db, periode, trimestreExistant?.id ?? null, ctx.mois, [
        "DDEPIA",
        ...tous.map((a) => a.nom),
      ]);
  if (controles && controles.violations.length > 0) {
    throw new ControlesCroisesError(messageBlocage(controles));
  }

  const donnees = await preparer(db, periode, champsMobilises(), {
    autoriserIncomplet: options.autoriserIncomplet,
    arrondissementId: sien?.id,
  });
  const valeur = fournisseur(donnees, ctx);
  const bilan = bilanLiaisons();
  const provisoire = !etat.calculable;

  // Page de garde du rapport départemental (décisions D5, D8), puis les pièces
  // liminaires du régional. La note technique qui annonçait « N rubriques
  // renseignées automatiquement » a disparu : elle n'a pas sa place dans un
  // document officiel.
  const garde = pageDeGarde({ identite, periode, arrondissement: options.arrondissement });
  if (provisoire) {
    const raisons = [...etat.moisAbsents, ...etat.moisIncomplets];
    garde.splice(
      garde.length - 1,
      0,
      new Paragraph({ text: "" }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `DOCUMENT PROVISOIRE — période incomplète : ${raisons.join(", ")}`,
            bold: true, color: "B00020", size: 20,
          }),
        ],
      })
    );
  }

  const enfants: unknown[] = [
    ...garde,
    ...champsAutomatiques(),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "LISTE DES ACRONYMES, SIGLES ET ABRÉVIATIONS", bold: true })],
    }),
    tableauAcronymes(),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  /**
   * Les textes qui ne changent pas d'une période à l'autre sont repris
   * automatiquement. Un texte fourni pour la période l'emporte : le rédacteur
   * garde le dernier mot sur ce qui sort sous sa signature.
   *
   * Les textes du Délégué départemental ne doivent JAMAIS figurer dans le
   * rapport d'un arrondissement : son introduction annonce « l'ensemble des 06
   * arrondissements », ses missions sont celles de la Délégation
   * départementale. Un DA qui signerait cela signerait le texte d'un autre.
   *
   * Dans un rapport d'arrondissement, on ne reprend donc QUE ses propres
   * textes. Les zones qu'il n'a pas renseignées gardent leur consigne — mieux
   * vaut une consigne visible qu'un texte emprunté.
   */
  const textes = options.arrondissement ? new Map<string, string>() : new Map(TEXTES_FIXES);

  if (options.arrondissement) {
    // Ses textes à LUI : présentation, pédologie, démographie, missions,
    // vision, organisation, introduction, bibliographie de ses sources.
    for (const [cle, texte] of Object.entries(TEXTES_ARRONDISSEMENTS.get(options.arrondissement) ?? {})) {
      if (texte?.trim()) textes.set(cle, texte);
    }
  }

  // Ce que le rédacteur a écrit pour CETTE période l'emporte sur le texte fixe :
  // le fixe n'est qu'un point de départ, pas une contrainte.
  (await lireRubriques(db, periode, sien?.id ?? null)).forEach((t, cle) => textes.set(cle, t));

  options.textes?.forEach((t, cle) => textes.set(cle, t));

  const compteur = { tableaux: 0 };
  for (const section of SECTIONS_CANEVAS) {
    enfants.push(...rendreSection(section, { ctx, valeur, textes, compteur }));
  }

  // La signature est portée par la page de garde, comme au rapport
  // départemental et au régional : c'est elle que le cachet vient compléter.

  const document = new Document({
    // Word propose à l'ouverture de mettre à jour la table des matières et les
    // listes : le Délégué n'a plus à les reconstruire à la main.
    features: { updateFields: true },
    styles: {
      default: { document: { run: { font: "Times New Roman" } } },
    },
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

  // Table des matières et listes écrites d’avance : jamais de page blanche,
  // même sans mise à jour des champs par Word (canevas/tablesAutomatiques.ts).
  const buffer = preremplirTablesAutomatiques(Buffer.from(await Packer.toBuffer(document)));
  const qui = options.arrondissement
    ? `DAEPIA-${options.arrondissement.replace(/[ ’']/g, "")}`
    : identite.sigle;
  const nomFichier =
    `Rapport_${libelleCourt(periode).replace(/\s/g, "")}_${qui}` +
    `${provisoire ? "_BROUILLON" : ""}.docx`;

  return {
    buffer,
    nomFichier,
    etat,
    rubriquesAlimentees: bilan.casesLiees,
    valeursConsolidees: donnees.renseignees,
    lignesNonClassees: donnees.evenements.nonClassees,
  };
}

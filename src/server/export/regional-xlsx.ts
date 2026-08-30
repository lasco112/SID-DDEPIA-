/**
 * regional-xlsx.ts — l'export consolidé destiné à la DREPIA-Ouest (lot 16).
 *
 * Ce que le niveau régional attend
 * --------------------------------
 * Le canevas régional est **semestriel**, et sa colonne territoriale porte les
 * huit départements de l'Ouest là où le canevas départemental porte les six
 * arrondissements. La DDEPIA produit donc ici SA contribution : ses valeurs
 * consolidées sur le semestre, prêtes à être versées dans le document régional.
 *
 * DÉCISION D'ARCHITECTURE : la DREPIA reçoit un DOCUMENT, elle ne consulte pas
 * le SID. Aucun rôle régional n'est créé, aucune politique de cloisonnement
 * n'est rouverte : un département ne voit toujours que lui-même. Le jour où le
 * niveau régional voudra consulter en ligne, ce sera un autre chantier, avec sa
 * propre maille de cloisonnement.
 *
 * Pourquoi ce module et pas `drepia-xlsx.ts`
 * ------------------------------------------
 * L'export mensuel somme les saisies d'UNE période. Un semestre n'a aucune
 * saisie propre : ses valeurs se calculent à partir des six mois. Et elles ne
 * se somment PAS toutes — un cheptel est un STOCK, dont on prend la valeur de
 * fin de période ; le sommer sur six mois multiplierait par six le cheptel du
 * département. C'est l'erreur la plus grave que ce système puisse commettre.
 *
 * On passe donc obligatoirement par le moteur d'agrégation, qui applique à
 * chaque champ sa règle explicite — et refuse de calculer une période
 * incomplète, sauf demande expresse d'un document marqué provisoire.
 */
import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { agreger, type EtatPeriode, type ValeurAgregee } from "../trimestre/agregation";
import {
  type Periode,
  libelleOfficiel,
  libelleCourt,
  memePeriodeAnneePrecedente,
  moisDeLaPeriode,
} from "../periodes/calendrier";
import { listerArrondissements } from "../../lib/arrondissements";
import { identiteDepartement } from "../../lib/departement";

/** Ce que la règle d'agrégation dit au lecteur du document. */
const LIBELLE_REGLE: Record<string, string> = {
  SOMME: "somme des six mois",
  DERNIERE_VALEUR: "état en fin de période",
  MOYENNE_PONDEREE: "moyenne pondérée",
  TEXTE: "texte",
};

/**
 * La ligne `PeriodeReporting` d'un semestre, créée si elle n'existe pas.
 *
 * Même raison que pour le trimestre (voir `periodeTrimestrielle`) : un document
 * archivé doit se rattacher à une période durable. Un semestre ne se saisit
 * pas, il se calcule : les échéances sont posées à sa fin pour que les colonnes
 * obligatoires portent une valeur sensée, et ne commandent aucun verrouillage.
 */
export async function periodeSemestrielle(db: PrismaClient, p: Periode): Promise<string> {
  const mois = moisDeLaPeriode(p);
  const semestre = Math.floor((mois[0].mois - 1) / 6) + 1;

  const existante = await db.periodeReporting.findFirst({
    where: { type: "SEMESTRIEL", annee: p.annee, semestre },
    select: { id: true },
  });
  if (existante) return existante.id;

  const dernier = mois.at(-1)!;
  const finDuSemestre = new Date(Date.UTC(dernier.annee, dernier.mois, 0));
  const creee = await db.periodeReporting.create({
    data: {
      type: "SEMESTRIEL",
      annee: p.annee,
      semestre,
      dateOuverture: new Date(Date.UTC(mois[0].annee, mois[0].mois - 1, 1)),
      dateLimiteDA: finDuSemestre,
      dateLimiteChef: finDuSemestre,
      dateLimiteDD: finDuSemestre,
    },
    select: { id: true },
  });
  return creee.id;
}

/** Range les valeurs consolidées : champ → arrondissement (ou null) → valeur. */
function ranger(valeurs: ValeurAgregee[]) {
  const parChamp = new Map<string, Map<string | null, number | null>>();
  const regleDe = new Map<string, string>();
  for (const v of valeurs) {
    const m = parChamp.get(v.fieldCode) ?? new Map<string | null, number | null>();
    parChamp.set(v.fieldCode, m);
    m.set(v.arrondissementCode, v.valeur);
    regleDe.set(v.fieldCode, v.regle);
  }
  return { parChamp, regleDe };
}

const fmt = (v: number | null | undefined) => (v == null ? "—" : v);

export interface ExportRegionalProduit {
  buffer: Buffer;
  nomFichier: string;
  etat: EtatPeriode;
  /** Nombre de valeurs effectivement consolidées — ce que le document apporte. */
  valeursConsolidees: number;
}

/**
 * Produit l'export consolidé du semestre.
 *
 * `autoriserIncomplet` ne doit servir qu'à un tirage de contrôle : le document
 * porte alors, en toutes lettres, la mention qui l'empêche d'être pris pour un
 * document officiel.
 */
export async function genererExportRegional(
  db: PrismaClient,
  periode: Periode,
  options: { autoriserIncomplet?: boolean } = {}
): Promise<ExportRegionalProduit> {
  const identite = await identiteDepartement(db);
  const arrondissements = await listerArrondissements(db);

  // Le moteur applique à chaque champ SA règle : rien n'est sommé par défaut.
  const { etat, valeurs } = await agreger(db, periode, {
    autoriserIncomplet: options.autoriserIncomplet,
  });
  const { parChamp, regleDe } = ranger(valeurs);

  // L'année précédente ne doit pas empêcher de produire le semestre : son
  // absence prive seulement le document de sa colonne de comparaison.
  let parChampN1 = new Map<string, Map<string | null, number | null>>();
  try {
    const precedent = await agreger(db, memePeriodeAnneePrecedente(periode), { autoriserIncomplet: true });
    parChampN1 = ranger(precedent.valeurs).parChamp;
  } catch {
    parChampN1 = new Map();
  }

  const provisoire = !etat.calculable;

  const wb = new ExcelJS.Workbook();
  wb.creator = identite.application;
  wb.created = new Date();

  // --- LISEZ-MOI -------------------------------------------------------------
  const meta = wb.addWorksheet("LISEZ-MOI");
  meta.addRows([
    [`EXPORT CONSOLIDÉ ${identite.sigle.toUpperCase()} → DREPIA-OUEST`],
    [],
    ["Période", libelleOfficiel(periode)],
    ["Département", identite.intituleCourt],
    ["Date de génération", new Date().toLocaleString("fr-FR")],
    ["Source", `Système d'Information Décisionnel ${identite.sigle}`],
    [],
    ["Convention", "Une cellule « — » signifie donnée non renseignée (≠ zéro)."],
    ["", "La colonne « Règle » dit comment la valeur a été obtenue à partir des six mois."],
    ["", "Un STOCK (cheptel, étangs, infrastructures) n'est JAMAIS sommé : c'est l'état de fin de période."],
  ]);
  meta.getCell("A1").font = { bold: true, size: 14 };
  meta.getColumn(1).width = 24;
  meta.getColumn(2).width = 78;

  if (provisoire) {
    const raisons = [...etat.moisAbsents, ...etat.moisIncomplets];
    const ligne = meta.addRow(["DOCUMENT PROVISOIRE", `période incomplète : ${raisons.join(", ")}`]);
    ligne.font = { bold: true, color: { argb: "FFB00020" } };
  }

  // --- Un onglet par section -------------------------------------------------
  const sections = await db.section.findMany({ orderBy: { ordre: "asc" } });
  const unites = await db.referentielItem.findMany({ where: { categorie: "UNITE" } });
  const uniteLibelle = new Map(unites.map((u) => [u.code, u.libelle]));

  const codesArr = arrondissements.map((a) => a.code);
  let valeursConsolidees = 0;

  for (const section of sections) {
    const templates = await db.formTemplate.findMany({
      where: { sectionId: section.id, actif: true, type: { in: ["MATRICE", "NOMINATIF"] } },
      include: { fields: { where: { actif: true }, orderBy: { ordre: "asc" } } },
      orderBy: { ordre: "asc" },
    });
    if (templates.length === 0) continue;

    const ws = wb.addWorksheet(section.code);
    ws.addRow([
      "CODE",
      "Indicateur",
      "Unité",
      ...codesArr,
      identite.colonneTotal,
      `TOTAL ${periode.annee - 1}`,
      "ÉCART",
      "Règle",
    ]).font = { bold: true };
    ws.getColumn(1).width = 32;
    ws.getColumn(2).width = 48;
    ws.getColumn(codesArr.length + 7).width = 24;

    for (const tpl of templates) {
      const titre = ws.addRow([`— Tableau ${tpl.numero} : ${tpl.titre} —`]);
      titre.font = { bold: true, italic: true };

      for (const field of tpl.fields) {
        const parArr = parChamp.get(field.code);
        if (!parArr) continue; // champ sans règle applicable sur la période

        const total = parArr.get(null) ?? null;
        const totalN1 = parChampN1.get(field.code)?.get(null) ?? null;
        if (total != null) valeursConsolidees++;

        ws.addRow([
          field.code,
          field.libelle,
          field.uniteCode ? uniteLibelle.get(field.uniteCode) ?? field.uniteCode : "",
          ...codesArr.map((code) => fmt(parArr.get(code))),
          fmt(total),
          fmt(totalN1),
          total != null && totalN1 != null ? total - totalN1 : "—",
          LIBELLE_REGLE[regleDe.get(field.code) ?? ""] ?? regleDe.get(field.code) ?? "",
        ]);
      }
      ws.addRow([]);
    }
  }

  const nomFichier =
    `Export_Regional_${libelleCourt(periode).replace(/[ /]/g, "")}_${identite.sigle}` +
    `${provisoire ? "_PROVISOIRE" : ""}.xlsx`;

  return {
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
    nomFichier,
    etat,
    valeursConsolidees,
  };
}

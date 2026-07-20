/**
 * rapport-docx.ts — Moteur d'agrégation + rendu docxtemplater pour les
 * rapports mensuels DA et DD (CDC §M7, §M8, §A.5).
 * ---------------------------------------------------------------------------
 * Sur une période MENSUELLE, l'agrégation inter-arrondissements est toujours
 * une somme (photo STOCK ou flux SOMME, peu importe : on additionne les 6
 * arrondissements du MÊME mois). La distinction STOCK/SOMME ne joue que sur
 * les périodes multi-mois (trimestre/semestre/année, phase 3) — voir
 * lib/aggregationRules.ts.
 *
 * La mise en page de chaque tableau (canevasLayout.ts) dicte la forme du
 * payload attendu par buildReportTemplates.ts :
 *   - MATRICE  : {code}_{arr}, {code}_TOTAL, {code}_TOTAL_PREC (tous types de
 *     mise en page confondus — les tableaux "tableau départemental" n'en
 *     utilisent que _TOTAL/_TOTAL_PREC, les autres balises restent inutilisées
 *     mais inoffensives) ; rapport DA : {code}, {code}_PREC (son arrondissement).
 *   - NOMINATIF_LOOP / EVENEMENT_LOOP : tableau JSON nommé {templateCode},
 *     une entrée par établissement/événement, avec ARR ajouté côté DD.
 */

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { CANEVAS_LAYOUTS } from "../../../prisma/seed-lib/canevasLayout";

const ARR_CODES = ["DSC", "FOK", "FGT", "NKN", "PKM", "STC"] as const;
const MOIS_FR = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
// Graphie exacte du canevas (majuscules, sans accent) — voir buildReportTemplates.ts.
const ARR_NOMS_CANEVAS: Record<string, string> = {
  DSC: "DSCHANG",
  FOK: "FOKOUE",
  FGT: "FONGO TONGO",
  NKN: "NKONG NI",
  PKM: "PENKA MICHEL",
  STC: "SANTCHOU",
};

function fmt(v: number | null): string {
  if (v == null) return "N/D";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(v);
}

async function resolvePeriodeMois(annee: number, mois: number) {
  let a = annee;
  let m = mois;
  if (m === 0) {
    a -= 1;
    m = 12;
  }
  return db.periodeReporting.findFirst({ where: { type: "MENSUEL", annee: a, mois: m } });
}

async function sommeMatrice(periodeId: string, fieldCode: string, arrCode: string | null): Promise<number | null> {
  const saisies = await db.saisieMatrice.findMany({
    where: {
      fieldCode,
      nonRenseigne: false,
      rapport: { periodeId, statut: { in: ["SOUMIS", "CLOTURE"] }, ...(arrCode ? { arrondissement: { code: arrCode } } : {}) },
    },
    select: { valeur: true },
  });
  const valeurs = saisies.map((s) => (s.valeur == null ? null : Number(s.valeur))).filter((v): v is number => v != null);
  return valeurs.length === 0 ? null : valeurs.reduce((a, b) => a + b, 0);
}

/** Champ MATRICE de type TEXTE (ex. T21_LIEUX) : une valeur par arrondissement, jamais sommée. */
async function dernierTexteMatrice(periodeId: string, fieldCode: string, arrCode: string | null): Promise<string | null> {
  const saisie = await db.saisieMatrice.findFirst({
    where: {
      fieldCode,
      nonRenseigne: false,
      rapport: { periodeId, statut: { in: ["SOUMIS", "CLOTURE"] }, ...(arrCode ? { arrondissement: { code: arrCode } } : {}) },
    },
    select: { valeurTexte: true },
  });
  return saisie?.valeurTexte ?? null;
}

async function sommeNominatif(periodeId: string, fieldCode: string, arrCode: string | null): Promise<number | null> {
  const saisies = await db.saisieNominative.findMany({
    where: {
      fieldCode,
      nonRenseigne: false,
      rapport: { periodeId, statut: { in: ["SOUMIS", "CLOTURE"] }, ...(arrCode ? { arrondissement: { code: arrCode } } : {}) },
    },
    select: { valeur: true },
  });
  const valeurs = saisies.map((s) => (s.valeur == null ? null : Number(s.valeur))).filter((v): v is number => v != null);
  return valeurs.length === 0 ? null : valeurs.reduce((a, b) => a + b, 0);
}

/** Somme d'une clé numérique du payload JSON à travers les événements déclarés (ligne "Total" du canevas). */
async function sommeEvenementNumerique(periodeId: string, templateCode: string, cle: string, arrCode: string | null): Promise<number | null> {
  const template = await db.formTemplate.findUnique({ where: { code: templateCode } });
  if (!template) return null;
  const saisies = await db.saisieEvenement.findMany({
    where: { templateId: template.id, rapport: { periodeId, statut: { in: ["SOUMIS", "CLOTURE"] }, ...(arrCode ? { arrondissement: { code: arrCode } } : {}) } },
    select: { payload: true },
  });
  const valeurs = saisies
    .map((s) => Number((s.payload as Record<string, unknown>)?.[cle]))
    .filter((v): v is number => !Number.isNaN(v));
  return valeurs.length === 0 ? null : valeurs.reduce((a, b) => a + b, 0);
}

/** Lignes "Total Mois Courant"/"Total Mois Précédent" des tableaux NOMINATIF/EVENEMENT (canevas). */
async function ajouterTotauxListes(
  payload: Record<string, unknown>,
  templates: { code: string; type: string }[],
  periodeId: string,
  moisPrecedentId: string | undefined,
  arrCode: string | null
) {
  for (const t of templates) {
    const layout = CANEVAS_LAYOUTS[t.code];
    if (t.type === "NOMINATIF" && layout?.kind === "NOMINATIF_LOOP") {
      for (const c of layout.cols) {
        payload[`${c.code}_TOTAL`] = fmt(await sommeNominatif(periodeId, c.code, arrCode));
        payload[`${c.code}_TOTAL_PREC`] = moisPrecedentId ? fmt(await sommeNominatif(moisPrecedentId, c.code, arrCode)) : "N/D";
      }
    } else if (t.type === "EVENEMENT" && layout?.kind === "EVENEMENT_LOOP") {
      for (const c of layout.cols.filter((c) => c.numeric)) {
        payload[`${t.code}_${c.key}_TOTAL`] = fmt(await sommeEvenementNumerique(periodeId, t.code, c.key, arrCode));
        payload[`${t.code}_${c.key}_TOTAL_PREC`] = moisPrecedentId ? fmt(await sommeEvenementNumerique(moisPrecedentId, t.code, c.key, arrCode)) : "N/D";
      }
    }
  }
}

/** Une ligne par établissement (canevas NOMINATIF) — DD : tous arrondissements + colonne ARR ; DA : un seul arrondissement. */
async function nominatifLoopRows(periodeId: string, templateCode: string, fieldCodes: string[], arrCode: string | null) {
  const template = await db.formTemplate.findUnique({ where: { code: templateCode } });
  if (!template) return [];
  const saisies = await db.saisieNominative.findMany({
    where: { templateId: template.id, rapport: { periodeId, statut: { in: ["SOUMIS", "CLOTURE"] }, ...(arrCode ? { arrondissement: { code: arrCode } } : {}) } },
    include: { etablissement: true, rapport: { include: { arrondissement: true } } },
  });

  const byEtab = new Map<string, Record<string, string>>();
  const ordreEtab = new Map<string, { ordre: number; nom: string }>();
  for (const s of saisies) {
    let r = byEtab.get(s.etablissementId);
    if (!r) {
      r = { ARR: s.rapport.arrondissement.nom, NOM: s.etablissement.nom, LOCALITE: s.etablissement.localite };
      byEtab.set(s.etablissementId, r);
      ordreEtab.set(s.etablissementId, { ordre: s.rapport.arrondissement.ordre, nom: s.etablissement.nom });
    }
    r[s.fieldCode] = s.nonRenseigne || s.valeur == null ? "N/D" : fmt(Number(s.valeur));
  }
  for (const r of Array.from(byEtab.values())) for (const fc of fieldCodes) if (!(fc in r)) r[fc] = "N/D";
  return Array.from(byEtab.entries())
    .sort(([idA], [idB]) => {
      const a = ordreEtab.get(idA)!;
      const b = ordreEtab.get(idB)!;
      return a.ordre - b.ordre || a.nom.localeCompare(b.nom);
    })
    .map(([, r]) => r);
}

/** Une ligne par événement déclaré (canevas EVENEMENT) — DD : tous arrondissements + colonne ARR ; DA : un seul arrondissement. */
async function evenementLoopRows(
  periodeId: string,
  templateCode: string,
  cols: { key: string; label: string; ref?: string }[],
  arrCode: string | null
) {
  const template = await db.formTemplate.findUnique({ where: { code: templateCode } });
  if (!template) return [];
  const saisies = await db.saisieEvenement.findMany({
    where: { templateId: template.id, rapport: { periodeId, statut: { in: ["SOUMIS", "CLOTURE"] }, ...(arrCode ? { arrondissement: { code: arrCode } } : {}) } },
    include: { rapport: { include: { arrondissement: true } } },
  });

  const refCategories = Array.from(new Set(cols.filter((c) => c.ref).map((c) => c.ref!)));
  const refItems = refCategories.length
    ? await db.referentielItem.findMany({ where: { categorie: { in: refCategories as any } } })
    : [];
  const refLibelle = new Map(refItems.map((r) => [`${r.categorie}:${r.code}`, r.libelle]));

  const rows = saisies.map((s) => {
    const p = (s.payload as Record<string, unknown>) ?? {};
    const row: Record<string, string> = { ARR: s.rapport.arrondissement.nom };
    for (const c of cols) {
      const raw = p[c.key];
      if (raw == null || raw === "") row[c.key] = "—";
      else if (c.ref) row[c.key] = refLibelle.get(`${c.ref}:${raw}`) ?? String(raw);
      else if (typeof raw === "number") row[c.key] = fmt(raw);
      else row[c.key] = String(raw);
    }
    return { ordre: s.rapport.arrondissement.ordre, row };
  });
  rows.sort((a, b) => a.ordre - b.ordre);
  return rows.map(({ row }) => row);
}

/** Rapport DD uniquement : mêmes événements que evenementLoopRows, mais groupés par arrondissement
 *  (avec sous-total mois courant par groupe) au lieu d'une liste à plat — demande explicite du chef
 *  de section vétérinaire, qui doit vérifier minutieusement chaque arrondissement contre le terrain ;
 *  voir renderEvenementLoopGroupe dans buildReportTemplates.ts pour le rendu correspondant. */
async function evenementLoopRowsGroupes(
  periodeId: string,
  templateCode: string,
  cols: { key: string; label: string; ref?: string; numeric?: boolean }[]
): Promise<Record<string, unknown>[]> {
  const template = await db.formTemplate.findUnique({ where: { code: templateCode } });
  if (!template) return [];
  const saisies = await db.saisieEvenement.findMany({
    where: { templateId: template.id, rapport: { periodeId, statut: { in: ["SOUMIS", "CLOTURE"] } } },
    include: { rapport: { include: { arrondissement: true } } },
  });

  const refCategories = Array.from(new Set(cols.filter((c) => c.ref).map((c) => c.ref!)));
  const refItems = refCategories.length
    ? await db.referentielItem.findMany({ where: { categorie: { in: refCategories as any } } })
    : [];
  const refLibelle = new Map(refItems.map((r) => [`${r.categorie}:${r.code}`, r.libelle]));

  const byArr = new Map<string, { ordre: number; code: string; nom: string; items: Record<string, string>[] }>();
  for (const s of saisies) {
    const arr = s.rapport.arrondissement;
    let g = byArr.get(arr.code);
    if (!g) {
      g = { ordre: arr.ordre, code: arr.code, nom: arr.nom, items: [] };
      byArr.set(arr.code, g);
    }
    const p = (s.payload as Record<string, unknown>) ?? {};
    const item: Record<string, string> = {};
    for (const c of cols) {
      const raw = p[c.key];
      if (raw == null || raw === "") item[c.key] = "—";
      else if (c.ref) item[c.key] = refLibelle.get(`${c.ref}:${raw}`) ?? String(raw);
      else if (typeof raw === "number") item[c.key] = fmt(raw);
      else item[c.key] = String(raw);
    }
    g.items.push(item);
  }

  const groupes = Array.from(byArr.values()).sort((a, b) => a.ordre - b.ordre);
  const numericCols = cols.filter((c) => c.numeric);
  const resultat: Record<string, unknown>[] = [];
  for (const g of groupes) {
    const entree: Record<string, unknown> = { ARR_NOM: g.nom, items: g.items };
    for (const c of numericCols) {
      entree[`${c.key}_SOUSTOTAL`] = fmt(await sommeEvenementNumerique(periodeId, templateCode, c.key, g.code));
    }
    resultat.push(entree);
  }
  return resultat;
}

export interface CompletudeDD {
  complet: boolean;
  daManquants: string[];
  sectionsNonValidees: string[];
}

export async function verifierCompletudeDD(periodeId: string): Promise<CompletudeDD> {
  const [periode, arrondissements, rapports, validations] = await Promise.all([
    db.periodeReporting.findUniqueOrThrow({ where: { id: periodeId } }),
    db.arrondissement.findMany({ orderBy: { ordre: "asc" } }),
    db.rapportArrondissement.findMany({ where: { periodeId }, include: { arrondissement: true } }),
    db.validationSection.findMany({ where: { periodeId }, include: { section: true } }),
  ]);
  const daManquants = arrondissements
    .filter((a) => !rapports.some((r) => r.arrondissementId === a.id && (r.statut === "SOUMIS" || r.statut === "CLOTURE")))
    .map((a) => a.nom);
  // Le BAC ne contrôle aucun des 28 tableaux (dictionnaire de données) : sa validation
  // n'est pas bloquante pour le rapport MENSUEL (demande explicite du DD). Elle
  // redeviendra obligatoire pour les périodes trimestrielle/semestrielle/annuelle
  // (phase ultérieure, non encore implémentée).
  const sectionsNonValidees = validations
    .filter((v) => v.statut !== "VALIDE")
    .filter((v) => !(periode.type === "MENSUEL" && v.section.code === "BAC"))
    .map((v) => v.section.code);
  return { complet: daManquants.length === 0 && sectionsNonValidees.length === 0, daManquants, sectionsNonValidees };
}

async function construirePayloadCommun(periodeId: string, mois: number, annee: number) {
  const payload: Record<string, unknown> = {
    MOIS_LIBELLE: MOIS_FR[mois - 1],
    ANNEE: String(annee),
    DATE_GENERATION: new Date().toLocaleDateString("fr-FR"),
  };

  const templates = await db.formTemplate.findMany({
    where: { actif: true },
    include: { fields: { where: { actif: true } } },
  });

  const moisPrecedent = await resolvePeriodeMois(annee, mois - 1);

  return { payload, templates, moisPrecedent };
}

function sommeOuNull(...valeurs: (number | null)[]): number | null {
  const presentes = valeurs.filter((v): v is number => v != null);
  return presentes.length === 0 ? null : presentes.reduce((a, b) => a + b, 0);
}

/**
 * Lignes "Total Mois Courant"/"Total Mois Précédent" que le canevas ajoute au
 * bas de certains tableaux départementaux (somme des catégories/lignes du
 * tableau, colonne par colonne) — cas générique (2.4, 5.1–5.6) + cas
 * particuliers T16 (pêche) et T17 (pisciculture), qui ne sont pas des
 * DEPT_TABLE génériques.
 */
function ajouterTotauxColonnes(
  payload: Record<string, unknown>,
  templates: { code: string }[],
  rawTotal: Map<string, number | null>,
  rawTotalPrec: Map<string, number | null>
) {
  for (const t of templates) {
    const layout = CANEVAS_LAYOUTS[t.code];
    if ((layout?.kind === "DEPT_TABLE" && layout.showTotalRow) || layout?.kind === "COMMERCIALISATION") {
      const nbCols = layout.kind === "DEPT_TABLE" ? layout.colHeaders.length : 7;
      for (let j = 0; j < nbCols; j++) {
        const codes = layout.rows.map((r) => r.codes[j]).filter((c): c is string => c != null);
        payload[`${t.code}_COLTOTAL_${j}`] = fmt(sommeOuNull(...codes.map((c) => rawTotal.get(c) ?? null)));
        payload[`${t.code}_COLTOTAL_${j}_PREC`] = fmt(sommeOuNull(...codes.map((c) => rawTotalPrec.get(c) ?? null)));
      }
    }
  }

  for (const [espece, continentale, maritime] of [
    ["POISSON", "T16_POISSON_CONTINENTALE", "T16_POISSON_MARITIME"],
    ["CREVETTE", "T16_CREVETTE_CONTINENTALE", "T16_CREVETTE_MARITIME"],
  ] as const) {
    const c = rawTotal.get(continentale) ?? null;
    const m = rawTotal.get(maritime) ?? null;
    payload[`T16_${espece}_TOTAL`] = fmt(sommeOuNull(c, m));
    const cp = rawTotalPrec.get(continentale) ?? null;
    const mp = rawTotalPrec.get(maritime) ?? null;
    payload[`T16_${espece}_TOTAL_PREC`] = fmt(sommeOuNull(cp, mp));
  }
  payload.T16_ROWTOTAL_CONTINENTALE = fmt(sommeOuNull(rawTotal.get("T16_POISSON_CONTINENTALE") ?? null, rawTotal.get("T16_CREVETTE_CONTINENTALE") ?? null));
  payload.T16_ROWTOTAL_MARITIME = fmt(sommeOuNull(rawTotal.get("T16_POISSON_MARITIME") ?? null, rawTotal.get("T16_CREVETTE_MARITIME") ?? null));
  payload.T16_ROWTOTAL_TOTAL = fmt(
    sommeOuNull(
      rawTotal.get("T16_POISSON_CONTINENTALE") ?? null,
      rawTotal.get("T16_POISSON_MARITIME") ?? null,
      rawTotal.get("T16_CREVETTE_CONTINENTALE") ?? null,
      rawTotal.get("T16_CREVETTE_MARITIME") ?? null
    )
  );
  payload.T16_ROWTOTAL_CONTINENTALE_PREC = fmt(sommeOuNull(rawTotalPrec.get("T16_POISSON_CONTINENTALE") ?? null, rawTotalPrec.get("T16_CREVETTE_CONTINENTALE") ?? null));
  payload.T16_ROWTOTAL_MARITIME_PREC = fmt(sommeOuNull(rawTotalPrec.get("T16_POISSON_MARITIME") ?? null, rawTotalPrec.get("T16_CREVETTE_MARITIME") ?? null));
  payload.T16_ROWTOTAL_TOTAL_PREC = fmt(
    sommeOuNull(
      rawTotalPrec.get("T16_POISSON_CONTINENTALE") ?? null,
      rawTotalPrec.get("T16_POISSON_MARITIME") ?? null,
      rawTotalPrec.get("T16_CREVETTE_CONTINENTALE") ?? null,
      rawTotalPrec.get("T16_CREVETTE_MARITIME") ?? null
    )
  );

  const especesPisciculture = ["CLARIAS", "CARPE", "KANGA", "HEMICHROMIS", "TILAPIA"];
  for (const mesure of ["ALEVINS", "POISSON"] as const) {
    const codes = especesPisciculture.map((e) => `T17_${mesure}_${e}`);
    payload[`T17_ROWTOTAL_${mesure}`] = fmt(sommeOuNull(...codes.map((c) => rawTotal.get(c) ?? null)));
    payload[`T17_ROWTOTAL_${mesure}_PREC`] = fmt(sommeOuNull(...codes.map((c) => rawTotalPrec.get(c) ?? null)));
  }
}

/** Rapport DD : reproduit fidèlement chaque tableau du canevas (voir canevasLayout.ts).
 *  agregerEvenementsParArrondissement : true pour le rapport DD (listes 3.1-3.5/4.1-4.4 groupées par
 *  arrondissement + sous-total, lisibilité demandée par le chef SSV) ; false pour la fiche "exact
 *  canevas" (rapport_mensuel_exact.docx), qui reproduit la liste à plat du canevas papier littéral,
 *  sans regroupement — voir buildDocExact dans buildReportTemplates.ts. */
export async function genererPayloadDD(periodeId: string, agregerEvenementsParArrondissement = true) {
  const periode = await db.periodeReporting.findUniqueOrThrow({ where: { id: periodeId } });
  const { payload, templates, moisPrecedent } = await construirePayloadCommun(periodeId, periode.mois!, periode.annee);

  const rawTotal = new Map<string, number | null>();
  const rawTotalPrec = new Map<string, number | null>();

  for (const t of templates) {
    const layout = CANEVAS_LAYOUTS[t.code];
    if (t.type === "MATRICE") {
      for (const f of t.fields) {
        if (f.typeValeur === "TEXTE") {
          for (const arr of ARR_CODES) {
            payload[`${f.code}_${arr}`] = (await dernierTexteMatrice(periodeId, f.code, arr)) ?? "N/D";
          }
          continue;
        }
        let total = 0;
        let auMoinsUne = false;
        for (const arr of ARR_CODES) {
          const v = await sommeMatrice(periodeId, f.code, arr);
          payload[`${f.code}_${arr}`] = fmt(v);
          if (v != null) {
            total += v;
            auMoinsUne = true;
          }
        }
        rawTotal.set(f.code, auMoinsUne ? total : null);
        payload[`${f.code}_TOTAL`] = auMoinsUne ? fmt(total) : "N/D";
        const totalPrec = moisPrecedent ? await sommeMatrice(moisPrecedent.id, f.code, null) : null;
        rawTotalPrec.set(f.code, totalPrec);
        payload[`${f.code}_TOTAL_PREC`] = fmt(totalPrec);
      }
    } else if (t.type === "NOMINATIF" && layout?.kind === "NOMINATIF_LOOP") {
      payload[t.code] = await nominatifLoopRows(periodeId, t.code, layout.cols.map((c) => c.code), null);
    } else if (t.type === "EVENEMENT" && layout?.kind === "EVENEMENT_LOOP") {
      payload[t.code] = agregerEvenementsParArrondissement
        ? await evenementLoopRowsGroupes(periodeId, t.code, layout.cols)
        : await evenementLoopRows(periodeId, t.code, layout.cols, null);
    }
  }

  ajouterTotauxColonnes(payload, templates, rawTotal, rawTotalPrec);
  await ajouterTotauxListes(payload, templates, periodeId, moisPrecedent?.id, null);

  const syntheses = await db.syntheseSection.findMany({ where: { periodeId, blocCode: null }, include: { section: true } });
  for (const code of ["BAC", "PSA", "SSV", "SPAIH"]) {
    const s = syntheses.find((x) => x.section.code === code);
    payload[`ANALYSE_${code}`] = s?.contenuFinal && s.valideDD ? s.contenuFinal : "Synthèse non disponible.";
  }

  return payload;
}

/** Rapport DA : fiche de collecte d'un seul arrondissement, identique à la mise en page papier. */
export async function genererPayloadDA(periodeId: string, arrondissementCode: string, arrondissementNom: string) {
  const periode = await db.periodeReporting.findUniqueOrThrow({ where: { id: periodeId } });
  const { payload, templates, moisPrecedent } = await construirePayloadCommun(periodeId, periode.mois!, periode.annee);
  payload.ARRONDISSEMENT_NOM = arrondissementNom;
  payload.ARRONDISSEMENT_NOM_CANEVAS = ARR_NOMS_CANEVAS[arrondissementCode] ?? arrondissementNom;

  const rawTotal = new Map<string, number | null>();
  const rawTotalPrec = new Map<string, number | null>();

  for (const t of templates) {
    const layout = CANEVAS_LAYOUTS[t.code];
    if (t.type === "MATRICE") {
      for (const f of t.fields) {
        if (f.typeValeur === "TEXTE") {
          payload[f.code] = (await dernierTexteMatrice(periodeId, f.code, arrondissementCode)) ?? "N/D";
          payload[`${f.code}_PREC`] = moisPrecedent ? (await dernierTexteMatrice(moisPrecedent.id, f.code, arrondissementCode)) ?? "N/D" : "N/D";
          continue;
        }
        const v = await sommeMatrice(periodeId, f.code, arrondissementCode);
        rawTotal.set(f.code, v);
        payload[f.code] = fmt(v);
        const vp = moisPrecedent ? await sommeMatrice(moisPrecedent.id, f.code, arrondissementCode) : null;
        rawTotalPrec.set(f.code, vp);
        payload[`${f.code}_PREC`] = fmt(vp);
      }
    } else if (t.type === "NOMINATIF" && layout?.kind === "NOMINATIF_LOOP") {
      payload[t.code] = await nominatifLoopRows(periodeId, t.code, layout.cols.map((c) => c.code), arrondissementCode);
    } else if (t.type === "EVENEMENT" && layout?.kind === "EVENEMENT_LOOP") {
      payload[t.code] = await evenementLoopRows(periodeId, t.code, layout.cols, arrondissementCode);
    }
  }

  ajouterTotauxColonnes(payload, templates, rawTotal, rawTotalPrec);
  await ajouterTotauxListes(payload, templates, periodeId, moisPrecedent?.id, arrondissementCode);

  return payload;
}

export async function rendreDocx(templateFile: string, payload: Record<string, unknown>): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), "templates", templateFile);
  const templateBuf = await fs.readFile(templatePath);
  const zip = new PizZip(templateBuf);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => "N/D" });
  doc.render(payload);
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

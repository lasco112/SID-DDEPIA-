/**
 * LA LIGNE OUBLIÉE PAR LE DA, AJOUTÉE PAR LE CHEF DE SECTION (décision du
 * Délégué, 22 octobre 2026). Exemple : à Penka-Michel, le DA n'a inscrit que la
 * rage dans les vaccinations du mois (tableau 3.2) ; la PPCB, vaccinée elle
 * aussi, manque. Le chef de la section l'ajoute dans la liste du mois.
 *
 * Seulement pour CORRIGER, et seulement dans le cadre que le DD a ouvert :
 *  - un chef de section technique (PSA, SSV, SPAIH), dans un tableau en liste
 *    de SA section ;
 *  - pendant la CORRECTION DIRECTE que le DD a ouverte à sa section pour le
 *    trimestre de ce mois (ordresCorrection.ts) — jamais en relecture, jamais
 *    hors révision ;
 *  - motif obligatoire ; mois non clôturé (sinon le DD le rouvre d'abord).
 *
 * La ligne entre dans le rapport mensuel de l'arrondissement comme celles du
 * DA : le trimestre, le semestre et l'année la comptent d'eux-mêmes. Elle reste
 * marquée « ajoutée par le chef » (Correction, journal), et le DA et le DD en
 * sont prévenus. La synchronisation des téléphones ne l'efface jamais : elle
 * n'écrit que les lignes qu'un appareil envoie.
 *
 * Le module mensuel n'est touché qu'ici et dans l'écran de contrôle du chef ;
 * la saisie du DA et les documents produits restent tels quels.
 */
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { assertPeriodeModifiable } from "@/server/periodes/gel";
import { notifierEvenement } from "@/server/notifications/evenements";
import { trimestrielle, libelleCourt } from "@/server/periodes/calendrier";
import { aOrdreDeCorrection, CHEFS_SOUS_ORDRE } from "@/server/trimestre/ordresCorrection";
import { jeton } from "@/lib/surlignage";

const NOMS_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export class RefusAjout extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

interface ChampSchema {
  key: string;
  label: string;
  type: string;
  ref?: string;
}

export interface Auteur {
  id: string;
  role: string;
  username: string;
  sectionId: string | null;
}

/**
 * Le chef peut-il ajouter une ligne oubliée dans ce tableau, ce mois-ci ? Rend
 * null s'il le peut, sinon la raison — dite à l'écran AVANT qu'il ne remplisse.
 */
export async function refusAjoutLigne(
  db: PrismaClient,
  auteur: Auteur,
  template: { sectionId: string; type: string },
  periode: { type: string; annee: number; mois: number | null; statut?: string | null }
): Promise<string | null> {
  if (template.type !== "EVENEMENT") return "On n'ajoute une ligne que dans un tableau en liste (vaccinations, foyers, consultations…).";
  if (periode.type !== "MENSUEL" || !periode.mois) return "Une ligne s'ajoute dans le rapport d'un mois.";
  if (auteur.role === "DD") return null;
  if (!CHEFS_SOUS_ORDRE.includes(auteur.role) || auteur.sectionId !== template.sectionId) {
    return "Seul le chef de la section de ce tableau ajoute une ligne oubliée par le DA.";
  }
  const trimestre = trimestrielle(periode.annee, Math.ceil(periode.mois / 3));
  if (!(await aOrdreDeCorrection(db, trimestre, auteur.role))) {
    return (
      `Ajouter une ligne oubliée par le DA n'est possible que pendant la correction directe que le DD ouvre à votre section ` +
      `pour le ${libelleCourt(trimestre)}. Demandez-la-lui, ou signalez l'oubli au DA.`
    );
  }
  return null;
}

/** La ligne, vérifiée contre les colonnes du tableau : rien d'inventé, rien d'oublié. */
async function payloadVerifie(db: PrismaClient, schema: ChampSchema[], brut: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Comme pour le DA (son formulaire n'impose aucune colonne) : chaque choix
  // fait doit exister, chaque nombre être un nombre ; mais la ligne doit au
  // moins dire QUOI (un choix) et COMBIEN (un chiffre).
  const payload: Record<string, unknown> = {};
  let unNombre = false;
  let unChoix = false;
  for (const c of schema) {
    const v = brut[c.key];
    const vide = v == null || String(v).trim() === "";
    if (c.type === "ref") {
      if (vide) {
        payload[c.key] = "";
        continue;
      }
      const existe = await db.referentielItem.findFirst({ where: { categorie: c.ref as never, code: String(v) }, select: { id: true } });
      if (!existe) throw new RefusAjout(`« ${c.label} » : choix inconnu.`, 400);
      unChoix = true;
      payload[c.key] = String(v);
      const precision = brut[`${c.key}__PRECISION`];
      if (String(v).endsWith("_AUTRE") && precision != null && String(precision).trim()) payload[`${c.key}__PRECISION`] = String(precision).trim().slice(0, 200);
    } else if (c.type === "entier" || c.type === "decimal") {
      if (vide) {
        payload[c.key] = null;
        continue;
      }
      const n = Number(String(v).replace(/[\s  ]/g, "").replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || (c.type === "entier" && !Number.isInteger(n))) {
        throw new RefusAjout(`« ${c.label} » : ${c.type === "entier" ? "un nombre entier" : "un nombre"}, positif.`, 400);
      }
      if (n > 0) unNombre = true;
      payload[c.key] = n;
    } else {
      payload[c.key] = vide ? "" : String(v).trim().slice(0, 500);
    }
  }
  if (schema.some((c) => c.type === "ref") && !unChoix) {
    throw new RefusAjout(`Dites ce que la ligne déclare : ${schema.filter((c) => c.type === "ref").map((c) => `« ${c.label} »`).join(", ")}.`, 400);
  }
  if (schema.some((c) => c.type === "entier" || c.type === "decimal") && !unNombre) {
    throw new RefusAjout("Une ligne ajoutée doit porter un chiffre au-dessus de zéro : le nombre d'animaux, de cas…", 400);
  }
  return payload;
}

/** Ajoute la ligne oubliée au rapport du mois de l'arrondissement. Rend la ligne créée. */
export async function ajouterLigneOubliee(
  db: PrismaClient,
  auteur: Auteur,
  demande: { templateCode: string; periodeId: string; arrondissementId: string; payload: Record<string, unknown>; motif: unknown }
) {
  const template = await db.formTemplate.findUnique({ where: { code: demande.templateCode } });
  if (!template) throw new RefusAjout("Tableau introuvable.", 404);
  const periode = await db.periodeReporting.findUnique({ where: { id: demande.periodeId } });
  if (!periode) throw new RefusAjout("Mois introuvable.", 404);
  const refus = await refusAjoutLigne(db, auteur, template, periode);
  if (refus) throw new RefusAjout(refus, 403);
  await assertPeriodeModifiable(db, periode.id);

  const motif = typeof demande.motif === "string" ? demande.motif.trim() : "";
  if (motif.length < 5) throw new RefusAjout("Le motif est obligatoire : pourquoi cette ligne manquait (ex. : PPCB vaccinée mais omise par le DA).", 400);

  const rapport = await db.rapportArrondissement.findFirst({
    where: { periodeId: periode.id, arrondissementId: demande.arrondissementId },
    include: { arrondissement: { select: { nom: true } } },
  });
  if (!rapport) throw new RefusAjout("Cet arrondissement n'a pas de rapport pour ce mois : rien à compléter.", 409);

  const schema = (template.schemaEvenement as ChampSchema[] | null) ?? [];
  const payload = await payloadVerifie(db, schema, demande.payload ?? {});

  const ligne = await db.saisieEvenement.create({
    data: {
      rapportId: rapport.id,
      templateId: template.id,
      payload: payload as Prisma.InputJsonValue,
      clientId: `chef-${randomUUID()}`,
      modifieLe: new Date(),
      saisiParId: auteur.id,
    },
  });
  // La trace : la ligne n'existait pas, le chef l'a ajoutée, pour ce motif.
  await db.correction.create({
    data: { saisieEvenementId: ligne.id, valeurAvant: "(ligne absente du rapport du DA)", valeurApres: JSON.stringify(payload), motif, auteurId: auteur.id },
  });
  const mois = `${NOMS_MOIS[periode.mois! - 1]} ${periode.annee}`;
  await db.auditLog.create({
    data: {
      userId: auteur.id,
      action: "AJOUT_LIGNE_CHEF",
      entite: "SaisieEvenement",
      entiteId: ligne.id,
      details: { templateCode: template.code, numero: template.numero, arrondissement: rapport.arrondissement.nom, mois, payload, motif } as Prisma.InputJsonValue,
    },
  });

  // Le contenu en clair, pour le message : les libellés des choix, les chiffres.
  const morceaux: string[] = [];
  for (const c of schema) {
    const v = payload[c.key];
    if (v == null || v === "") continue;
    if (c.type === "ref") {
      const item = await db.referentielItem.findFirst({ where: { categorie: c.ref as never, code: String(v) }, select: { libelle: true } });
      morceaux.push(item?.libelle ?? String(v));
    } else morceaux.push(`${c.label} : ${v}`);
  }
  const message =
    `Le ${auteur.role === "DD" ? "Délégué départemental" : `chef ${auteur.role.replace("CHEF_", "")}`} a ajouté une ligne oubliée à votre rapport de ${mois} — ` +
    `tableau ${template.numero} : ${morceaux.join(", ")}. Motif : ${motif}. ` +
    "Elle est déjà dans votre rapport : ne la ressaisissez pas, elle compterait deux fois.";
  await notifierEvenement(db, { arrondissementId: rapport.arrondissementId, saufUserId: auteur.id }, {
    declencheur: "AJOUT_LIGNE_CHEF",
    message,
    lien: `/da/saisie/${template.code}?cible=${encodeURIComponent(jeton("ev", ligne.clientId))}`,
  });
  if (auteur.role !== "DD") {
    await notifierEvenement(db, { roles: ["DD"], saufUserId: auteur.id }, {
      declencheur: "AJOUT_LIGNE_CHEF",
      message: `${rapport.arrondissement.nom}, ${mois} — le chef ${auteur.role.replace("CHEF_", "")} a ajouté une ligne oubliée au tableau ${template.numero} : ${morceaux.join(", ")}. Motif : ${motif}`,
      lien: `/section/controle?tableau=${template.code}`,
    });
  }
  return ligne;
}

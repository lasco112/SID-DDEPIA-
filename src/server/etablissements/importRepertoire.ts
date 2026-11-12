/**
 * IMPORTER UN RÉPERTOIRE DES ACTEURS EPIA dans le registre d'un arrondissement
 * (demande du Délégué, 12 novembre 2026 : « complète la liste des
 * établissements de Fokoué … et le DA va réanalyser pour supprimer ce qui ne
 * sont plus en activité »).
 *
 * Deux temps, jamais un seul :
 *  1. ANALYSER : le fichier est lu (lectureRepertoire.ts), chaque acteur est
 *     rattaché à son village de la liste officielle (ou « autre village »), et
 *     comparé au registre : un acteur déjà inscrit (même type, même nom) est
 *     signalé et décoché d'office. Rien n'est écrit.
 *  2. INSCRIRE : seulement les lignes que la personne a gardées, relues et
 *     recontrôlées ici (type, fiche, village, doublon), toutes « à vérifier
 *     par le DA » dans leurs observations.
 *
 * Tout passe par le client cloisonné de la session : l'arrondissement, ses
 * villages et son registre sont ceux du département, jamais d'un autre.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { CODES_ACTEURS, ESPECES } from "@/lib/acteurs";
import { champsRepertoire, nettoyerFicheRepertoire, type FicheRepertoire } from "@/lib/repertoire";
import { normaliser, type LigneRepertoire } from "./lectureRepertoire";

export interface Proposition extends LigneRepertoire {
  /** Le rattachement proposé : un village de la liste, un « autre village » du CZV, ou la seule localité. */
  centreId: string | null;
  villageId: string | null;
  villageAutre: string | null;
  localite: string;
  /** « registre » : déjà inscrit ; « fichier » : deux fois dans le fichier. */
  doublon: "registre" | "fichier" | null;
}

const cle = (s: string) => normaliser(s).replace(/[^A-Z0-9]/g, "");
const enTitre = (s: string) =>
  s
    .toLowerCase()
    .split(/([\s\-’'])/)
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join("");

async function contexte(db: PrismaClient, arrondissementId: string) {
  const arrondissement = await db.arrondissement.findUnique({ where: { id: arrondissementId }, select: { id: true, nom: true } });
  if (!arrondissement) return null;
  const centres = await db.centreZootechnique.findMany({ where: { arrondissementId }, select: { id: true, villages: { select: { id: true, nom: true, centreId: true } } } });
  const villages = centres.flatMap((c) => c.villages);
  const existants = await db.etablissement.findMany({ where: { arrondissementId }, select: { typeCode: true, nom: true } });
  return {
    arrondissement,
    centres,
    villages: new Map(villages.map((v) => [cle(v.nom), v])),
    deja: new Set(existants.map((e) => `${e.typeCode}|${cle(e.nom)}`)),
  };
}

function rattacher(ctx: NonNullable<Awaited<ReturnType<typeof contexte>>>, village: string | null) {
  // « Village… Fokoué » : le nom de l'arrondissement n'est pas un village.
  if (!village || cle(village) === cle(ctx.arrondissement.nom)) return { centreId: null, villageId: null, villageAutre: null, localite: ctx.arrondissement.nom };
  const v = ctx.villages.get(cle(village));
  if (v) return { centreId: v.centreId, villageId: v.id, villageAutre: null, localite: v.nom };
  // Absent de la liste officielle : « autre village » si l'arrondissement n'a qu'un CZV, sinon la seule localité.
  const nom = enTitre(village);
  if (ctx.centres.length === 1) return { centreId: ctx.centres[0].id, villageId: null, villageAutre: nom, localite: nom };
  return { centreId: null, villageId: null, villageAutre: null, localite: nom };
}

/** Temps 1 : ce que le fichier propose pour cet arrondissement. Rien n'est écrit. */
export async function analyserRepertoire(db: PrismaClient, arrondissementId: string, lignes: LigneRepertoire[]): Promise<Proposition[] | null> {
  const ctx = await contexte(db, arrondissementId);
  if (!ctx) return null;
  const vus = new Set<string>();
  return lignes.map((l) => {
    const k = `${l.typeCode}|${cle(l.nom)}`;
    const doublon = ctx.deja.has(k) ? "registre" : vus.has(k) ? "fichier" : null;
    vus.add(k);
    return { ...l, ...rattacher(ctx, l.village), doublon };
  });
}

/** Temps 2 : inscrire les lignes gardées. Chaque ligne est recontrôlée. */
export async function inscrireRepertoire(
  db: PrismaClient,
  auteur: { id: string; username: string },
  arrondissementId: string,
  lignes: unknown,
  fichier: string
): Promise<{ inscrits: number; ignores: { nom: string; raison: string }[]; ids: string[] } | null> {
  const ctx = await contexte(db, arrondissementId);
  if (!ctx) return null;
  if (!Array.isArray(lignes) || lignes.length > 2000) throw new Error("Liste illisible.");
  const especesPermises = ESPECES.map((e) => e.code);
  const date = new Date().toLocaleDateString("fr-FR", { timeZone: "Africa/Douala" });
  const note = `Repris du répertoire des acteurs EPIA (${fichier.slice(0, 80)}), inscrit le ${date} par ${auteur.username} : à vérifier par le DA — désactiver s'il n'est plus en activité.`;
  const ignores: { nom: string; raison: string }[] = [];
  const ids: string[] = [];

  for (const brut of lignes as Record<string, unknown>[]) {
    const nom = typeof brut?.nom === "string" ? brut.nom.replace(/\s+/g, " ").trim().slice(0, 150) : "";
    const typeCode = typeof brut?.typeCode === "string" ? brut.typeCode : "";
    if (!nom || !CODES_ACTEURS.includes(typeCode)) {
      ignores.push({ nom: nom || "(sans nom)", raison: "type ou nom illisible" });
      continue;
    }
    const k = `${typeCode}|${cle(nom)}`;
    if (ctx.deja.has(k)) {
      ignores.push({ nom, raison: "déjà au registre" });
      continue;
    }
    const fiche = champsRepertoire(typeCode).length ? nettoyerFicheRepertoire(typeCode, brut.fiche ?? null) : { fiche: null as FicheRepertoire | null };
    if ("erreur" in fiche) {
      ignores.push({ nom, raison: fiche.erreur });
      continue;
    }
    const lieu = rattacher(ctx, typeof brut.village === "string" ? brut.village : null);
    const texte = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
    const especes = Array.isArray(brut.especes) ? Array.from(new Set(brut.especes.map(String).filter((e) => especesPermises.includes(e)))) : [];
    const e = await db.etablissement.create({
      data: {
        typeCode,
        nom,
        arrondissementId: ctx.arrondissement.id,
        localite: lieu.localite,
        centreId: lieu.centreId,
        villageId: lieu.villageId,
        villageAutre: lieu.villageAutre,
        proprietaire: texte(brut.proprietaire, 150),
        telephone: texte(brut.telephone, 40),
        especes,
        observations: note,
        ...(fiche.fiche ? { fiche: fiche.fiche as Prisma.InputJsonValue } : {}),
      },
      select: { id: true },
    });
    ctx.deja.add(k);
    ids.push(e.id);
  }

  await db.auditLog.create({
    data: {
      userId: auteur.id,
      action: "IMPORT_REPERTOIRE",
      entite: "Etablissement",
      entiteId: ctx.arrondissement.id,
      details: { arrondissement: ctx.arrondissement.nom, fichier: fichier.slice(0, 120), inscrits: ids.length, ignores: ignores.length, ids } as Prisma.InputJsonValue,
    },
  });
  return { inscrits: ids.length, ignores, ids };
}

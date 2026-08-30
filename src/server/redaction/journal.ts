/**
 * Le journal des appels à l'assistance rédactionnelle.
 *
 * Écrit AVANT qu'un modèle soit branché, et c'est le but : le PREMIER appel doit
 * être tracé, pas le deuxième. Un journal ajouté après coup ne dit rien des
 * débuts, qui sont précisément le moment où l'on doute.
 *
 * Ce qu'il conserve, et ce qu'il ne conserve pas
 * ---------------------------------------------
 * Les RÉFÉRENCES des faits soumis, jamais leurs valeurs : reproductible sans
 * être redondant. Une empreinte de l'entrée prouve qu'elle n'a pas changé.
 *
 * Deux durées, à ne pas confondre : la sortie brute du modèle porte de la donnée
 * et s'efface au bout de trente jours ; le reste est permanent — quelques
 * centaines d'octets par appel.
 *
 * `modifieParHumain` est la colonne qui dira si tout cela sert à quelque chose.
 * Si le Délégué réécrit neuf textes sur dix, la fonction ne fait pas gagner de
 * temps et doit être retirée. Sans cette mesure, personne ne le saura jamais.
 */
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Fait } from "../trimestre/faits";
import type { ResultatRedaction } from "./gardeFous";

/** Trente jours, en millisecondes. */
const RETENTION_SORTIE_BRUTE = 30 * 24 * 60 * 60 * 1000;

/**
 * L'empreinte des faits soumis.
 *
 * Elle porte ce qui détermine la sortie — l'identifiant du champ et la phrase
 * certifiée — et rien d'autre. Deux appels sur les mêmes faits ont la même
 * empreinte : c'est ce qui permet de dire, des mois plus tard, que l'entrée
 * n'avait pas bougé.
 */
export function empreinteDesFaits(faits: Fait[]): string {
  const matiere = faits.map((f) => `${f.fieldCode}|${f.phrase}`).join("\n");
  return createHash("sha256").update(matiere, "utf8").digest("hex");
}

export interface AppelAJournaliser {
  userId: string | null;
  /** Quelle fonction d'assistance : mise en forme, regroupement, reformulation… */
  fonction: string;
  modele: string;
  versionModele?: string | null;
  versionPrompt: string;
  faits: Fait[];
  /** Ce que le modèle a répondu, avant tout contrôle. */
  sortieBrute: string;
  /** Le verdict des garde-fous. */
  resultat: ResultatRedaction;
}

/**
 * Enregistre un appel. Ne lève jamais : perdre une trace est fâcheux, faire
 * échouer la rédaction du Délégué parce que le journal a un problème serait pire.
 */
export async function journaliserAppel(
  db: PrismaClient,
  appel: AppelAJournaliser
): Promise<string | null> {
  try {
    const ligne = await db.appelIA.create({
      data: {
        userId: appel.userId,
        fonction: appel.fonction,
        modele: appel.modele,
        versionModele: appel.versionModele ?? null,
        versionPrompt: appel.versionPrompt,
        faitIds: appel.faits.map((f) => f.fieldCode),
        empreinteEntree: empreinteDesFaits(appel.faits),
        sortieBrute: appel.sortieBrute,
        retenu: appel.resultat.retenu,
        motifRejet: appel.resultat.motif ?? null,
      },
      select: { id: true },
    });
    return ligne.id;
  } catch (e) {
    console.error("[assistance] appel non journalisé :", e);
    return null;
  }
}

/**
 * Consigne ce que l'humain a finalement retenu.
 *
 * `modifieParHumain` se déduit de la comparaison, plutôt que d'être déclaré :
 * on ne demande pas au Délégué de cocher une case pour mesurer l'outil qu'on
 * lui impose.
 */
export async function consignerValidation(
  db: PrismaClient,
  appelId: string,
  texteValide: string,
  exportDocumentId?: string | null
): Promise<void> {
  try {
    const appel = await db.appelIA.findUnique({
      where: { id: appelId },
      select: { sortieBrute: true },
    });
    if (!appel) return;

    await db.appelIA.update({
      where: { id: appelId },
      data: {
        texteValide,
        modifieParHumain: appel.sortieBrute != null && appel.sortieBrute.trim() !== texteValide.trim(),
        exportDocumentId: exportDocumentId ?? null,
      },
    });
  } catch (e) {
    console.error("[assistance] validation non consignée :", e);
  }
}

/**
 * Efface les sorties brutes de plus de trente jours.
 *
 * On EFFACE la colonne, on ne supprime pas la ligne : la trace de l'appel — qui,
 * quand, quelle fonction, retenu ou non — reste permanente. Supprimer la ligne
 * ferait disparaître la mesure au moment même où elle devient historique.
 */
export async function purgerSortiesBrutes(db: PrismaClient, maintenant = new Date()): Promise<number> {
  const limite = new Date(maintenant.getTime() - RETENTION_SORTIE_BRUTE);
  const { count } = await db.appelIA.updateMany({
    where: { createdAt: { lt: limite }, sortieBrute: { not: null } },
    data: { sortieBrute: null },
  });
  if (count > 0) console.log(`[assistance] ${count} sortie(s) brute(s) purgée(s) (plus de 30 jours).`);
  return count;
}

export interface MesureUtilite {
  appels: number;
  retenus: number;
  modifies: number;
  /** Part des textes retenus que l'humain a réécrits. */
  tauxReecriture: number | null;
}

/**
 * La mesure qui dira si la fonction mérite d'être gardée.
 *
 * Elle ne s'invente pas au moment de la décision : elle se relève sur ce qui
 * s'est réellement passé.
 */
export async function mesurerUtilite(db: PrismaClient, fonction?: string): Promise<MesureUtilite> {
  const ou = fonction ? { fonction } : {};
  const [appels, retenus, modifies] = await Promise.all([
    db.appelIA.count({ where: ou }),
    db.appelIA.count({ where: { ...ou, retenu: true } }),
    db.appelIA.count({ where: { ...ou, modifieParHumain: true } }),
  ]);
  return {
    appels,
    retenus,
    modifies,
    tauxReecriture: retenus > 0 ? modifies / retenus : null,
  };
}

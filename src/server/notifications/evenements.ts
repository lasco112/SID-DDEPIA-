/**
 * evenements.ts — notifications déclenchées par une ACTION, et non par le
 * calendrier.
 *
 * Le système ne savait prévenir que sur des dates (rappel du 27, retard du
 * 28). Or ce qui manque à l'équipe, c'est d'être averti quand quelqu'un agit :
 * un DA transmet, un chef demande une correction, le DD modifie une donnée.
 *
 * Chaque notification est écrite en base (consultable dans la cloche du
 * bandeau) puis poussée sur les appareils qui l'ont autorisé (notification
 * système, application fermée).
 *
 * Rien ici ne doit jamais faire échouer l'action métier : si l'envoi échoue,
 * l'action reste faite. On journalise et on continue.
 */
import type { PrismaClient, Role } from "@prisma/client";
import { envoyerPush } from "@/server/notifications/push";

export interface EvenementNotifiable {
  /** Code court, repris dans le journal : SOUMISSION_DA, REJET, CORRECTION… */
  declencheur: string;
  /** Texte lu par le destinataire. Une phrase, en français, sans jargon. */
  message: string;
  /** Page ouverte au clic sur la notification. */
  lien?: string;
}

/** Destinataires possibles, résolus au moment de l'envoi. */
export interface Ciblage {
  /** Comptes précis. */
  userIds?: string[];
  /** Tous les comptes actifs de ces rôles. */
  roles?: Role[];
  /** Tous les comptes actifs de cet arrondissement (DA + agents de saisie). */
  arrondissementId?: string;
  /** Tous les comptes actifs de cette section. */
  sectionId?: string;
  /** Ne jamais notifier l'auteur de l'action : il sait ce qu'il vient de faire. */
  saufUserId?: string;
}

async function resoudreDestinataires(db: PrismaClient, cible: Ciblage): Promise<string[]> {
  const conditions: any[] = [];
  if (cible.userIds?.length) conditions.push({ id: { in: cible.userIds } });
  if (cible.roles?.length) conditions.push({ role: { in: cible.roles } });
  if (cible.arrondissementId) conditions.push({ arrondissementId: cible.arrondissementId });
  if (cible.sectionId) conditions.push({ sectionId: cible.sectionId });
  if (conditions.length === 0) return [];

  const users = await db.user.findMany({
    where: { actif: true, OR: conditions, ...(cible.saufUserId ? { id: { not: cible.saufUserId } } : {}) },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Notifie les destinataires d'un événement.
 * Ne lève jamais : une notification perdue ne doit pas annuler une soumission.
 */
export async function notifierEvenement(
  db: PrismaClient,
  cible: Ciblage,
  evenement: EvenementNotifiable
): Promise<number> {
  try {
    const destinataires = await resoudreDestinataires(db, cible);
    if (destinataires.length === 0) return 0;

    await db.notification.createMany({
      data: destinataires.map((destinataireId) => ({
        destinataireId,
        canal: "IN_APP" as const,
        message: evenement.message,
        declencheur: evenement.declencheur,
        statut: "ENVOYE" as const,
        sentAt: new Date(),
        lien: evenement.lien ?? null,
      })),
    });

    // Envoi système (téléphone) : indépendant, et sans conséquence s'il échoue.
    void envoyerPush(db, destinataires, {
      titre: "SID DDEPIA-Menoua",
      corps: evenement.message,
      lien: evenement.lien ?? "/dashboard",
    });

    return destinataires.length;
  } catch (e) {
    console.error("[notifications] échec de l'émission :", e);
    return 0;
  }
}

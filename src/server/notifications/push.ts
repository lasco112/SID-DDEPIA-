/**
 * push.ts — notification système sur le téléphone, application fermée
 * (Web Push, protocole standard des navigateurs).
 *
 * Aucune passerelle payante : c'est le navigateur de l'agent qui reçoit le
 * message via son propre service de notification (Google pour Chrome/Android).
 * Le serveur signe l'envoi avec une paire de clés VAPID.
 *
 * Configuration requise en production (variables d'environnement) :
 *   VAPID_PUBLIC_KEY   — également exposée au navigateur
 *   VAPID_PRIVATE_KEY  — secrète
 *   VAPID_SUBJECT      — "mailto:…" de contact, exigé par le protocole
 *
 * Sans ces clés, la fonction ne fait rien : les notifications restent
 * consultables dans l'application. Le système ne tombe pas pour autant.
 */
import type { PrismaClient } from "@prisma/client";
import webpush from "web-push";

export interface MessagePush {
  titre: string;
  corps: string;
  lien: string;
}

let configure = false;

/** Vrai si le serveur est capable d'émettre des notifications système. */
export function pushDisponible(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configurer(): boolean {
  if (configure) return true;
  if (!pushDisponible()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:ddepia.menoua@minepia.cm",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configure = true;
  return true;
}

/**
 * Envoie à tous les appareils autorisés de ces comptes.
 * Ne lève jamais. Un abonnement rejeté définitivement par le navigateur
 * (404/410 : autorisation retirée, application désinstallée) est supprimé —
 * sans quoi la table se remplirait d'adresses mortes réessayées à l'infini.
 */
export async function envoyerPush(db: PrismaClient, userIds: string[], message: MessagePush): Promise<void> {
  if (userIds.length === 0 || !configurer()) return;

  const abonnements = await db.abonnementPush.findMany({ where: { userId: { in: userIds } } });
  if (abonnements.length === 0) return;

  const charge = JSON.stringify(message);
  const perimes: string[] = [];

  await Promise.all(
    abonnements.map(async (a) => {
      try {
        await webpush.sendNotification(
          { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
          charge
        );
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) perimes.push(a.id);
        else console.error(`[push] échec d'envoi (${code ?? "?"}) :`, e?.body ?? e?.message ?? e);
      }
    })
  );

  if (perimes.length > 0) {
    await db.abonnementPush.deleteMany({ where: { id: { in: perimes } } });
    console.log(`[push] ${perimes.length} abonnement(s) périmé(s) supprimé(s).`);
  }
}

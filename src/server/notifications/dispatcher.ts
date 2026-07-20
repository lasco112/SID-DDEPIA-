/**
 * dispatcher.ts — Envoi multicanal des notifications (CDC §M9).
 * ---------------------------------------------------------------------------
 * MVP : IN_APP est écrit et marqué ENVOYE immédiatement (consultable dans
 * l'application). SMS/WHATSAPP sont journalisés et placés EN_ATTENTE — la
 * passerelle réelle (phase 3) les enverra sans qu'il faille toucher aux
 * déclencheurs de cron/alerts.ts.
 */
import { db } from "@/lib/db";

export type Canal = "IN_APP" | "SMS" | "WHATSAPP";

export interface NotifierOptions {
  userId: string;
  nom: string;
  telephone?: string | null;
  whatsapp?: string | null;
  declencheur: string;
  message: string;
}

export async function notifier(opts: NotifierOptions) {
  const canaux: Canal[] = ["IN_APP", "SMS", "WHATSAPP"];
  for (const canal of canaux) {
    console.log(
      `[ALERTE][${canal}][${opts.declencheur}] → ${opts.nom} ` +
        `(${canal === "WHATSAPP" ? opts.whatsapp ?? "n/d" : opts.telephone ?? "n/d"}) : ${opts.message}`
    );
    await db.notification.create({
      data: {
        destinataireId: opts.userId,
        canal,
        message: opts.message,
        declencheur: opts.declencheur,
        statut: canal === "IN_APP" ? "ENVOYE" : "EN_ATTENTE",
        sentAt: canal === "IN_APP" ? new Date() : null,
      },
    });
  }
}

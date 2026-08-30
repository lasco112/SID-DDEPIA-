/**
 * dispatcher.ts — Envoi multicanal des notifications (CDC §M9).
 * ---------------------------------------------------------------------------
 * MVP : IN_APP est écrit et marqué ENVOYE immédiatement (consultable dans
 * l'application). SMS/WHATSAPP sont journalisés et placés EN_ATTENTE — la
 * passerelle réelle (phase 3) les enverra sans qu'il faille toucher aux
 * déclencheurs de cron/alerts.ts.
 *
 * Comme `evenements.ts` et `push.ts`, ce module reçoit son client au lieu de
 * l'importer : l'appelant est une tâche de fond qui parcourt les départements
 * l'un après l'autre, et la notification doit s'écrire dans celui du
 * destinataire.
 */
import type { PrismaClient } from "@prisma/client";
import { envoyerPush } from "@/server/notifications/push";
import { identiteDepartement } from "@/lib/departement";

export type Canal = "IN_APP" | "SMS" | "WHATSAPP";

export interface NotifierOptions {
  userId: string;
  nom: string;
  telephone?: string | null;
  whatsapp?: string | null;
  declencheur: string;
  message: string;
}

export async function notifier(db: PrismaClient, opts: NotifierOptions) {
  // Le nom du service sur l'écran du téléphone est celui du département du
  // destinataire, et non « Menoua » pour tout le monde.
  const identite = await identiteDepartement(db);

  // Les relances calendaires partent aussi sur le téléphone, comme les
  // notifications d'événement : c'est justement quand l'agent n'ouvre pas
  // l'application qu'un rappel d'échéance a de la valeur.
  void envoyerPush(db, [opts.userId], {
    titre: identite.application,
    corps: opts.message,
    lien: "/dashboard",
  }).catch(() => {});

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

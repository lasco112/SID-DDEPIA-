"use client";

/**
 * NotificationsPanel.tsx — relances calendaires reçues (CDC §M9).
 */

import { useEffect, useState } from "react";

interface NotificationDto {
  id: string;
  message: string;
  declencheur: string;
  createdAt: string;
}

const LIBELLES_DECLENCHEUR: Record<string, string> = {
  "RAPPEL_J-1": "Rappel préventif",
  RETARD_DA: "Retard de soumission",
  RETARD_SECTION: "Retard de validation",
  RAPPEL_CLOTURE_DD: "Rappel de clôture",
};

export default function NotificationsPanel() {
  const [notifications, setNotifications] = useState<NotificationDto[] | null>(null);

  useEffect(() => {
    fetch("/api/notifications")
      .then((res) => (res.ok ? res.json() : { notifications: [] }))
      .then((data) => setNotifications(data.notifications))
      .catch(() => setNotifications([]));
  }, []);

  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <h2 className="mb-2 text-sm font-semibold text-amber-900">Notifications</h2>
      <ul className="space-y-2">
        {notifications.map((n) => (
          <li key={n.id} className="text-sm text-amber-900">
            <span className="mr-2 rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium">
              {LIBELLES_DECLENCHEUR[n.declencheur] ?? n.declencheur}
            </span>
            {n.message}
            <span className="ml-2 text-xs text-amber-700">{new Date(n.createdAt).toLocaleDateString("fr-FR")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

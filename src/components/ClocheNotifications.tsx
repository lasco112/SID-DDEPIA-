"use client";

/**
 * Cloche de notifications du bandeau — visible sur TOUTES les pages.
 *
 * Auparavant les notifications n'apparaissaient que sur le tableau de bord :
 * un agent qui travaillait dans ses tableaux ne découvrait jamais qu'on lui
 * avait demandé une correction. La pastille rouge est là pour ça.
 *
 * Propose aussi l'activation des notifications sur le téléphone, une fois,
 * sans insister : si l'agent refuse, on ne le relance pas.
 */

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  activerNotifications,
  etatNotifications,
  EVENEMENT_ETAT_NOTIFICATIONS,
  type EtatNotifications,
} from "@/lib/notificationsTelephone";

interface NotifDto {
  id: string;
  message: string;
  declencheur: string;
  createdAt: string;
  luLe: string | null;
  lien: string | null;
}

const INTERVALLE_MS = 60_000;

export default function ClocheNotifications() {
  const [ouvert, setOuvert] = useState(false);
  const [notifications, setNotifications] = useState<NotifDto[]>([]);
  const [nonLues, setNonLues] = useState(0);
  const [pushEtat, setPushEtat] = useState<EtatNotifications | "inconnu">("inconnu");

  const charger = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications ?? []);
      setNonLues(data.nonLues ?? 0);
    } catch {
      // hors ligne : la cloche garde son dernier état connu
    }
  }, []);

  useEffect(() => {
    charger();
    const t = setInterval(charger, INTERVALLE_MS);
    return () => clearInterval(t);
  }, [charger]);

  // État de l'autorisation « notification système » sur CET appareil ; relu
  // quand l'invitation qui suit la connexion vient de l'activer.
  useEffect(() => {
    const relire = () => void etatNotifications().then(setPushEtat);
    relire();
    window.addEventListener(EVENEMENT_ETAT_NOTIFICATIONS, relire);
    return () => window.removeEventListener(EVENEMENT_ETAT_NOTIFICATIONS, relire);
  }, []);

  async function activerPush() {
    setPushEtat(await activerNotifications());
  }

  async function ouvrirPanneau() {
    const suivant = !ouvert;
    setOuvert(suivant);
    if (suivant && nonLues > 0) {
      setNonLues(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, luLe: n.luLe ?? new Date().toISOString() })));
      await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
    }
  }

  return (
    <div className="relative">
      <button
        onClick={ouvrirPanneau}
        title="Notifications"
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-white/10"
      >
        <Bell size={17} />
        {nonLues > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {nonLues > 9 ? "9+" : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOuvert(false)} aria-hidden="true" />
          {/* Sur téléphone, le panneau est ancré à l'écran (et non à la cloche) :
              ancré à la cloche, il débordait à gauche et le texte était coupé.
              À partir de `sm`, il redevient un menu classique sous l'icône. */}
          <div className="fixed left-2 right-2 top-[62px] z-50 max-h-[70vh] overflow-y-auto rounded-lg border border-gray-200 bg-white text-gray-900 shadow-lg sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem]">
            <div className="border-b border-gray-100 px-4 py-2 text-sm font-semibold text-primary-dark">Notifications</div>

            {pushEtat === "proposable" && (
              <div className="border-b border-gray-100 bg-green-50 px-4 py-3">
                <p className="text-xs text-gray-700">
                  Recevoir les alertes sur ce téléphone, même application fermée ?
                </p>
                <button
                  onClick={activerPush}
                  className="mt-2 rounded bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-hover"
                >
                  Activer sur cet appareil
                </button>
              </div>
            )}
            {pushEtat === "refuse" && (
              <p className="border-b border-gray-100 px-4 py-2 text-[11px] text-gray-500">
                Notifications refusées sur cet appareil. À réactiver dans les réglages du navigateur.
              </p>
            )}

            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-500">Aucune notification.</p>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li key={n.id} className={`border-b border-gray-100 last:border-0 ${n.luLe ? "" : "bg-blue-50/50"}`}>
                    <a
                      href={n.lien ?? "/dashboard"}
                      className="block px-4 py-3 hover:bg-gray-50"
                      onClick={() => setOuvert(false)}
                    >
                      <p className="text-sm leading-snug text-gray-800">{n.message}</p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {new Date(n.createdAt).toLocaleString("fr-FR")}
                      </p>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

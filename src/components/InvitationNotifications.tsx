"use client";

/**
 * L'invitation à recevoir les alertes sur le téléphone, juste après la
 * connexion (demande du Délégué, 15 octobre 2026 : « des notifications en
 * temps réel qui viennent au-dessus de l'écran, comme pour les autres
 * applications, après le consentement de l'agent »).
 *
 * Jusque-là, la seule porte était un bouton au fond de la cloche : personne
 * ne l'ouvrait, et personne ne recevait rien.
 *
 *  - Une carte en bas de l'écran, après l'écran de passage ; rien ne
 *    s'abonne sans le geste de l'agent, puis la question du téléphone.
 *  - « Plus tard » : reproposée dans 7 jours, pas avant.
 *  - Refus dans la question du téléphone : plus jamais reproposée (le
 *    téléphone ne la reposerait de toute façon pas).
 *  - Accepté : une première alerte de bienvenue s'affiche aussitôt, pour que
 *    l'agent voie à quoi elles ressemblent.
 *
 * Les visites guidées attendent que la carte soit partie (data-bloque-visites).
 */
import { useEffect, useState } from "react";
import { BellRing, X } from "lucide-react";
import {
  activerNotifications,
  etatNotifications,
  EVENEMENT_ETAT_NOTIFICATIONS,
} from "@/lib/notificationsTelephone";

const CLE_PLUS_TARD = "sid-invitation-notifications";
const SEPT_JOURS = 7 * 86_400_000;

function reporteeRecemment(): boolean {
  try {
    const le = Number(localStorage.getItem(CLE_PLUS_TARD) ?? 0);
    return Date.now() - le < SEPT_JOURS;
  } catch {
    return false;
  }
}

export default function InvitationNotifications() {
  const [etat, setEtat] = useState<"cachee" | "visible" | "en-cours" | "activee">("cachee");

  useEffect(() => {
    let annule = false;
    (async () => {
      if (reporteeRecemment()) return;
      if ((await etatNotifications()) !== "proposable") return;
      // Après l'écran de passage, qui couvre tout pendant deux secondes ; on
      // regarde souvent, pour paraître avant que les visites guidées ne
      // prennent la place (elles regardent toutes les demi-secondes).
      for (let i = 0; i < 60 && !annule; i++) {
        await new Promise((r) => setTimeout(r, 150));
        if (!document.querySelector("[data-ecran-passage]")) break;
      }
      if (!annule) setEtat("visible");
    })();
    return () => {
      annule = true;
    };
  }, []);

  function plusTard() {
    try {
      localStorage.setItem(CLE_PLUS_TARD, String(Date.now()));
    } catch {
      // stockage refusé : la carte reviendra à la prochaine connexion
    }
    setEtat("cachee");
  }

  async function activer() {
    setEtat("en-cours");
    const resultat = await activerNotifications();
    window.dispatchEvent(new Event(EVENEMENT_ETAT_NOTIFICATIONS));
    if (resultat !== "actif") {
      // Refus ou échec : on ne revient pas à la charge avant une semaine.
      plusTard();
      return;
    }
    setEtat("activee");
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification("SID EPIA-O", {
        body: "Les alertes sont activées sur ce téléphone. Vous serez prévenu ici, même application fermée.",
        icon: "/icon-512.png?v=2",
        badge: "/icon-512.png?v=2",
        tag: "sid-ddepia",
        data: { lien: "/dashboard" },
      });
    } catch {
      // l'alerte d'essai n'est qu'une démonstration ; l'abonnement est fait
    }
    setTimeout(() => setEtat("cachee"), 3500);
  }

  if (etat === "cachee") return null;

  return (
    <div
      data-bloque-visites
      role="dialog"
      aria-labelledby="invitation-notifications-titre"
      className="fixed inset-x-3 bottom-16 z-[150] mx-auto max-w-[420px] rounded-card border border-line bg-surface p-4 shadow-[0_8px_30px_rgba(0,0,0,.18)] sm:left-auto sm:right-5 sm:bottom-16"
    >
      {etat === "activee" ? (
        <p className="flex items-center gap-2 text-[14px] font-semibold text-primary-dark">
          <BellRing size={18} className="text-primary" /> Alertes activées sur ce téléphone.
        </p>
      ) : (
        <>
          <button type="button" onClick={plusTard} aria-label="Fermer" className="absolute right-2 top-2 rounded p-1 text-ink-faint hover:bg-primary-light">
            <X size={16} />
          </button>
          <div className="flex gap-3 pr-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary">
              <BellRing size={20} />
            </span>
            <div>
              <p id="invitation-notifications-titre" className="text-[15px] font-bold text-primary-dark">
                Recevoir les alertes sur ce téléphone ?
              </p>
              <p className="mt-1 text-[13px] leading-snug text-ink-muted">
                Le SID vous prévient aussitôt, en haut de l&apos;écran, même application fermée : rapport renvoyé
                pour correction, rapport validé, échéance qui approche. Vous pourrez les couper à tout moment dans
                les réglages du téléphone.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={activer}
              disabled={etat === "en-cours"}
              className="min-h-[42px] flex-1 rounded-btn bg-primary px-3 text-[14px] font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {etat === "en-cours" ? "Le téléphone vous demande…" : "Activer les alertes"}
            </button>
            <button
              type="button"
              onClick={plusTard}
              className="min-h-[42px] rounded-btn border border-line px-3 text-[14px] font-semibold text-ink-muted hover:bg-primary-light"
            >
              Plus tard
            </button>
          </div>
        </>
      )}
    </div>
  );
}

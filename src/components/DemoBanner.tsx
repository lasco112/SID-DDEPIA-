"use client";

/**
 * Bandeau permanent de l'environnement de démonstration (correction n°10,
 * §10.2) : affiché sur TOUTE page dès que la requête est servie en démo, sans
 * qu'aucune page n'ait besoin de le savoir (monté une seule fois dans le
 * layout racine). Porte aussi le bouton "Réinitialiser la démonstration" (§10.9).
 *
 * L'état vient du serveur (/api/demo/etat) et non du jeton de session : un
 * compte réel basculé par la démonstration GLOBALE du Super Administrateur a un
 * jeton qui dit "production" alors que ses requêtes sont bien servies en démo.
 */

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function DemoBanner() {
  const { status } = useSession();
  const [demo, setDemo] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rafraichir = useCallback(async () => {
    if (status !== "authenticated") {
      setDemo(false);
      return;
    }
    try {
      const res = await fetch("/api/demo/etat");
      const data = await res.json().catch(() => ({}));
      setDemo(Boolean(data.demo));
    } catch {
      // hors ligne : on garde le dernier état connu plutôt que de faire clignoter le bandeau
    }
  }, [status]);

  useEffect(() => {
    rafraichir();
    // La démonstration globale peut être activée/arrêtée pendant qu'une page est ouverte.
    const t = setInterval(rafraichir, 20000);
    window.addEventListener("focus", rafraichir);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", rafraichir);
    };
  }, [rafraichir]);

  if (!demo) return null;

  async function reinitialiser() {
    const confirme = window.confirm(
      "Cette action supprimera toutes les modifications effectuées pendant la démonstration et restaurera les données initiales. Voulez-vous continuer ?"
    );
    if (!confirme) return;
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch("/api/demo/reinitialiser", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? "Démonstration réinitialisée." : data.message ?? "Échec de la réinitialisation.");
      if (res.ok) setTimeout(() => window.location.reload(), 1200);
    } catch {
      setMessage("Échec de la réinitialisation (connexion).");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="sticky top-0 z-[100] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-alerte px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-white sm:text-sm">
      <span>Mode démonstration — Données fictives</span>
      <button
        type="button"
        onClick={reinitialiser}
        disabled={enCours}
        className="rounded-full border border-white/60 px-2.5 py-0.5 text-[11px] font-semibold normal-case tracking-normal hover:bg-white/15 disabled:opacity-60"
      >
        {enCours ? "Réinitialisation…" : "Réinitialiser la démonstration"}
      </button>
      {message && <span className="text-[11px] font-normal normal-case tracking-normal opacity-90">{message}</span>}
    </div>
  );
}

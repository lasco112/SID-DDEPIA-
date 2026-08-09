"use client";

/**
 * « J'ai terminé ce tableau » — signal de l'agent de saisie vers son DA.
 *
 * Un agent de saisie ne peut jamais soumettre le rapport : c'est le monopole
 * du Délégué d'Arrondissement. Sans ce bouton, sa seule façon de dire « c'est
 * fini de mon côté » était le téléphone.
 */

import { useState } from "react";

export default function FinDeSaisieButton({ templateCode }: { templateCode: string }) {
  const [etat, setEtat] = useState<"pret" | "envoi" | "fait" | "erreur">("pret");
  const [message, setMessage] = useState<string | null>(null);

  async function signaler() {
    setEtat("envoi");
    setMessage(null);
    try {
      const res = await fetch("/api/da/fin-de-saisie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Signal impossible.");
      setEtat("fait");
      setMessage("Votre Délégué d'Arrondissement a été prévenu.");
    } catch (e) {
      setEtat("erreur");
      setMessage(
        e instanceof Error && !/fetch|network/i.test(e.message)
          ? e.message
          : "Impossible de prévenir votre chef sans réseau. Réessayez une fois connecté."
      );
    }
  }

  return (
    <div>
      <button
        onClick={signaler}
        disabled={etat === "envoi" || etat === "fait"}
        className="rounded-lg border border-primary px-3 py-1.5 text-sm font-semibold text-primary-dark hover:bg-green-50 disabled:border-gray-300 disabled:text-gray-400"
      >
        {etat === "envoi" ? "Envoi…" : etat === "fait" ? "Chef prévenu ✓" : "J'ai terminé ce tableau"}
      </button>
      {message && <p className="mt-1 text-xs text-gray-600">{message}</p>}
    </div>
  );
}

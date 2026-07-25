"use client";

/**
 * ReporterEcheanceButton.tsx — permet au DD de repousser la date limite de
 * soumission DA pour TOUTE la période en cours (demande explicite du DD,
 * réunion de service). Pour un report ciblé sur un seul arrondissement, le
 * bouton « Déverrouiller » déjà présent sur cette page reste la bonne action
 * (voir DeverrouillerButton) — celui-ci change la date pour tout le monde.
 */

import { useState } from "react";

export default function ReporterEcheanceButton({
  dateLimiteActuelle,
  verrouillee,
}: {
  dateLimiteActuelle: string;
  verrouillee: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState(() => dateLimiteActuelle.slice(0, 10));
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirmer() {
    if (!date) return;
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch("/api/dd/reporter-echeance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateLimiteDA: new Date(`${date}T23:59:59`).toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec du report d'échéance.");
      setMessage(data.reouverte ? "Échéance reportée — la période est de nouveau ouverte pour tous les arrondissements." : "Échéance reportée.");
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setEnCours(false);
    }
  }

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="rounded-md border border-white/40 bg-white/10 px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-white/20"
      >
        Repousser l'échéance (tous les arrondissements)
      </button>
    );
  }

  return (
    <div className="rounded-md border border-gray-300 bg-white p-3 text-sm">
      <p className="mb-2 text-xs text-gray-600">
        {verrouillee
          ? "La période est verrouillée. Choisir une date future la rouvrira pour tous les arrondissements n'ayant pas encore soumis."
          : "Nouvelle date limite de soumission DA, pour tous les arrondissements."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        />
        <button
          onClick={confirmer}
          disabled={enCours || !date}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-60"
        >
          {enCours ? "Enregistrement…" : "Confirmer"}
        </button>
        <button
          onClick={() => setOuvert(false)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"
        >
          Annuler
        </button>
      </div>
      {message && <p className="mt-2 text-xs font-semibold text-primary-dark">{message}</p>}
    </div>
  );
}

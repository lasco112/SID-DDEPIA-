"use client";

/**
 * Éditeur de synthèse d'analyse par section (CDC §M5). Toute modification
 * invalide une validation DD antérieure (le DD doit revalider).
 */

import { useEffect, useState, useCallback } from "react";

export default function SectionAnalyseClient() {
  const [periodeId, setPeriodeId] = useState<string | null>(null);
  const [contenu, setContenu] = useState("");
  const [valideDD, setValideDD] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);

  const charger = useCallback(async () => {
    const periodeRes = await fetch("/api/periodes/active");
    if (!periodeRes.ok) return;
    const { periode } = await periodeRes.json();
    setPeriodeId(periode.id);

    const res = await fetch(`/api/syntheses?periodeId=${periode.id}`);
    if (res.ok) {
      const data = await res.json();
      setContenu(data.synthese?.contenuFinal ?? "");
      setValideDD(data.synthese?.valideDD ?? false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function enregistrer() {
    if (!periodeId) return;
    setEnregistrement(true);
    setMessage(null);
    try {
      const res = await fetch("/api/syntheses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodeId, contenuFinal: contenu }),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Échec de l'enregistrement.");
      setValideDD(false);
      setMessage("Synthèse enregistrée. En attente de validation du DD.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setEnregistrement(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-[23px] font-bold text-primary-dark">Synthèse d'analyse de la section</h1>
      <p className="mt-1 text-gray-600">
        Statut : {valideDD ? <span className="font-semibold text-green-700">Validée par le DD</span> : <span className="font-semibold text-amber-700">En attente de validation</span>}
      </p>

      <textarea
        rows={12}
        className="mt-4 w-full rounded-lg border border-gray-300 p-3"
        placeholder="Faits marquants, difficultés rencontrées, recommandations…"
        value={contenu}
        onChange={(e) => setContenu(e.target.value)}
      />

      <button
        onClick={enregistrer}
        disabled={enregistrement}
        className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-gray-300"
      >
        {enregistrement ? "Enregistrement…" : "Enregistrer la synthèse"}
      </button>
      {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}
    </div>
  );
}

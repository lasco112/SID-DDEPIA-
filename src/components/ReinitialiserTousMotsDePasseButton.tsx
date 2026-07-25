"use client";

/**
 * ReinitialiserTousMotsDePasseButton.tsx — remet le mot de passe temporaire
 * (password123) sur tous les comptes actifs sauf celui du DD connecté
 * (demande explicite du DD, réunion de service). Action IRRÉVERSIBLE :
 * nécessite de taper "REINITIALISER" avant que le bouton ne s'active.
 */

import { useState } from "react";

export default function ReinitialiserTousMotsDePasseButton() {
  const [ouvert, setOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirmer() {
    if (saisie !== "REINITIALISER") return;
    const ok = window.confirm(
      "Tous les comptes actifs (sauf le vôtre) recevront le mot de passe temporaire « password123 » et devront le changer à leur prochaine connexion. Continuer ?"
    );
    if (!ok) return;
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/utilisateurs/reinitialiser-tous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: saisie }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec de la réinitialisation.");
      setMessage(`${data.comptesAffectes} compte(s) réinitialisé(s) avec le mot de passe temporaire « password123 ».`);
      setSaisie("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-900">Réinitialiser tous les mots de passe</p>
      <p className="mt-1 text-xs text-amber-800">
        Remet « password123 » comme mot de passe temporaire sur tous les comptes actifs (sauf le vôtre) ; chacun devra
        le changer à sa prochaine connexion.
      </p>

      {!ouvert ? (
        <button
          onClick={() => setOuvert(true)}
          className="mt-3 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
        >
          Réinitialiser tous les mots de passe
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-amber-900">Tapez REINITIALISER pour confirmer</label>
            <input
              type="text"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              className="w-full max-w-xs rounded-md border border-amber-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={confirmer}
              disabled={saisie !== "REINITIALISER" || enCours}
              className="rounded-md bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {enCours ? "Réinitialisation…" : "Confirmer pour tous les comptes"}
            </button>
            <button
              onClick={() => {
                setOuvert(false);
                setSaisie("");
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-3 text-sm font-semibold text-amber-900">{message}</p>}
    </div>
  );
}

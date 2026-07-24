"use client";

/**
 * PurgerDonneesTestButton.tsx — purge des données de test avant la mise en
 * production réelle (demande explicite du DD, réunion de service). Action
 * IRRÉVERSIBLE : nécessite de taper "SUPPRIMER" avant que le bouton ne
 * s'active, en plus d'une confirmation navigateur. Ne touche jamais les
 * comptes, arrondissements, tableaux ni référentiels — voir
 * /api/dd/purger-donnees-test.
 */

import { useEffect, useState } from "react";

interface Comptage {
  saisies: number;
  rapports: number;
  validations: number;
  syntheses: number;
  corrections: number;
  exports: number;
  notifications: number;
}

export default function PurgerDonneesTestButton() {
  const [ouvert, setOuvert] = useState(false);
  const [comptage, setComptage] = useState<Comptage | null>(null);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (ouvert) {
      fetch("/api/dd/purger-donnees-test")
        .then((r) => r.json())
        .then(setComptage)
        .catch(() => setComptage(null));
    }
  }, [ouvert]);

  async function confirmer() {
    if (saisie !== "SUPPRIMER") return;
    const ok = window.confirm(
      "Cette action est IRRÉVERSIBLE : toutes les saisies, rapports, validations, synthèses, corrections et exports seront définitivement supprimés. Les comptes, arrondissements, tableaux et référentiels seront conservés. Continuer ?"
    );
    if (!ok) return;
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch("/api/dd/purger-donnees-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: saisie }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec de la purge.");
      setMessage("Données de test supprimées. Le système est prêt pour une utilisation réelle.");
      setSaisie("");
      setTimeout(() => window.location.reload(), 1800);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-900">Zone sensible — avant la mise en production</p>
      <p className="mt-1 text-xs text-red-800">
        Supprime définitivement toutes les saisies, rapports, validations, synthèses, corrections et exports générés
        pendant les tests. Les comptes utilisateurs, arrondissements, tableaux et référentiels ne sont jamais touchés.
      </p>

      {!ouvert ? (
        <button
          onClick={() => setOuvert(true)}
          className="mt-3 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          Purger les données de test
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          {comptage && (
            <ul className="rounded-md bg-white p-3 text-xs text-gray-700">
              <li>{comptage.saisies} saisie(s)</li>
              <li>{comptage.rapports} rapport(s) d'arrondissement</li>
              <li>{comptage.validations} validation(s) de section</li>
              <li>{comptage.syntheses} synthèse(s) d'analyse</li>
              <li>{comptage.corrections} correction(s)</li>
              <li>{comptage.exports} export(s) générés</li>
              <li>{comptage.notifications} notification(s)</li>
            </ul>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-red-900">
              Tapez SUPPRIMER pour confirmer
            </label>
            <input
              type="text"
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              className="w-full max-w-xs rounded-md border border-red-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={confirmer}
              disabled={saisie !== "SUPPRIMER" || enCours}
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {enCours ? "Suppression…" : "Confirmer la suppression définitive"}
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

      {message && <p className="mt-3 text-sm font-semibold text-red-900">{message}</p>}
    </div>
  );
}

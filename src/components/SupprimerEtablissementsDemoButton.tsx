"use client";

/**
 * SupprimerEtablissementsDemoButton.tsx — supprime en une fois TOUS les
 * établissements de démonstration, quel que soit leur type et leur
 * arrondissement.
 *
 * Le registre n'affichant qu'un type × un arrondissement à la fois (24
 * combinaisons), les supprimer un par un obligeait à penser à chaque onglet ;
 * un oubli suffisait pour qu'ils continuent d'apparaître dans les tableaux de
 * saisie des DA. Ce bouton affiche d'abord la liste exacte de ce qui sera
 * supprimé, pour qu'il n'y ait aucune surprise.
 */

import { useEffect, useState } from "react";

interface Apercu {
  total: number;
  saisiesLiees: number;
  etablissements: Array<{ id: string; nom: string; typeCode: string; arrondissement: string }>;
}

const LIBELLE_TYPE: Record<string, string> = {
  ETAB_COUVOIR: "Couvoirs",
  ETAB_FERME_PONTE: "Fermes de ponte",
  ETAB_FERME_CHAIR: "Fermes de chair",
  ETAB_PROVENDERIE: "Provenderies",
};

export default function SupprimerEtablissementsDemoButton() {
  const [ouvert, setOuvert] = useState(false);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    fetch("/api/dd/etablissements-demo")
      .then((r) => r.json())
      .then(setApercu)
      .catch(() => setApercu(null));
  }, [ouvert]);

  async function confirmer() {
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch("/api/dd/etablissements-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "SUPPRIMER" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec de la suppression.");
      setMessage(
        `${data.supprimes} établissement(s) de démonstration supprimé(s), ainsi que ${data.saisiesSupprimees} saisie(s) rattachée(s).`
      );
      setApercu(null);
      setTimeout(() => window.location.reload(), 1800);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setEnCours(false);
    }
  }

  // Regroupement par type : montre d'un coup d'œil les onglets qu'on aurait
  // pu oublier en supprimant à la main.
  const parType = (apercu?.etablissements ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.typeCode] = (acc[e.typeCode] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-900">Établissements de démonstration</p>
      <p className="mt-1 text-xs text-red-800">
        Supprime d'un seul coup tous les établissements « (DÉMO) » de tous les types et de tous les arrondissements —
        sans avoir à parcourir les 4 onglets pour chacun des 6 arrondissements.
      </p>

      {!ouvert ? (
        <button
          onClick={() => setOuvert(true)}
          className="mt-3 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          Supprimer tous les établissements de démonstration
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          {apercu === null ? (
            <p className="text-xs text-red-800">Recherche en cours…</p>
          ) : apercu.total === 0 ? (
            <p className="text-sm font-semibold text-red-900">
              Aucun établissement de démonstration restant : le registre est déjà propre.
            </p>
          ) : (
            <div className="rounded-md bg-white p-3 text-xs text-gray-700">
              <p className="font-semibold text-gray-800">
                {apercu.total} établissement(s) à supprimer, et {apercu.saisiesLiees} saisie(s) rattachée(s) :
              </p>
              <ul className="mt-2 space-y-0.5">
                {Object.entries(parType).map(([code, n]) => (
                  <li key={code}>
                    {LIBELLE_TYPE[code] ?? code} : <strong>{n}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2">
            {apercu !== null && apercu.total > 0 && (
              <button
                onClick={confirmer}
                disabled={enCours}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {enCours ? "Suppression…" : "Confirmer la suppression définitive"}
              </button>
            )}
            <button
              onClick={() => {
                setOuvert(false);
                setApercu(null);
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-3 text-sm font-semibold text-red-900">{message}</p>}
    </div>
  );
}

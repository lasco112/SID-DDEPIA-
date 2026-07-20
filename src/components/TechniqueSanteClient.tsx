"use client";

import { useEffect, useState, useCallback } from "react";

interface Sante {
  db: { ok: boolean; latenceMs: number };
  compteurs: Record<string, number>;
  dernierBackup: { fichier: string; dateModification: string; tailleOctets: number } | null;
  serveur: { heureServeur: string; nodeVersion: string };
}

const LIBELLES_COMPTEUR: Record<string, string> = {
  utilisateurs: "Comptes utilisateurs",
  arrondissements: "Arrondissements",
  rapports: "Rapports (tous mois)",
  saisiesMatrice: "Saisies MATRICE",
  saisiesNominative: "Saisies NOMINATIF",
  saisiesEvenement: "Événements déclarés",
  auditLogs: "Entrées du journal d'audit",
};

export default function TechniqueSanteClient() {
  const [sante, setSante] = useState<Sante | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const res = await fetch("/api/technique/sante");
      if (!res.ok) throw new Error((await res.json()).message ?? "Échec du chargement.");
      setSante(await res.json());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur.");
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  if (erreur) return <p className="rounded bg-red-50 p-3 text-red-700">{erreur}</p>;
  if (!sante) return <p className="text-sm text-gray-500">Chargement…</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Base de données</h2>
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${sante.db.ok ? "bg-green-500" : "bg-red-500"}`} />
          <span className="font-semibold">{sante.db.ok ? "Connectée" : "Injoignable"}</span>
          <span className="text-sm text-gray-500">({sante.db.latenceMs} ms)</span>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Compteurs</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(sante.compteurs).map(([cle, valeur]) => (
            <div key={cle} className="rounded-md bg-gray-50 p-3">
              <div className="text-2xl font-bold text-primary-dark">{valeur.toLocaleString("fr-FR")}</div>
              <div className="text-xs text-gray-500">{LIBELLES_COMPTEUR[cle] ?? cle}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Dernière sauvegarde</h2>
        {sante.dernierBackup ? (
          <p className="text-sm">
            <strong>{sante.dernierBackup.fichier}</strong> — {(sante.dernierBackup.tailleOctets / 1024).toFixed(1)} Ko —{" "}
            {new Date(sante.dernierBackup.dateModification).toLocaleString("fr-FR")}
          </p>
        ) : (
          <p className="text-sm text-amber-700">Aucune sauvegarde trouvée.</p>
        )}
      </div>

      <button onClick={charger} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
        Actualiser
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";

interface Sauvegarde {
  fichier: string;
  tailleOctets: number;
  dateCreation: string;
}

export default function TechniqueSauvegardeClient() {
  const [sauvegardes, setSauvegardes] = useState<Sauvegarde[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    setChargement(true);
    const res = await fetch("/api/technique/sauvegarde");
    if (res.ok) setSauvegardes((await res.json()).sauvegardes);
    setChargement(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function declencher() {
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch("/api/technique/sauvegarde", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec de la sauvegarde.");
      setMessage(`Sauvegarde créée : ${data.fichier} (${(data.tailleOctets / 1024).toFixed(1)} Ko).`);
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div>
      <button
        onClick={declencher}
        disabled={enCours}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {enCours ? "Sauvegarde en cours…" : "Déclencher une sauvegarde maintenant"}
      </button>
      {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}

      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Sauvegardes existantes</h2>
      {chargement ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : sauvegardes.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune sauvegarde pour le moment.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border-b border-gray-200 px-3 py-2">Fichier</th>
                <th className="border-b border-gray-200 px-3 py-2">Taille</th>
                <th className="border-b border-gray-200 px-3 py-2">Date</th>
                <th className="border-b border-gray-200 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {sauvegardes.map((s) => (
                <tr key={s.fichier}>
                  <td className="border-b border-gray-100 px-3 py-2 font-mono text-xs">{s.fichier}</td>
                  <td className="border-b border-gray-100 px-3 py-2">{(s.tailleOctets / 1024).toFixed(1)} Ko</td>
                  <td className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">{new Date(s.dateCreation).toLocaleString("fr-FR")}</td>
                  <td className="border-b border-gray-100 px-3 py-2">
                    <a href={`/api/technique/sauvegarde/${s.fichier}`} className="text-xs font-semibold text-blue-700 hover:underline">
                      Télécharger
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

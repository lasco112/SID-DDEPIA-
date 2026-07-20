"use client";

import { useEffect, useState, useCallback } from "react";

interface EntreeAudit {
  id: string;
  action: string;
  entite: string | null;
  entiteId: string | null;
  details: unknown;
  createdAt: string;
  user: { username: string; nom: string; role: string } | null;
}

export default function TechniqueAuditClient() {
  const [entrees, setEntrees] = useState<EntreeAudit[]>([]);
  const [actionsDisponibles, setActionsDisponibles] = useState<string[]>([]);
  const [actionFiltre, setActionFiltre] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tailleDePage, setTailleDePage] = useState(50);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const params = new URLSearchParams({ page: String(page), ...(actionFiltre ? { action: actionFiltre } : {}) });
      const res = await fetch(`/api/technique/audit?${params}`);
      if (!res.ok) throw new Error((await res.json()).message ?? "Échec du chargement.");
      const data = await res.json();
      setEntrees(data.entrees);
      setActionsDisponibles(data.actionsDisponibles);
      setTotal(data.total);
      setTailleDePage(data.tailleDePage);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setChargement(false);
    }
  }, [page, actionFiltre]);

  useEffect(() => {
    charger();
  }, [charger]);

  const nbPages = Math.max(1, Math.ceil(total / tailleDePage));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-gray-600">Filtrer par action :</label>
        <select
          value={actionFiltre}
          onChange={(e) => {
            setPage(1);
            setActionFiltre(e.target.value);
          }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="">Toutes</option>
          {actionsDisponibles.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">{total} entrée(s) au total</span>
      </div>

      {erreur && <p className="mb-3 rounded bg-red-50 p-3 text-red-700">{erreur}</p>}
      {chargement ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border-b border-gray-200 px-3 py-2">Date</th>
                <th className="border-b border-gray-200 px-3 py-2">Utilisateur</th>
                <th className="border-b border-gray-200 px-3 py-2">Action</th>
                <th className="border-b border-gray-200 px-3 py-2">Entité</th>
                <th className="border-b border-gray-200 px-3 py-2">Détails</th>
              </tr>
            </thead>
            <tbody>
              {entrees.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-xs text-gray-500">
                    {new Date(e.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="border-b border-gray-100 px-3 py-2">{e.user ? `${e.user.nom} (${e.user.username})` : "—"}</td>
                  <td className="border-b border-gray-100 px-3 py-2 font-mono text-xs">{e.action}</td>
                  <td className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">{e.entite ?? "—"}</td>
                  <td className="max-w-xs truncate border-b border-gray-100 px-3 py-2 font-mono text-xs text-gray-500" title={JSON.stringify(e.details)}>
                    {e.details ? JSON.stringify(e.details) : "—"}
                  </td>
                </tr>
              ))}
              {entrees.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                    Aucune entrée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Précédent
        </button>
        <span className="text-sm text-gray-500">
          Page {page} / {nbPages}
        </span>
        <button
          disabled={page >= nbPages}
          onClick={() => setPage((p) => p + 1)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          Suivant
        </button>
      </div>
    </div>
  );
}

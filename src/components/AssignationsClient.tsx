"use client";

/**
 * AssignationsClient.tsx — le DA choisit, tableau par tableau, quel agent de
 * saisie en est responsable ce mois-ci. Chaque changement s'enregistre
 * immédiatement (pas de bouton "Enregistrer" global) ; purement indicatif,
 * voir /api/da/assignations.
 */

import { useEffect, useState } from "react";

interface Agent {
  id: string;
  nom: string;
}
interface TableauRow {
  code: string;
  numero: string;
  titre: string;
  agentId: string | null;
}

export default function AssignationsClient() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tableaux, setTableaux] = useState<TableauRow[]>([]);
  const [periode, setPeriode] = useState<{ annee: number; mois: number | null } | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/da/assignations")
      .then((r) => r.json())
      .then((data) => {
        setAgents(data.agents ?? []);
        setTableaux(data.tableaux ?? []);
        setPeriode(data.periode ?? null);
      })
      .finally(() => setChargement(false));
  }, []);

  async function changer(code: string, agentId: string | null) {
    setTableaux((prev) => prev.map((t) => (t.code === code ? { ...t, agentId } : t)));
    setEnregistrement(code);
    await fetch("/api/da/assignations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateCode: code, agentId }),
    });
    setEnregistrement(null);
  }

  if (chargement) return <p className="text-sm text-gray-500">Chargement…</p>;

  if (agents.length === 0) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        Aucun agent de saisie actif n'est rattaché à votre arrondissement. Le DD peut en créer un compte depuis «
        Comptes utilisateurs ».
      </p>
    );
  }
  if (!periode) {
    return <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Aucune période n'est ouverte.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="border-b border-gray-200 px-4 py-2">Tableau</th>
            <th className="border-b border-gray-200 px-4 py-2">Attribué à</th>
          </tr>
        </thead>
        <tbody>
          {tableaux.map((t) => (
            <tr key={t.code}>
              <td className="border-b border-gray-100 px-4 py-2">
                <span className="mr-2 font-mono text-xs text-gray-400">{t.numero}</span>
                {t.titre}
              </td>
              <td className="border-b border-gray-100 px-4 py-2">
                <select
                  value={t.agentId ?? ""}
                  onChange={(e) => changer(t.code, e.target.value || null)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="">— Non attribué —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.nom}</option>
                  ))}
                </select>
                {enregistrement === t.code && <span className="ml-2 text-xs text-gray-400">Enregistrement…</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

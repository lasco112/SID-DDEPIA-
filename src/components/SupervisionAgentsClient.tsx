"use client";

/**
 * SupervisionAgentsClient.tsx — vue DA sur les agents de saisie de son
 * arrondissement (demande de la réunion de service) : qui a saisi quoi,
 * pour la période active. Le détail par agent se charge à la demande
 * (accordéon), pour ne pas alourdir la liste au premier chargement.
 */

import { useEffect, useState } from "react";

interface AgentRow {
  id: string;
  nom: string;
  username: string;
  actif: boolean;
  totalSaisies: number;
  derniereActivite: string | null;
}
interface SaisieDetail {
  tableau: string;
  libelle: string;
  valeur: string;
  syncedAt: string;
}

export default function SupervisionAgentsClient() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [periode, setPeriode] = useState<{ annee: number; mois: number | null } | null>(null);
  const [chargement, setChargement] = useState(true);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, SaisieDetail[]>>({});
  const [chargementDetail, setChargementDetail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/da/agents-saisie")
      .then((r) => r.json())
      .then((data) => {
        setAgents(data.agents ?? []);
        setPeriode(data.periode ?? null);
      })
      .finally(() => setChargement(false));
  }, []);

  async function basculer(id: string) {
    if (ouvert === id) {
      setOuvert(null);
      return;
    }
    setOuvert(id);
    if (!details[id]) {
      setChargementDetail(id);
      const res = await fetch(`/api/da/agents-saisie/${id}`);
      const data = await res.json();
      setDetails((prev) => ({ ...prev, [id]: data.saisies ?? [] }));
      setChargementDetail(null);
    }
  }

  if (chargement) return <p className="text-sm text-gray-500">Chargement…</p>;

  if (agents.length === 0) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        Aucun agent de saisie n'est rattaché à votre arrondissement. Le DD peut en créer un compte depuis « Comptes
        utilisateurs ».
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {periode && (
        <p className="text-xs text-gray-500">
          Période : {periode.mois}/{periode.annee}
        </p>
      )}
      {agents.map((agent) => (
        <div key={agent.id} className="rounded-lg border border-gray-200 bg-white">
          <button
            onClick={() => basculer(agent.id)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div>
              <p className="font-medium text-gray-800">
                {agent.nom} <span className="font-mono text-xs text-gray-400">({agent.username})</span>
                {!agent.actif && <span className="ml-2 text-xs text-red-600">désactivé</span>}
              </p>
              <p className="text-xs text-gray-500">
                {agent.totalSaisies} donnée(s) saisie(s)
                {agent.derniereActivite && ` — dernière activité le ${new Date(agent.derniereActivite).toLocaleString("fr-FR")}`}
              </p>
            </div>
            <span className="text-primary">{ouvert === agent.id ? "▲" : "▼"}</span>
          </button>

          {ouvert === agent.id && (
            <div className="border-t border-gray-100 px-4 py-3">
              {chargementDetail === agent.id ? (
                <p className="text-sm text-gray-500">Chargement…</p>
              ) : (details[agent.id]?.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-500">Aucune donnée saisie par cette personne ce mois-ci.</p>
              ) : (
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="pb-1">Tableau</th>
                      <th className="pb-1">Indicateur</th>
                      <th className="pb-1">Valeur</th>
                      <th className="pb-1">Enregistré le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details[agent.id].map((s, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1 pr-2">{s.tableau}</td>
                        <td className="py-1 pr-2">{s.libelle}</td>
                        <td className="py-1 pr-2 font-medium">{s.valeur}</td>
                        <td className="py-1 text-gray-400">{new Date(s.syncedAt).toLocaleString("fr-FR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

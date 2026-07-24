"use client";

import { useEffect, useState } from "react";

interface Demande {
  id: string;
  page: string;
  tableauCode: string | null;
  message: string;
  traite: boolean;
  createdAt: string;
  user: { nom: string; username: string; role: string };
}

export default function AideInboxClient() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [chargement, setChargement] = useState(true);

  function charger() {
    fetch("/api/aide/questions")
      .then((r) => r.json())
      .then((data) => setDemandes(data.demandes ?? []))
      .finally(() => setChargement(false));
  }

  useEffect(charger, []);

  async function marquerTraite(id: string) {
    setDemandes((prev) => prev.map((d) => (d.id === id ? { ...d, traite: true } : d)));
    await fetch(`/api/aide/questions/${id}`, { method: "POST" });
  }

  if (chargement) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (demandes.length === 0) return <p className="text-sm text-gray-500">Aucune question posée pour l'instant.</p>;

  return (
    <div className="space-y-3">
      {demandes.map((d) => (
        <div key={d.id} className={`rounded-lg border p-4 ${d.traite ? "border-gray-200 bg-gray-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {d.user.nom} ({d.user.username}) — {d.page}
              {d.tableauCode && ` — tableau ${d.tableauCode}`}
            </span>
            <span>{new Date(d.createdAt).toLocaleString("fr-FR")}</span>
          </div>
          <p className="mt-2 text-sm text-gray-800">{d.message}</p>
          {!d.traite && (
            <button onClick={() => marquerTraite(d.id)} className="mt-2 text-xs font-semibold text-primary hover:underline">
              Marquer comme traité
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

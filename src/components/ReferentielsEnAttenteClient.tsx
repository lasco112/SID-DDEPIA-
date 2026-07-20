"use client";

/**
 * ReferentielsEnAttenteClient.tsx — le DD valide ou rejette les propositions
 * de l'admin technique qui créeraient de nouvelles colonnes dans le canevas
 * (nouvelle espèce, volaille, poisson). Rien ne change dans les tableaux tant
 * que le DD n'a pas validé.
 */

import { useEffect, useState, useCallback } from "react";

interface ItemEnAttente {
  id: string;
  categorie: string;
  code: string;
  libelle: string;
  createdAt: string;
  proposePar: { nom: string; username: string } | null;
}

const LIBELLES_CATEGORIE: Record<string, string> = {
  ESPECE: "Espèce (Tableau 1.1 — Effectif du cheptel)",
  VOLAILLE: "Volaille (Tableau 1.2 — Effectif de la volaille)",
  ESPECE_HALIEUTIQUE: "Espèce halieutique (Tableau 1.7 — Pisciculture)",
};

export default function ReferentielsEnAttenteClient() {
  const [items, setItems] = useState<ItemEnAttente[]>([]);
  const [chargement, setChargement] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const res = await fetch("/api/dd/referentiels-en-attente");
    if (res.ok) setItems((await res.json()).items);
    setChargement(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function decider(id: string, decision: "VALIDE" | "REJETE") {
    setEnCours(id);
    setMessage(null);
    try {
      const res = await fetch(`/api/dd/referentiels-en-attente/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec.");
      setMessage(
        decision === "VALIDE"
          ? `Validé — nouvelle(s) colonne(s) créée(s) : ${data.champsCrees.join(", ")}.`
          : "Proposition rejetée."
      );
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setEnCours(null);
    }
  }

  if (chargement) return <p className="text-sm text-gray-500">Chargement…</p>;

  return (
    <div>
      {message && <p className="mb-4 rounded bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune proposition en attente.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-800">{item.libelle}</p>
                  <p className="text-xs text-gray-500">
                    {LIBELLES_CATEGORIE[item.categorie] ?? item.categorie} — code <span className="font-mono">{item.code}</span>
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Proposé par {item.proposePar ? `${item.proposePar.nom} (${item.proposePar.username})` : "—"} le{" "}
                    {new Date(item.createdAt).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => decider(item.id, "VALIDE")}
                    disabled={enCours === item.id}
                    className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                  >
                    Valider
                  </button>
                  <button
                    onClick={() => decider(item.id, "REJETE")}
                    disabled={enCours === item.id}
                    className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    Rejeter
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * « Confirmer ce tableau » — transforme les valeurs reprises du mois précédent
 * en données du mois en cours.
 *
 * Tant qu'un tableau contient des valeurs reprises non confirmées, le rapport
 * ne peut pas être transmis : c'est le garde-fou qui empêche de déclarer la
 * production du mois précédent comme étant celle du mois en cours.
 */

import { useState } from "react";

export default function ConfirmerTableauButton({
  templateCode,
  nbReprises,
  onConfirme,
}: {
  templateCode: string;
  nbReprises: number;
  onConfirme?: () => void;
}) {
  const [etat, setEtat] = useState<"pret" | "envoi" | "fait">("pret");
  const [message, setMessage] = useState<string | null>(null);

  if (nbReprises === 0 && etat !== "fait") return null;

  async function confirmer() {
    setEtat("envoi");
    setMessage(null);
    try {
      const res = await fetch("/api/da/confirmer-tableau", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Confirmation impossible.");
      setEtat("fait");
      setMessage(
        data.tableauxRestants?.length
          ? `Tableau confirmé. Restent à confirmer : ${data.tableauxRestants.join(", ")}.`
          : "Tableau confirmé. Tous les tableaux sont à jour."
      );
      onConfirme?.();
    } catch (e) {
      setEtat("pret");
      setMessage(
        e instanceof Error && !/fetch|network/i.test(e.message)
          ? e.message
          : "Confirmation impossible sans réseau. Réessayez une fois connecté."
      );
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
      {etat !== "fait" && (
        <p className="text-sm text-amber-900">
          <strong>{nbReprises}</strong> valeur{nbReprises > 1 ? "s" : ""} {nbReprises > 1 ? "sont reprises" : "est reprise"} du
          mois précédent et {nbReprises > 1 ? "attendent" : "attend"} votre confirmation. Corrigez ce qui a changé, puis
          confirmez : le rapport ne pourra pas être transmis avant.
        </p>
      )}
      {etat !== "fait" && (
        <button
          onClick={confirmer}
          disabled={etat === "envoi"}
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:bg-gray-300"
        >
          {etat === "envoi" ? "Confirmation…" : "Confirmer ce tableau"}
        </button>
      )}
      {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";

interface Props {
  periodeId: string;
  type?: "DD" | "EXACT";
  label?: string;
}

export default function GenererRapportDDButton({ periodeId, type = "DD", label }: Props) {
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function generer() {
    setEnCours(true);
    setMessage(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodeId, type }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const details = [
          ...(data.daManquants?.length ? [`Arrondissements non soumis : ${data.daManquants.join(", ")}`] : []),
          ...(data.sectionsNonValidees?.length ? [`Sections non validées : ${data.sectionsNonValidees.join(", ")}`] : []),
        ].join(" — ");
        throw new Error([data.message, details].filter(Boolean).join(" "));
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "rapport.docx";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Document généré et téléchargé.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur lors de la génération.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div>
      <button
        onClick={generer}
        disabled={enCours}
        className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {enCours ? "Génération…" : label ?? (type === "DD" ? "Générer le rapport départemental (.docx)" : "Générer la fiche de collecte (.docx)")}
      </button>
      {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}
    </div>
  );
}

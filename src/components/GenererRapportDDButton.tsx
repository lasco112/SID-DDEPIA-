"use client";

import { useState } from "react";

interface Props {
  periodeId: string;
  type?: "DD" | "EXACT" | "APERCU";
  label?: string;
  /** L'aperçu n'est pas un document administratif : bouton secondaire. */
  secondaire?: boolean;
}

const LIBELLE_PAR_DEFAUT: Record<string, string> = {
  DD: "Générer le rapport définitif (.docx)",
  EXACT: "Générer la fiche de collecte (.docx)",
  APERCU: "Générer l'aperçu (brouillon)",
};

export default function GenererRapportDDButton({ periodeId, type = "DD", label, secondaire = false }: Props) {
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
          ...(data.daManquants?.length
            ? [`Arrondissements n'ayant pas encore soumis leur rapport : ${data.daManquants.join(", ")}.`]
            : []),
          ...(data.sectionsNonValidees?.length
            ? [
                `Sections n'ayant pas encore validé leurs données (menu « Contrôle sectoriel » du chef concerné, bouton « Valider ma section pour cette période ») : ${data.sectionsNonValidees.join(", ")}.`,
              ]
            : []),
        ].join(" ");
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
        className={
          secondaire
            ? "rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-green-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
            : "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-300"
        }
      >
        {enCours ? "Génération…" : label ?? LIBELLE_PAR_DEFAUT[type]}
      </button>
      {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}
    </div>
  );
}

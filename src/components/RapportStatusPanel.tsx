"use client";

/**
 * RapportStatusPanel.tsx — statut du rapport DA courant + synchronisation
 * et soumission officielle (CDC §5 : EN_SAISIE → SOUMIS).
 */

import { useEffect, useState, useCallback } from "react";
import SyncButton from "@/components/SyncButton";
import BackupLocalButton from "@/components/BackupLocalButton";

const LIBELLES: Record<string, string> = {
  EN_SAISIE: "En saisie",
  SOUMIS: "Soumis",
  REJETE: "Rejeté — à corriger",
  CLOTURE: "Clôturé",
};

export default function RapportStatusPanel({ username, peutSoumettre = true }: { username: string; peutSoumettre?: boolean }) {
  const [periodeId, setPeriodeId] = useState<string | null>(null);
  const [statut, setStatut] = useState<string | null>(null);
  const [motifRejet, setMotifRejet] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [soumission, setSoumission] = useState(false);
  const [generation, setGeneration] = useState(false);

  const charger = useCallback(async () => {
    const periodeRes = await fetch("/api/periodes/active");
    if (!periodeRes.ok) return;
    const { periode } = await periodeRes.json();
    setPeriodeId(periode.id);

    const res = await fetch(`/api/rapports/mon-rapport?periodeId=${periode.id}`);
    if (res.ok) {
      const data = await res.json();
      setStatut(data.rapport?.statut ?? "EN_SAISIE");
      setMotifRejet(data.rapport?.motifRejet ?? null);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function soumettre() {
    if (!periodeId) return;
    setSoumission(true);
    setMessage(null);
    try {
      const res = await fetch("/api/rapports/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec de la soumission.");
      setStatut("SOUMIS");
      setMessage("Rapport soumis avec succès.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur lors de la soumission.");
    } finally {
      setSoumission(false);
    }
  }

  async function genererDocx() {
    if (!periodeId) return;
    setGeneration(true);
    setMessage(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodeId, type: "DA" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Échec de la génération.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? "rapport.docx";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Rapport généré et téléchargé.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur lors de la génération.");
    } finally {
      setGeneration(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-sm text-gray-500">Statut du rapport : </span>
          <span className="font-semibold">{statut ? LIBELLES[statut] ?? statut : "…"}</span>
          {motifRejet && <p className="mt-1 text-sm text-red-700">Motif du rejet : {motifRejet}</p>}
        </div>
        {periodeId && <SyncButton periodeId={periodeId} username={username} onSynced={charger} />}
      </div>

      {peutSoumettre && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(statut === "EN_SAISIE" || statut === "REJETE") && (
            <button
              onClick={soumettre}
              disabled={soumission}
              className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {soumission ? "Soumission…" : "Soumettre mon rapport mensuel"}
            </button>
          )}
          {(statut === "SOUMIS" || statut === "CLOTURE") && (
            <button
              onClick={genererDocx}
              disabled={generation}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {generation ? "Génération…" : "Générer mon rapport d'arrondissement (.docx)"}
            </button>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-gray-100 pt-3">
        <BackupLocalButton username={username} />
      </div>
      {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}
    </div>
  );
}

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

export default function RapportStatusPanel({
  username,
  destinataire,
  peutSoumettre = true,
}: {
  username: string;
  /** Libellé du destinataire hiérarchique direct pour le bouton d'envoi, ex. "Délégué Départemental". */
  destinataire: string;
  peutSoumettre?: boolean;
}) {
  const [periodeId, setPeriodeId] = useState<string | null>(null);
  const [statut, setStatut] = useState<string | null>(null);
  const [motifRejet, setMotifRejet] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [generation, setGeneration] = useState(false);
  const [dernierRapport, setDernierRapport] = useState<{ id: string; version: number; createdAt: string } | null>(null);

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

    // Rapport déjà transmis : on propose de le relire tel quel plutôt que d'en
    // générer une version de plus à chaque consultation.
    try {
      const arch = await fetch(`/api/reports/archives?periodeId=${periode.id}`);
      if (arch.ok) {
        const { documents } = await arch.json();
        setDernierRapport(documents.find((d: { disponible: boolean }) => d.disponible) ?? null);
      }
    } catch {
      // hors ligne : le rapport reste consultable une fois la connexion revenue
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

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
      charger(); // rafraîchit le lien « relire mon rapport transmis » sur la nouvelle version
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
        {periodeId && (
          <SyncButton
            periodeId={periodeId}
            username={username}
            destinataire={destinataire}
            peutSoumettre={peutSoumettre}
            onSynced={charger}
          />
        )}
      </div>

      {peutSoumettre && (
        <div className="mt-3 flex flex-wrap gap-2">
          {(statut === "SOUMIS" || statut === "CLOTURE") && (
            <button
              onClick={genererDocx}
              disabled={generation}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {generation ? "Génération…" : "Générer mon rapport d'arrondissement (.docx)"}
            </button>
          )}
          {dernierRapport && (
            <a
              href={`/api/reports/archives/${dernierRapport.id}?apercu=1`}
              target="_blank"
              rel="noopener"
              className="rounded-lg border border-primary px-4 py-2 text-sm font-semibold text-primary-dark hover:bg-green-50"
            >
              Relire mon rapport transmis (v{dernierRapport.version} du{" "}
              {new Date(dernierRapport.createdAt).toLocaleDateString("fr-FR")})
            </a>
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

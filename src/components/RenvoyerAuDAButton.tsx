"use client";

/**
 * Le DD renvoie au DA un rapport déjà transmis (décision du Délégué,
 * 1er octobre 2026). Motif obligatoire, lu par le DA dans sa notification.
 * Quand le DA a lui-même demandé le renvoi, sa demande est affichée et sert
 * de motif proposé.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RenvoyerAuDAButton({
  rapportId,
  arrondissement,
  demande,
}: {
  rapportId: string;
  arrondissement: string;
  /** Demande du DA en attente : quand, et quels tableaux. */
  demande?: { le: string; tableaux: string[] } | null;
}) {
  const motifPropose = demande
    ? `Correction demandée par l'arrondissement${demande.tableaux.length ? ` : ${demande.tableaux.join(", ")}` : ""}.`
    : "";
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState(motifPropose);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const router = useRouter();

  async function confirmer() {
    if (!motif.trim()) return;
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/rapports/rejeter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rapportId, motif }),
      });
      if (res.ok) {
        setOuvert(false);
        router.refresh();
      } else {
        setErreur((await res.json().catch(() => ({}))).message ?? "Renvoi impossible.");
      }
    } catch {
      setErreur("Pas de connexion : réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="min-w-[180px]">
      {demande && (
        <p className="mb-1 rounded bg-red-50 px-2 py-1 text-[11px] font-semibold leading-snug text-red-800">
          ⚠ Demande de renvoi du {new Date(demande.le).toLocaleDateString("fr-FR")}
          {demande.tableaux.length > 0 && <span className="block font-normal">{demande.tableaux.join(", ")}</span>}
        </p>
      )}
      {!ouvert ? (
        <button onClick={() => setOuvert(true)} className="text-xs font-semibold text-red-700 hover:underline">
          Renvoyer au DA pour correction
        </button>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          <label className="text-[11px] text-gray-600">Motif (lu par le DA de {arrondissement}) :</label>
          <textarea
            rows={2}
            className="rounded border border-gray-300 px-2 py-1 text-xs"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Motif obligatoire"
          />
          <div className="flex gap-2">
            <button
              onClick={confirmer}
              disabled={!motif.trim() || enCours}
              className="rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white disabled:bg-gray-300"
            >
              {enCours ? "Renvoi…" : "Renvoyer"}
            </button>
            <button onClick={() => setOuvert(false)} className="rounded border border-gray-300 px-2 py-1 text-xs">
              Annuler
            </button>
          </div>
          {erreur && <p className="text-[11px] text-red-700">{erreur}</p>}
        </div>
      )}
    </div>
  );
}

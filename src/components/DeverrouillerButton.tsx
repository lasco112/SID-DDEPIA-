"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeverrouillerButton({ rapportId }: { rapportId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const router = useRouter();

  async function confirmer() {
    if (!motif.trim()) return;
    setEnCours(true);
    try {
      const res = await fetch("/api/periodes/deverrouiller", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rapportId, motif }),
      });
      if (res.ok) {
        setOuvert(false);
        router.refresh();
      }
    } finally {
      setEnCours(false);
    }
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} className="text-xs font-medium text-amber-700 hover:underline">
        Déverrouiller exceptionnellement
      </button>
    );
  }

  return (
    <div className="mt-1 flex flex-col gap-1">
      <input
        type="text"
        placeholder="Motif obligatoire"
        className="rounded border border-gray-300 px-2 py-1 text-xs"
        value={motif}
        onChange={(e) => setMotif(e.target.value)}
      />
      <div className="flex gap-2">
        <button onClick={confirmer} disabled={!motif.trim() || enCours} className="rounded bg-amber-700 px-2 py-1 text-xs text-white disabled:bg-gray-300">
          Confirmer
        </button>
        <button onClick={() => setOuvert(false)} className="rounded border border-gray-300 px-2 py-1 text-xs">
          Annuler
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyntheseValidationRow({
  syntheseId,
  sectionNom,
  contenuFinal,
  valideDD,
}: {
  syntheseId: string;
  sectionNom: string;
  contenuFinal: string | null;
  valideDD: boolean;
}) {
  const [enCours, setEnCours] = useState(false);
  const router = useRouter();

  async function valider(valide: boolean) {
    setEnCours(true);
    try {
      const res = await fetch("/api/syntheses/valider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syntheseId, valide }),
      });
      if (res.ok) router.refresh();
    } finally {
      setEnCours(false);
    }
  }

  return (
    <tr>
      <td className="border-b px-3 py-2 font-medium">{sectionNom}</td>
      <td className="border-b px-3 py-2 max-w-md whitespace-pre-wrap text-sm text-gray-600">{contenuFinal || <em>Non rédigée</em>}</td>
      <td className="border-b px-3 py-2">
        {valideDD ? (
          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">Validée</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">En attente</span>
        )}
      </td>
      <td className="border-b px-3 py-2">
        {!valideDD && contenuFinal && (
          <button onClick={() => valider(true)} disabled={enCours} className="rounded bg-green-700 px-2 py-1 text-xs text-white disabled:bg-gray-300">
            Valider
          </button>
        )}
        {valideDD && (
          <button onClick={() => valider(false)} disabled={enCours} className="rounded border border-gray-300 px-2 py-1 text-xs">
            Renvoyer pour correction
          </button>
        )}
      </td>
    </tr>
  );
}

"use client";

/**
 * AideButton.tsx — bouton « Aide » présent sur toute page, contextuel : s'il
 * est ouvert depuis un tableau de saisie précis, la FAQ affichée et la
 * question posée parlent de CE tableau (pas de tout le système). Combine une
 * FAQ pré-écrite (lib/faq.ts) et un formulaire pour poser une question qui
 * garde le contexte exact (page + tableau), consultable par le DD/ADMIN_TECH.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, X } from "lucide-react";
import { offlineDB } from "@/lib/dexie";
import { faqPertinente } from "@/lib/faq";

export default function AideButton({ role }: { role: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [tableau, setTableau] = useState<{ code: string; numero: string; titre: string; type: string } | null>(null);
  const [message, setMessage] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const pathname = usePathname();

  const matchTableau = pathname?.match(/^\/da\/saisie\/([A-Z0-9_]+)$/);
  const codeTableau = matchTableau?.[1];

  useEffect(() => {
    if (!codeTableau) {
      setTableau(null);
      return;
    }
    offlineDB.tableaux.get(codeTableau).then((t) => setTableau(t ? { code: t.code, numero: t.numero, titre: t.titre, type: t.type } : null));
  }, [codeTableau]);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setEnvoi(true);
    try {
      await fetch("/api/aide/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page: pathname, tableauCode: tableau?.code ?? null, message: message.trim() }),
      });
      setConfirmation("Question envoyée. Le Délégué Départemental ou l'administrateur technique pourra vous répondre.");
      setMessage("");
    } catch {
      setConfirmation("Échec de l'envoi (hors ligne ?) — réessayez en ligne.");
    } finally {
      setEnvoi(false);
    }
  }

  const faq = faqPertinente(role, tableau?.type ?? null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        title="Aide"
        className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10"
      >
        <HelpCircle size={17} />
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-[210] flex items-center justify-end bg-black/30 p-4" onClick={() => setOuvert(false)}>
          <div
            className="flex h-full w-full max-w-sm flex-col rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">Aide</p>
                {tableau && (
                  <p className="text-xs text-gray-500">
                    Vous êtes sur : {tableau.numero} {tableau.titre}
                  </p>
                )}
              </div>
              <button onClick={() => setOuvert(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Questions fréquentes</p>
              <div className="space-y-3">
                {faq.map((q, i) => (
                  <details key={i} className="rounded-md border border-gray-200 p-2">
                    <summary className="cursor-pointer text-sm font-medium text-gray-800">{q.question}</summary>
                    <p className="mt-1 text-sm text-gray-600">{q.reponse}</p>
                  </details>
                ))}
              </div>
            </div>

            <form onSubmit={envoyer} className="border-t border-gray-200 px-4 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Vous ne trouvez pas la réponse ? Posez votre question
              </p>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder={tableau ? `Votre question à propos de ${tableau.numero} ${tableau.titre}…` : "Votre question…"}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={envoi || !message.trim()}
                className="mt-2 w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-60"
              >
                {envoi ? "Envoi…" : "Envoyer la question"}
              </button>
              {confirmation && <p className="mt-2 text-xs text-green-700">{confirmation}</p>}
            </form>
          </div>
        </div>
      )}
    </>
  );
}

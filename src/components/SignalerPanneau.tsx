"use client";

/**
 * Le panneau « Signaler » : ce qui ne va pas sur une donnée précise, envoyé à
 * celui qui doit corriger (server/observations*.ts). Il s'ouvre À L'ÉCRAN, à
 * côté de ce qu'on signale : sur téléphone, un panneau resté en bas de page
 * n'était pas vu.
 */
import { useEffect, useRef, useState } from "react";

export default function SignalerPanneau({
  titre,
  valeur,
  destinataire,
  exemple,
  onEnvoyer,
  onFermer,
  entete,
  bouton = "Envoyer l'observation",
}: {
  /** Le titre du panneau, s'il n'est pas « Signaler à … » (le rejet au DA, en relecture). */
  entete?: string;
  bouton?: string;
  /** Ce qu'on signale : « Dschang · Vache », « Rubrique « Perspectives » ». */
  titre: string;
  valeur?: string | null;
  /** « l'arrondissement de Dschang », « le chef PSA ». */
  destinataire: string;
  exemple?: string;
  /** Rend un message d'erreur, ou null si c'est parti. */
  onEnvoyer: (texte: string) => Promise<string | null>;
  onFermer: () => void;
}) {
  const [texte, setTexte] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  }, [titre]);

  const envoyer = async () => {
    setEnCours(true);
    setErreur(null);
    const e = await onEnvoyer(texte.trim());
    setEnCours(false);
    if (e) setErreur(e);
  };

  return (
    <div ref={ref} data-visite="panneau-signaler" className="my-3 scroll-mt-4 rounded-lg border-2 border-amber-500 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{entete ?? `Signaler à ${destinataire}`}</p>
      <p className="mt-0.5 font-semibold text-gray-900">{titre}</p>
      {valeur != null && <p className="text-sm text-gray-700">Valeur actuelle : <strong>{valeur || "vide"}</strong></p>}
      <label className="mt-2 block text-sm font-medium text-gray-800">Ce qui ne va pas (il le lira, avec un lien direct)</label>
      <textarea
        rows={3}
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        placeholder={exemple ?? "Ex. : ce chiffre paraît trop élevé par rapport au trimestre précédent."}
        className="mt-1 w-full rounded border border-gray-300 p-2 text-sm"
      />
      <p className="mt-1 text-xs text-gray-600">
        Il corrige, ou répond que c&apos;est juste ; vous verrez sa réponse dans « À corriger ». S&apos;il avait déjà transmis
        (ou validé), la main lui est rendue.
      </p>
      {erreur && <p className="mt-1 text-sm text-red-700">{erreur}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => void envoyer()}
          disabled={!texte.trim() || enCours}
          className="min-h-[44px] rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-gray-300"
        >
          {enCours ? "Envoi…" : bouton}
        </button>
        <button type="button" onClick={onFermer} className="min-h-[44px] rounded-md border border-gray-300 px-3 py-2 text-sm">
          Annuler
        </button>
      </div>
    </div>
  );
}

/** Envoie une observation à /api/observations ; rend un message d'erreur, ou null. */
export async function envoyerObservation(corps: Record<string, unknown>): Promise<{ erreur: string | null; donnees: Record<string, unknown> }> {
  try {
    const r = await fetch("/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { erreur: r.ok ? null : String(d.message ?? "L'observation n'a pas pu partir."), donnees: d };
  } catch {
    return { erreur: "Pas de réseau : réessayez une fois connecté.", donnees: {} };
  }
}

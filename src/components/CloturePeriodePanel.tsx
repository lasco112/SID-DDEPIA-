"use client";

/**
 * Clôture, gel et réouverture d'une période (CDC §13), et historique des
 * opérations du mois (§14).
 *
 * Après clôture les données sont figées : plus de saisie, de correction, de
 * validation ni de soumission. Consultation et téléchargement restent ouverts.
 * La réouverture est possible, mais exige un motif — un mois administrativement
 * clos ne se rouvre pas sans justification.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Evenement {
  id: string;
  date: string;
  libelle: string;
  auteur: string;
  role: string | null;
  details: Record<string, unknown> | null;
}

export default function CloturePeriodePanel({
  periodeId,
  cloturee,
  clotureeLe,
  clotureePar,
  motifReouverture,
  reouverteLe,
}: {
  periodeId: string;
  cloturee: boolean;
  clotureeLe: string | null;
  clotureePar: string | null;
  motifReouverture: string | null;
  reouverteLe: string | null;
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [motif, setMotif] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [evenements, setEvenements] = useState<Evenement[] | null>(null);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);

  async function appeler(chemin: string, corps: Record<string, unknown>) {
    setEnCours(true);
    setMessage(null);
    const res = await fetch(chemin, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    const data = await res.json().catch(() => ({}));
    setEnCours(false);
    if (!res.ok) {
      const details = [
        ...(data.daManquants?.length ? [`Arrondissements sans rapport transmis : ${data.daManquants.join(", ")}.`] : []),
        ...(data.sectionsNonValidees?.length ? [`Sections non validées : ${data.sectionsNonValidees.join(", ")}.`] : []),
      ].join(" ");
      setMessage([data.message, details].filter(Boolean).join(" "));
      return false;
    }
    router.refresh();
    return true;
  }

  async function cloturer() {
    if (await appeler("/api/dd/periodes/cloturer", { periodeId })) {
      setMessage("Période clôturée. Les données du mois sont désormais figées.");
    }
  }

  async function rouvrir() {
    if (!motif.trim()) return;
    if (await appeler("/api/dd/periodes/rouvrir", { periodeId, motif })) {
      setMessage("Période rouverte. La modification des données est de nouveau possible.");
      setMotif("");
    }
  }

  async function chargerHistorique() {
    setHistoriqueOuvert((v) => !v);
    if (evenements) return;
    const res = await fetch(`/api/dd/periodes/historique?periodeId=${periodeId}`);
    if (res.ok) setEvenements((await res.json()).evenements);
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Clôture de la période</h2>

      <div className={`rounded-lg border p-4 ${cloturee ? "border-gray-300 bg-gray-50" : "border-gray-200 bg-white"}`}>
        {cloturee ? (
          <>
            <p className="text-sm font-semibold text-gray-800">
              Période clôturée
              {clotureeLe && ` le ${new Date(clotureeLe).toLocaleString("fr-FR")}`}
              {clotureePar && ` par ${clotureePar}`}.
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Les données du mois sont figées. Les rapports des arrondissements et le rapport départemental restent
              consultables et téléchargeables.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Motif de la réouverture (obligatoire)"
                className="w-72 max-w-full rounded border border-gray-300 px-2 py-1 text-sm"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
              />
              <button
                onClick={rouvrir}
                disabled={!motif.trim() || enCours}
                className="rounded-lg border border-amber-500 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
              >
                {enCours ? "Réouverture…" : "Rouvrir la période"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-700">
              La clôture fige les données du mois : plus aucune saisie, correction ni validation ne sera possible. Elle
              suppose que le rapport départemental définitif a été généré.
            </p>
            {motifReouverture && (
              <p className="mt-2 text-xs italic text-gray-500">
                Dernière réouverture{reouverteLe && ` le ${new Date(reouverteLe).toLocaleString("fr-FR")}`} — motif :{" "}
                {motifReouverture}
              </p>
            )}
            <button
              onClick={cloturer}
              disabled={enCours}
              className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:bg-gray-300"
            >
              {enCours ? "Clôture…" : "Clôturer la période"}
            </button>
          </>
        )}

        {message && <p className="mt-3 text-sm text-gray-700">{message}</p>}
      </div>

      <button
        onClick={chargerHistorique}
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left"
      >
        <span className="font-semibold text-gray-800">Historique de la période</span>
        <span className="text-gray-400">{historiqueOuvert ? "▲" : "▼"}</span>
      </button>

      {historiqueOuvert && (
        <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          {!evenements ? (
            <p className="p-4 text-sm text-gray-500">Chargement…</p>
          ) : evenements.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">Aucune opération enregistrée pour cette période.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="border-b px-3 py-2">Date</th>
                  <th className="border-b px-3 py-2">Opération</th>
                  <th className="border-b px-3 py-2">Auteur</th>
                  <th className="border-b px-3 py-2">Détail</th>
                </tr>
              </thead>
              <tbody>
                {evenements.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap border-b px-3 py-2 text-gray-600">
                      {new Date(e.date).toLocaleString("fr-FR")}
                    </td>
                    <td className="border-b px-3 py-2">{e.libelle}</td>
                    <td className="whitespace-nowrap border-b px-3 py-2">
                      {e.auteur}
                      {e.role && <span className="ml-1 text-xs text-gray-500">({e.role})</span>}
                    </td>
                    <td className="border-b px-3 py-2 text-xs text-gray-600">
                      {e.details
                        ? Object.entries(e.details)
                            .filter(([, v]) => v !== null && v !== "")
                            .map(([k, v]) => `${k} : ${String(v)}`)
                            .join(" · ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

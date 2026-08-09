"use client";

/**
 * Gestion des périodes mensuelles (CDC §2 et §15.7).
 *
 * Le DD y crée une période — y compris un mois antérieur à la mise en service
 * du SID —, ouvre ou ferme la saisie, et voit d'un coup d'œil l'état de chaque
 * mois. La clôture et la réouverture restent pilotées depuis la Supervision,
 * où le DD dispose du contexte (validations, rapports) pour décider.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Periode {
  id: string;
  mois: number;
  annee: number;
  libelle: string;
  statut: string;
  dateLimiteDA: string;
  clotureeLe: string | null;
  clotureePar: string | null;
  reouverteLe: string | null;
  motifReouverture: string | null;
  rapports: number;
  documents: number;
}

const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

const LIBELLE_STATUT: Record<string, { texte: string; classe: string }> = {
  OUVERTE: { texte: "Saisie ouverte", classe: "bg-green-100 text-green-800" },
  VERROUILLEE_DA: { texte: "Saisie fermée", classe: "bg-amber-100 text-amber-800" },
  VALIDEE_DD: { texte: "En validation", classe: "bg-blue-100 text-blue-800" },
  ARCHIVEE: { texte: "Clôturée", classe: "bg-gray-200 text-gray-700" },
};

export default function GestionPeriodesClient({ couranteId }: { couranteId: string | null }) {
  const router = useRouter();
  const maintenant = new Date();
  const [periodes, setPeriodes] = useState<Periode[] | null>(null);
  const [annee, setAnnee] = useState(maintenant.getFullYear());
  const [mois, setMois] = useState(maintenant.getMonth() + 1);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const res = await fetch("/api/dd/periodes");
    if (res.ok) setPeriodes((await res.json()).periodes);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creer() {
    setEnCours(true);
    setMessage(null);
    const res = await fetch("/api/dd/periodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annee, mois }),
    });
    const data = await res.json().catch(() => ({}));
    setEnCours(false);
    if (!res.ok) {
      setMessage(data.message ?? "La période n'a pas pu être créée.");
      return;
    }
    setMessage(
      data.retroactive
        ? `Période ${MOIS[mois - 1]} ${annee} créée. Son échéance étant passée, elle est ouverte pour une saisie rétroactive : sélectionnez-la dans le bandeau pour y travailler.`
        : `Période ${MOIS[mois - 1]} ${annee} créée et ouverte à la saisie.`
    );
    charger();
    router.refresh();
  }

  async function changerStatut(periodeId: string, statut: string) {
    setEnCours(true);
    setMessage(null);
    const res = await fetch("/api/dd/periodes/statut", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodeId, statut }),
    });
    const data = await res.json().catch(() => ({}));
    setEnCours(false);
    if (!res.ok) {
      setMessage(data.message ?? "Le statut n'a pas pu être modifié.");
      return;
    }
    charger();
    router.refresh();
  }

  function travaillerSur(periodeId: string) {
    document.cookie = `sid_periode=${periodeId}; path=/; max-age=${365 * 24 * 3600}; SameSite=Lax`;
    router.refresh();
    setMessage("Période de travail changée. Toutes les pages affichent désormais ce mois.");
  }

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-primary-dark">Gestion des périodes</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Une période correspond à un mois de rapportage. Vous pouvez créer un mois antérieur à la mise en service du
        système : les données saisies y seront rattachées à ce mois-là, quelle que soit la date réelle de saisie.
      </p>

      <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Créer une période</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Mois</span>
            <select
              value={mois}
              onChange={(e) => setMois(Number(e.target.value))}
              className="rounded border border-gray-300 px-2 py-1.5"
            >
              {MOIS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Année</span>
            <input
              type="number"
              value={annee}
              onChange={(e) => setAnnee(Number(e.target.value))}
              className="w-28 rounded border border-gray-300 px-2 py-1.5"
            />
          </label>
          <button
            onClick={creer}
            disabled={enCours}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:bg-gray-300"
          >
            {enCours ? "Création…" : "Créer la période"}
          </button>
        </div>
        {message && <p className="mt-3 text-sm text-gray-700">{message}</p>}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Périodes existantes</h2>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          {!periodes ? (
            <p className="p-4 text-sm text-gray-500">Chargement…</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="border-b px-3 py-2">Période</th>
                  <th className="border-b px-3 py-2">Statut</th>
                  <th className="border-b px-3 py-2">Contenu</th>
                  <th className="border-b px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {periodes.map((p) => {
                  const st = LIBELLE_STATUT[p.statut] ?? { texte: p.statut, classe: "bg-gray-100 text-gray-600" };
                  const courante = p.id === couranteId;
                  return (
                    <tr key={p.id} className={courante ? "bg-green-50/60" : ""}>
                      <td className="border-b px-3 py-2 font-medium">
                        {p.libelle}
                        {courante && <span className="ml-2 text-xs font-normal text-primary-dark">période de travail</span>}
                        {p.motifReouverture && (
                          <p className="text-xs italic text-gray-500">
                            Rouverte
                            {p.reouverteLe && ` le ${new Date(p.reouverteLe).toLocaleDateString("fr-FR")}`} — {p.motifReouverture}
                          </p>
                        )}
                      </td>
                      <td className="border-b px-3 py-2">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.classe}`}>{st.texte}</span>
                        {p.clotureeLe && (
                          <p className="mt-1 text-xs text-gray-500">
                            {new Date(p.clotureeLe).toLocaleDateString("fr-FR")}
                            {p.clotureePar && ` · ${p.clotureePar}`}
                          </p>
                        )}
                      </td>
                      <td className="border-b px-3 py-2 text-xs text-gray-600">
                        {p.rapports} rapport{p.rapports > 1 ? "s" : ""} · {p.documents} document
                        {p.documents > 1 ? "s" : ""}
                      </td>
                      <td className="border-b px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {!courante && (
                            <button
                              onClick={() => travaillerSur(p.id)}
                              className="rounded border border-primary px-2 py-1 text-xs font-semibold text-primary-dark hover:bg-green-50"
                            >
                              Travailler sur ce mois
                            </button>
                          )}
                          {p.statut === "ARCHIVEE" ? (
                            <span className="text-xs text-gray-500">
                              Clôturée — réouverture depuis la Supervision (motif exigé)
                            </span>
                          ) : p.statut === "VERROUILLEE_DA" ? (
                            <button
                              onClick={() => changerStatut(p.id, "OUVERTE")}
                              disabled={enCours}
                              className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Rouvrir la saisie
                            </button>
                          ) : (
                            <button
                              onClick={() => changerStatut(p.id, "VERROUILLEE_DA")}
                              disabled={enCours}
                              className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Fermer la saisie
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

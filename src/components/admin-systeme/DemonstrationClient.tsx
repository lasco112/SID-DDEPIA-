"use client";

/**
 * La démonstration, vue de l'administration du système : est-elle branchée sur
 * ce serveur, que contient-elle, et la remettre à zéro avant une formation.
 */
import { useCallback, useEffect, useState } from "react";

interface Etat {
  configuree: boolean;
  prete?: boolean;
  message?: string;
  comptes?: { username: string; role: string }[];
  periodes?: { annee: number; mois: number; statut: string }[];
  saisies?: number;
  reinitialiseeLe?: string | null;
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export default function DemonstrationClient() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const charger = useCallback(() => {
    fetch("/api/admin-systeme/demonstration")
      .then((r) => r.json())
      .then(setEtat)
      .catch(() => setEtat({ configuree: false, message: "Lecture impossible." }));
  }, []);
  useEffect(charger, [charger]);

  async function reinitialiser() {
    if (!window.confirm("Remettre la démonstration à zéro ? Tout ce que les participants y ont saisi sera effacé. La production n'est pas touchée.")) return;
    setEnCours(true);
    setMessage(null);
    try {
      const r = await fetch("/api/admin-systeme/demonstration", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Échec.");
      setMessage({ ok: true, texte: `Démonstration remise à zéro : ${j.mois} mois, ${j.saisies} saisies, en ${Math.round(j.duree / 1000)} s.` });
      charger();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : "Échec." });
    } finally {
      setEnCours(false);
    }
  }

  if (!etat) return <p className="text-ink-muted">Chargement…</p>;
  if (!etat.configuree) {
    return (
      <div className="rounded-card border border-amber-200 bg-amber-50 p-5 text-[14px] text-amber-900">
        <p className="font-bold">La base de démonstration n&apos;est pas branchée sur ce serveur.</p>
        <p className="mt-1">
          Il faut lui donner une base distincte de la production (réglage DEMO_DATABASE_URL du serveur), puis l&apos;installer une
          fois. Demandez-le lors d&apos;une prochaine mise à jour.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <p className={`text-[15px] font-bold ${etat.prete ? "text-green-800" : "text-amber-800"}`}>
          {etat.prete ? "La démonstration est prête." : etat.message ?? "La démonstration est branchée mais vide : remettez-la à zéro pour la remplir."}
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
          <div>
            <dt className="text-ink-faint">Mois disponibles</dt>
            <dd className="text-ink">
              {(etat.periodes ?? []).map((p) => `${MOIS[p.mois - 1]}${p.statut === "OUVERTE" ? " (en cours)" : ""}`).join(", ") || "aucun"} {etat.periodes?.[0]?.annee ?? ""}
            </dd>
          </div>
          <div>
            <dt className="text-ink-faint">Saisies</dt>
            <dd className="text-ink">{etat.saisies ?? 0}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Dernière remise à zéro</dt>
            <dd className="text-ink">{etat.reinitialiseeLe ? new Date(etat.reinitialiseeLe).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "jamais depuis cette version"}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Comptes de démonstration</dt>
            <dd className="text-ink">{etat.comptes?.length ?? 0} (mot de passe commun : Demo!2026)</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reinitialiser}
            disabled={enCours}
            className="min-h-[44px] rounded-btn bg-primary px-4 text-[14px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {enCours ? "Remise à zéro…" : "Remettre la démonstration à zéro"}
          </button>
          <a href="/demo" target="_blank" rel="noreferrer" className="flex min-h-[44px] items-center rounded-btn border border-primary px-4 text-[14px] font-semibold text-primary hover:bg-primary-light">
            Ouvrir la page de démonstration
          </a>
        </div>
        {message && <p className={`mt-3 text-[13.5px] font-semibold ${message.ok ? "text-green-800" : "text-red-800"}`}>{message.texte}</p>}
      </div>

      {etat.comptes && etat.comptes.length > 0 && (
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="text-[15px] font-bold text-primary-dark">Comptes pour la formation</h2>
          <p className="mt-1 text-[13px] text-ink-muted">Un compte par rôle : chacun voit exactement ce que verra son homologue réel.</p>
          <ul className="mt-2 grid gap-x-6 text-[13.5px] sm:grid-cols-2">
            {etat.comptes.map((c) => (
              <li key={c.username} className="font-mono text-ink">
                {c.username}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

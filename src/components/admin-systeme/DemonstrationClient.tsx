"use client";

/**
 * La démonstration, vue de l'administration du système : est-elle branchée sur
 * ce serveur, que contient chaque département, et la remettre à zéro avant
 * une formation — en arrière-plan, l'écran suit son avancement.
 */
import { useCallback, useEffect, useState } from "react";

interface Departement {
  code: string;
  nom: string;
  comptes: number;
  saisies: number;
  periodes: { annee: number; mois: number; statut: string }[];
}

interface Etat {
  configuree: boolean;
  prete?: boolean;
  message?: string;
  departements?: Departement[];
  reinitialiseeLe?: string | null;
  reinitialisation?: { enCours: boolean; debut?: string; fin?: string; erreur?: string; resultat?: { departements: number; saisies: number; duree: number } };
}

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const nb = (n: number) => n.toLocaleString("fr-FR");

export default function DemonstrationClient() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  const charger = useCallback(() => {
    fetch("/api/admin-systeme/demonstration")
      .then((r) => r.json())
      .then(setEtat)
      .catch(() => setEtat({ configuree: false, message: "Lecture impossible." }));
  }, []);
  useEffect(charger, [charger]);

  const enCours = Boolean(etat?.reinitialisation?.enCours);
  // Pendant une remise à zéro, l'écran se met à jour seul toutes les 5 secondes.
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(charger, 5000);
    return () => clearInterval(t);
  }, [enCours, charger]);

  async function reinitialiser() {
    if (!window.confirm("Remettre la démonstration à zéro, dans tous les départements ? Tout ce que les participants y ont saisi sera effacé. La production n'est pas touchée.")) return;
    setMessage(null);
    const r = await fetch("/api/admin-systeme/demonstration", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setMessage({ ok: false, texte: j.message ?? "Échec." });
    charger();
  }

  if (!etat) return <p className="text-ink-muted">Chargement…</p>;
  if (!etat.configuree) {
    return (
      <div className="rounded-card border border-amber-200 bg-amber-50 p-5 text-[14px] text-amber-900">
        <p className="font-bold">La démonstration n&apos;est pas encore installée sur le serveur.</p>
        <p className="mt-1">
          Elle s&apos;installe toute seule à la prochaine mise à jour, sur le même serveur, à côté des vraies données et sans
          jamais les toucher. Rien à faire de votre côté.
        </p>
      </div>
    );
  }

  const r = etat.reinitialisation;
  const premier = etat.departements?.find((d) => d.periodes.length) ?? null;
  return (
    <div className="space-y-4">
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <p className={`text-[15px] font-bold ${enCours ? "text-sky-800" : etat.prete ? "text-green-800" : "text-amber-800"}`}>
          {enCours
            ? "Remise à zéro en cours… (une à deux minutes ; cet écran se met à jour seul)"
            : etat.prete
              ? "La démonstration est prête."
              : etat.message ?? "La démonstration est branchée mais vide : remettez-la à zéro pour la remplir."}
        </p>
        {!enCours && r?.erreur && <p className="mt-1 text-[13.5px] font-semibold text-red-800">La dernière remise à zéro a échoué : {r.erreur}</p>}
        {!enCours && r?.resultat && (
          <p className="mt-1 text-[13.5px] text-green-800">
            Dernière remise à zéro : {r.resultat.departements} départements, {nb(r.resultat.saisies)} saisies, en {Math.round(r.resultat.duree / 1000)} s.
          </p>
        )}
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
          <div>
            <dt className="text-ink-faint">Mois disponibles</dt>
            <dd className="text-ink">
              {premier ? `${premier.periodes.map((p) => `${MOIS[p.mois - 1]}${p.statut === "OUVERTE" ? " (en cours)" : ""}`).join(", ")} ${premier.periodes[0].annee}` : "aucun"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-faint">Dernière remise à zéro</dt>
            <dd className="text-ink">{etat.reinitialiseeLe ? new Date(etat.reinitialiseeLe).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "jamais depuis cette version"}</dd>
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

      {etat.departements && etat.departements.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
          <table className="w-full border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-primary-light text-left">
                <th className="px-3 py-2">Département</th>
                <th className="px-3 py-2 text-right">Comptes de démonstration</th>
                <th className="px-3 py-2 text-right">Saisies</th>
              </tr>
            </thead>
            <tbody>
              {etat.departements.map((d) => (
                <tr key={d.code} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold text-ink">{d.nom}</td>
                  <td className="px-3 py-2 text-right text-ink-muted">{d.comptes}</td>
                  <td className="px-3 py-2 text-right text-ink-muted">{nb(d.saisies)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

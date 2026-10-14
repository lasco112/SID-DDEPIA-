"use client";

/**
 * Départements et lancements — l'écran de l'administrateur du système
 * (décisions du Délégué, 14 octobre 2026). Chaque département de l'Ouest y a
 * sa fiche : en service ou préparé, ses arrondissements, ses comptes, ses
 * modèles Word, ce qui manque encore. On y imprime les fiches d'identifiants
 * et on y allume un département le jour de son lancement.
 */
import { useCallback, useEffect, useState } from "react";

interface Etat {
  id: string;
  code: string;
  nom: string;
  nomAvecArticle: string;
  actif: boolean;
  estLeMien: boolean;
  arrondissements: string[];
  comptes: { total: number; actifs: number; jamaisConnectes: number; parRole: Record<string, number> };
  derniereConnexion: string | null;
  modelesManquants: string[];
  dernierePurge: string | null;
  manques: string[];
}

const ROLES: [string, string][] = [
  ["DD", "DD"],
  ["DA", "DA"],
  ["AGENT_SAISIE", "agents"],
  ["CHEF_BAC", "BAC"],
  ["CHEF_PSA", "PSA"],
  ["CHEF_SSV", "SSV"],
  ["CHEF_SPAIH", "SPAIH"],
];

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "jamais";

function Fiche({ d, recharger }: { d: Etat; recharger: () => void }) {
  const [confirmer, setConfirmer] = useState<"allumer" | "eteindre" | null>(null);
  const [nom, setNom] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  async function basculer(actif: boolean) {
    setEnCours(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/admin-systeme/departements/${d.id}/etat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actif, confirmation: nom }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Échec.");
      setConfirmer(null);
      setNom("");
      recharger();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : "Échec." });
    } finally {
      setEnCours(false);
    }
  }

  async function fiches() {
    const n = d.comptes.jamaisConnectes;
    if (n === 0) {
      setMessage({ ok: false, texte: "Tous les comptes de ce département se sont déjà connectés : il n'y a pas de fiche à remettre." });
      return;
    }
    const ok = window.confirm(
      `${n} compte(s) qui ne se sont jamais connectés vont recevoir un NOUVEAU mot de passe provisoire.\n\n` +
        "Les fiches imprimées avant ne vaudront plus. Continuer ?"
    );
    if (!ok) return;
    setEnCours(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/admin-systeme/departements/${d.id}/identifiants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? "Échec.");
      const lien = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = lien;
      a.download = `identifiants-${d.code.toLowerCase()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(lien), 10_000);
      setMessage({ ok: true, texte: "Fiches téléchargées : à imprimer et à remettre en main propre. Les mots de passe ne sont gardés nulle part ailleurs." });
      recharger();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : "Échec." });
    } finally {
      setEnCours(false);
    }
  }

  const pret = d.manques.length === 0;
  return (
    <div className={`rounded-card border bg-surface p-5 shadow-card ${d.actif ? "border-green-200" : "border-line"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary-dark">Département {d.nomAvecArticle}</h2>
          <p className="text-[13px] text-ink-muted">
            {d.arrondissements.length} arrondissement{d.arrondissements.length > 1 ? "s" : ""} : {d.arrondissements.join(", ") || "aucun"}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[12.5px] font-bold ${
            d.actif ? "bg-green-100 text-green-800" : pret ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-900"
          }`}
        >
          {d.actif ? "En service" : pret ? "Prêt, pas encore lancé" : "En préparation"}
        </span>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-2">
        <div>
          <dt className="text-ink-faint">Comptes</dt>
          <dd className="text-ink">
            {d.comptes.total} ({ROLES.filter(([r]) => d.comptes.parRole[r]).map(([r, l]) => `${d.comptes.parRole[r]} ${l}`).join(", ") || "aucun"})
          </dd>
        </div>
        <div>
          <dt className="text-ink-faint">Jamais connectés</dt>
          <dd className="text-ink">{d.comptes.jamaisConnectes}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Dernière connexion</dt>
          <dd className="text-ink">{date(d.derniereConnexion)}</dd>
        </div>
        <div>
          <dt className="text-ink-faint">Modèles Word du mensuel</dt>
          <dd className={d.modelesManquants.length ? "font-semibold text-amber-800" : "text-ink"}>
            {d.modelesManquants.length ? `manquants (${d.modelesManquants.length})` : "présents"}
          </dd>
        </div>
      </dl>

      {!pret && !d.actif && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Avant le lancement, il manque : {d.manques.join(", ")}.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={fiches}
          disabled={enCours}
          className="min-h-[42px] rounded-btn border border-primary px-4 text-[14px] font-semibold text-primary hover:bg-primary-light disabled:opacity-50"
        >
          Fiches d&apos;identifiants (PDF)
        </button>
        {!d.actif && (
          <button
            type="button"
            onClick={() => setConfirmer("allumer")}
            disabled={enCours || !pret}
            title={pret ? undefined : "Le département n'est pas prêt."}
            className="min-h-[42px] rounded-btn bg-primary px-4 text-[14px] font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Lancer le département
          </button>
        )}
        {d.actif && !d.estLeMien && (
          <button
            type="button"
            onClick={() => setConfirmer("eteindre")}
            disabled={enCours}
            className="min-h-[42px] rounded-btn border border-red-300 px-4 text-[14px] font-semibold text-red-700 hover:bg-red-50"
          >
            Éteindre
          </button>
        )}
      </div>

      {confirmer && (
        <div className={`mt-3 rounded-md border p-3 ${confirmer === "allumer" ? "border-primary/30 bg-primary-light" : "border-red-200 bg-red-50"}`}>
          <p className="text-[13.5px] text-ink">
            {confirmer === "allumer"
              ? `Tous les comptes ${d.nomAvecArticle} pourront se connecter dès maintenant.`
              : `Plus aucun compte ${d.nomAvecArticle} ne pourra se connecter. Leurs données sont conservées.`}{" "}
            Pour confirmer, tapez <strong>{d.nom}</strong>.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="min-h-[42px] w-full max-w-[220px] rounded-input border border-line px-3 text-[14px]"
              aria-label="Nom du département"
            />
            <button
              type="button"
              onClick={() => basculer(confirmer === "allumer")}
              disabled={enCours || nom.trim().toLowerCase() !== d.nom.toLowerCase()}
              className={`min-h-[42px] rounded-btn px-4 text-[14px] font-semibold text-white disabled:opacity-50 ${confirmer === "allumer" ? "bg-primary" : "bg-red-700"}`}
            >
              {confirmer === "allumer" ? "Confirmer le lancement" : "Confirmer l'extinction"}
            </button>
            <button type="button" onClick={() => { setConfirmer(null); setNom(""); }} className="min-h-[42px] rounded-btn border border-line px-4 text-[14px] text-ink-muted">
              Annuler
            </button>
          </div>
        </div>
      )}

      {message && <p className={`mt-3 text-[13.5px] font-semibold ${message.ok ? "text-green-800" : "text-red-800"}`}>{message.texte}</p>}
    </div>
  );
}

export default function DepartementsClient() {
  const [departements, setDepartements] = useState<Etat[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    fetch("/api/admin-systeme/departements")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message ?? "Échec du chargement.");
        setDepartements(j.departements);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : "Échec du chargement."));
  }, []);

  useEffect(charger, [charger]);

  if (erreur) return <p className="rounded-md bg-red-50 p-4 text-red-800">{erreur}</p>;
  if (!departements) return <p className="text-ink-muted">Chargement des départements…</p>;

  const enService = departements.filter((d) => d.actif).length;
  return (
    <div>
      <p className="mb-4 text-[14px] text-ink-muted">
        {enService} département{enService > 1 ? "s" : ""} en service sur {departements.length}.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {departements.map((d) => (
          <Fiche key={d.id} d={d} recharger={charger} />
        ))}
      </div>
    </div>
  );
}

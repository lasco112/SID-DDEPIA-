"use client";

/**
 * Purger des données d'essai — rangé dans l'administration du système, loin
 * des écrans de tous les jours (décision du Délégué, 14 octobre 2026 : « je
 * peux le faire par erreur »).
 *
 * On choisit d'abord LE département ; on voit ce qui serait supprimé ; on
 * confirme en tapant son nom — et, s'il est en service, une seconde phrase :
 * ses données sont alors réelles.
 */
import { useEffect, useState } from "react";
import { PHRASE_EN_SERVICE } from "@/lib/administrationSysteme";

interface Departement {
  id: string;
  nom: string;
  nomAvecArticle: string;
  actif: boolean;
}

interface Comptage {
  saisies: number;
  rapports: number;
  validations: number;
  syntheses: number;
  corrections: number;
  exports: number;
  notifications: number;
  trimestre: number;
}

interface Demo {
  total: number;
  saisiesLiees: number;
  etablissements: { id: string; nom: string; arrondissement: string }[];
}

export default function DonneesEssaiClient() {
  const [departements, setDepartements] = useState<Departement[]>([]);
  const [choisi, setChoisi] = useState("");
  const [comptage, setComptage] = useState<Comptage | null>(null);
  const [demo, setDemo] = useState<Demo | null>(null);
  const [nom, setNom] = useState("");
  const [phrase, setPhrase] = useState("");
  const [nomDemo, setNomDemo] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin-systeme/departements")
      .then((r) => r.json())
      .then((j) => setDepartements(j.departements ?? []))
      .catch(() => setDepartements([]));
  }, []);

  const dep = departements.find((d) => d.id === choisi);

  function charger(id: string) {
    setComptage(null);
    setDemo(null);
    if (!id) return;
    fetch(`/api/admin-systeme/donnees-essai?departementId=${encodeURIComponent(id)}`).then((r) => r.json()).then(setComptage).catch(() => {});
    fetch(`/api/admin-systeme/etablissements-demo?departementId=${encodeURIComponent(id)}`).then((r) => r.json()).then(setDemo).catch(() => {});
  }

  useEffect(() => {
    setNom("");
    setPhrase("");
    setNomDemo("");
    setMessage(null);
    charger(choisi);
  }, [choisi]);

  async function envoyer(url: string, body: Record<string, unknown>, reussite: string) {
    if (!window.confirm(`Suppression DÉFINITIVE pour le département ${dep?.nomAvecArticle}. Continuer ?`)) return;
    setEnCours(true);
    setMessage(null);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ departementId: choisi, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Échec.");
      setMessage({ ok: true, texte: reussite });
      setNom("");
      setPhrase("");
      setNomDemo("");
      charger(choisi);
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : "Échec." });
    } finally {
      setEnCours(false);
    }
  }

  const nomJuste = (s: string) => !!dep && s.trim().toLowerCase() === dep.nom.toLowerCase();
  const total = comptage ? comptage.saisies + comptage.rapports + comptage.validations + comptage.syntheses + comptage.corrections + comptage.exports + comptage.notifications + comptage.trimestre : 0;

  return (
    <div className="space-y-5">
      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <label className="mb-1.5 block text-[13px] font-semibold text-ink" htmlFor="dep-essai">
          Département concerné
        </label>
        <select
          id="dep-essai"
          value={choisi}
          onChange={(e) => setChoisi(e.target.value)}
          className="min-h-[44px] w-full max-w-sm rounded-input border border-line px-3 text-[14.5px]"
        >
          <option value="">— Choisir un département —</option>
          {departements.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nom}
              {d.actif ? " (en service)" : " (pas encore lancé)"}
            </option>
          ))}
        </select>
        {dep?.actif && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[13.5px] font-semibold text-red-800">
            Ce département est en service : ses données sont réelles. Une purge les effacerait pour de bon.
          </p>
        )}
      </div>

      {dep && comptage && (
        <div className="rounded-card border border-red-200 bg-red-50 p-5">
          <h2 className="text-[15px] font-bold text-red-900">Données d&apos;essai {dep.nomAvecArticle}</h2>
          <p className="mt-1 text-[13px] text-red-800">
            Saisies du mois et du trimestre, rapports, validations, synthèses, corrections, documents produits, notifications. Les
            comptes, arrondissements, établissements, tableaux et listes ne sont jamais touchés. Seuls les téléphones de ce
            département vident leurs brouillons.
          </p>
          <ul className="mt-3 grid gap-x-6 rounded-md bg-white p-3 text-[13px] text-gray-700 sm:grid-cols-2">
            <li>{comptage.saisies} saisie(s) du mois</li>
            <li>{comptage.trimestre} élément(s) du trimestre</li>
            <li>{comptage.rapports} rapport(s) d&apos;arrondissement</li>
            <li>{comptage.validations} validation(s) de section</li>
            <li>{comptage.syntheses} synthèse(s)</li>
            <li>{comptage.corrections} correction(s)</li>
            <li>{comptage.exports} document(s) produits</li>
            <li>{comptage.notifications} notification(s)</li>
          </ul>
          {total === 0 ? (
            <p className="mt-3 text-[13.5px] font-semibold text-green-800">Rien à purger.</p>
          ) : (
            <div className="mt-3 space-y-2">
              <label className="block text-[13px] font-semibold text-red-900">
                Tapez le nom du département ({dep.nom})
                <input value={nom} onChange={(e) => setNom(e.target.value)} className="mt-1 block min-h-[42px] w-full max-w-xs rounded-input border border-red-300 px-3 text-[14px] font-normal" />
              </label>
              {dep.actif && (
                <label className="block text-[13px] font-semibold text-red-900">
                  Puis tapez « {PHRASE_EN_SERVICE} »
                  <input value={phrase} onChange={(e) => setPhrase(e.target.value)} className="mt-1 block min-h-[42px] w-full max-w-md rounded-input border border-red-300 px-3 text-[14px] font-normal" />
                </label>
              )}
              <button
                type="button"
                disabled={enCours || !nomJuste(nom) || (dep.actif && phrase !== PHRASE_EN_SERVICE)}
                onClick={() => envoyer("/api/admin-systeme/donnees-essai", { confirmation: nom, enService: phrase }, "Données d'essai supprimées.")}
                className="min-h-[44px] rounded-btn bg-red-700 px-4 text-[14px] font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {enCours ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          )}
        </div>
      )}

      {dep && demo && (
        <div className="rounded-card border border-line bg-surface p-5 shadow-card">
          <h2 className="text-[15px] font-bold text-primary-dark">Établissements de démonstration {dep.nomAvecArticle}</h2>
          <p className="mt-1 text-[13px] text-ink-muted">
            Les établissements dont le nom porte « DÉMO », avec leurs saisies ({demo.total} établissement(s), {demo.saisiesLiees} saisie(s)).
          </p>
          {demo.total > 0 && (
            <>
              <ul className="mt-2 max-h-40 overflow-y-auto rounded-md bg-appbg p-2 text-[12.5px] text-ink-muted">
                {demo.etablissements.map((e) => (
                  <li key={e.id}>
                    {e.nom} — {e.arrondissement}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="block text-[13px] font-semibold text-ink">
                  Tapez le nom du département ({dep.nom})
                  <input value={nomDemo} onChange={(e) => setNomDemo(e.target.value)} className="mt-1 block min-h-[42px] w-full max-w-xs rounded-input border border-line px-3 text-[14px] font-normal" />
                </label>
                <button
                  type="button"
                  disabled={enCours || !nomJuste(nomDemo)}
                  onClick={() => envoyer("/api/admin-systeme/etablissements-demo", { confirmation: nomDemo }, "Établissements de démonstration retirés.")}
                  className="min-h-[42px] rounded-btn border border-red-300 px-4 text-[14px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Retirer ces établissements
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {message && <p className={`text-[14px] font-semibold ${message.ok ? "text-green-800" : "text-red-800"}`}>{message.texte}</p>}
    </div>
  );
}

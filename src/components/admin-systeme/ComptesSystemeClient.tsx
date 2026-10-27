"use client";

/**
 * Comptes et mots de passe — l'administrateur du système choisit un
 * département, retrouve un compte et lui remet le mot de passe provisoire du
 * département ; ou le remet à tous les comptes actifs du département, après
 * avoir tapé REINITIALISER (demande du Délégué, 27 octobre 2026).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

interface Departement {
  id: string;
  nomAvecArticle: string;
  actif: boolean;
  estLeMien: boolean;
}

interface Compte {
  id: string;
  nom: string;
  username: string;
  fonction: string;
  actif: boolean;
  jamaisConnecte: boolean;
  doitChanger: boolean;
  derniereConnexion: string | null;
  estMoi: boolean;
}

interface Liste {
  departement: { id: string; nomAvecArticle: string; actif: boolean };
  motDePasse: string;
  comptes: Compte[];
}

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

function Etat({ c }: { c: Compte }) {
  const pastille = (texte: string, classe: string) => <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${classe}`}>{texte}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {c.estMoi && pastille("Votre compte", "bg-primary-light text-primary-dark")}
      {!c.actif && pastille("Désactivé", "bg-gray-200 text-gray-700")}
      {c.actif && c.jamaisConnecte && pastille("Jamais connecté", "bg-sky-100 text-sky-800")}
      {c.actif && !c.jamaisConnecte && c.doitChanger && pastille("Mot de passe provisoire", "bg-amber-100 text-amber-900")}
      {c.actif && !c.jamaisConnecte && !c.doitChanger && pastille(`Connecté le ${date(c.derniereConnexion)}`, "bg-green-100 text-green-800")}
    </span>
  );
}

export default function ComptesSystemeClient() {
  const [departements, setDepartements] = useState<Departement[] | null>(null);
  const [choisi, setChoisi] = useState<string>("");
  const [liste, setListe] = useState<Liste | null>(null);
  const [recherche, setRecherche] = useState("");
  const [aConfirmer, setAConfirmer] = useState<Compte | null>(null);
  const [tousOuvert, setTousOuvert] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin-systeme/departements")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message ?? "Échec du chargement.");
        const ds: Departement[] = j.departements;
        setDepartements(ds);
        setChoisi((ds.find((d) => d.actif && !d.estLeMien) ?? ds[0])?.id ?? "");
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : "Échec du chargement."));
  }, []);

  const charger = useCallback(() => {
    if (!choisi) return;
    setListe(null);
    fetch(`/api/admin-systeme/departements/${choisi}/comptes`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message ?? "Échec du chargement.");
        setListe(j);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : "Échec du chargement."));
  }, [choisi]);

  useEffect(charger, [charger]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!liste) return [];
    return q ? liste.comptes.filter((c) => `${c.nom} ${c.username} ${c.fonction}`.toLowerCase().includes(q)) : liste.comptes;
  }, [liste, recherche]);

  async function reinitialiser(corps: Record<string, unknown>) {
    setEnCours(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/admin-systeme/departements/${choisi}/comptes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.message ?? "Échec de la réinitialisation.");
      const n = (j.comptes as string[]).length;
      const fermes = (j.desactives as string[] | undefined) ?? [];
      setMessage({
        ok: fermes.length === 0,
        texte:
          (n === 1
            ? `${j.comptes[0]} : mot de passe remis à « ${j.motDePasse} ». La personne le changera à sa prochaine connexion.`
            : `${n} comptes remis au mot de passe « ${j.motDePasse} ». Chacun le changera à sa prochaine connexion.`) +
          (fermes.length
            ? ` Attention : ${fermes.join(", ")} ${fermes.length > 1 ? "restent désactivés et ne peuvent" : "reste désactivé et ne peut"} pas encore se connecter. Pour l'ouvrir : Départements et lancements → « Fiches d'identifiants ».`
            : ""),
      });
      setAConfirmer(null);
      setTousOuvert(false);
      setSaisie("");
      charger();
    } catch (e) {
      setMessage({ ok: false, texte: e instanceof Error ? e.message : "Échec." });
    } finally {
      setEnCours(false);
    }
  }

  if (erreur) return <p className="rounded-md bg-red-50 p-4 text-red-800">{erreur}</p>;
  if (!departements) return <p className="text-ink-muted">Chargement des départements…</p>;

  const actifs = liste ? liste.comptes.filter((c) => c.actif && !c.estMoi).length : 0;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-ink-muted">Département</span>
          <select
            value={choisi}
            onChange={(e) => {
              setChoisi(e.target.value);
              setMessage(null);
              setAConfirmer(null);
              setTousOuvert(false);
            }}
            className="min-h-[44px] rounded-input border border-line bg-white px-3 text-[14.5px]"
          >
            {departements.map((d) => (
              <option key={d.id} value={d.id}>
                Département {d.nomAvecArticle}
                {d.actif ? "" : " (pas encore lancé)"}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[240px] flex-1">
          <span className="mb-1 block text-[13px] font-semibold text-ink-muted">Rechercher</span>
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="un nom, un identifiant, une fonction"
            className="min-h-[44px] w-full rounded-input border border-line px-3 text-[14.5px]"
          />
        </label>
      </div>

      {liste && (
        <p className="mt-3 text-[14px] text-ink-muted">
          Mot de passe provisoire du département {liste.departement.nomAvecArticle} :{" "}
          <strong className="font-mono text-primary-dark">{liste.motDePasse}</strong>
          {!liste.departement.actif && " — département pas encore lancé : ses comptes ne peuvent pas encore se connecter."}
        </p>
      )}

      {message && (
        <p className={`mt-3 rounded-md px-3 py-2 text-[14px] font-semibold ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{message.texte}</p>
      )}

      {!liste ? (
        <p className="mt-4 text-ink-muted">Chargement des comptes…</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-card border border-line bg-surface shadow-card">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead className="bg-primary-light text-[13px] text-primary-dark">
              <tr>
                <th className="px-3 py-2">Fonction</th>
                <th className="px-3 py-2">Nom</th>
                <th className="px-3 py-2">Identifiant</th>
                <th className="px-3 py-2">État</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.id} className="border-t border-line align-top">
                  <td className="px-3 py-2">{c.fonction}</td>
                  <td className="px-3 py-2">{c.nom}</td>
                  <td className="px-3 py-2 font-mono">{c.username}</td>
                  <td className="px-3 py-2">
                    <Etat c={c} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {c.estMoi ? null : aConfirmer?.id === c.id ? (
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        <span className="text-[13px] text-ink">
                          Remettre « <strong className="font-mono">{liste.motDePasse}</strong> » ?
                        </span>
                        <button
                          type="button"
                          onClick={() => reinitialiser({ ids: [c.id] })}
                          disabled={enCours}
                          className="min-h-[38px] rounded-btn bg-primary px-3 text-[13.5px] font-semibold text-white disabled:opacity-50"
                        >
                          Confirmer
                        </button>
                        <button type="button" onClick={() => setAConfirmer(null)} className="min-h-[38px] rounded-btn border border-line px-3 text-[13.5px] text-ink-muted">
                          Annuler
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAConfirmer(c);
                          setMessage(null);
                        }}
                        className="min-h-[38px] rounded-btn border border-primary px-3 text-[13.5px] font-semibold text-primary hover:bg-primary-light"
                      >
                        Réinitialiser
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-ink-muted">
                    Aucun compte ne correspond.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {liste && actifs > 0 && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Tous les comptes du département {liste.departement.nomAvecArticle}</p>
          <p className="mt-1 text-[13px] text-amber-800">
            Remet « {liste.motDePasse} » sur les {actifs} compte(s) actif(s){liste.comptes.some((c) => c.estMoi) ? " (sauf le vôtre)" : ""} ;
            chacun devra le changer à sa prochaine connexion. Les mots de passe choisis par chacun seront perdus.
          </p>
          {!tousOuvert ? (
            <button
              type="button"
              onClick={() => setTousOuvert(true)}
              className="mt-3 min-h-[42px] rounded-btn border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-800 hover:bg-amber-100"
            >
              Réinitialiser tous les comptes {liste.departement.nomAvecArticle}
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-amber-900">Tapez REINITIALISER pour confirmer</span>
                <input value={saisie} onChange={(e) => setSaisie(e.target.value)} className="min-h-[42px] w-full max-w-xs rounded-input border border-amber-300 px-3 text-sm" />
              </label>
              <button
                type="button"
                onClick={() => reinitialiser({ tous: true, confirmation: saisie })}
                disabled={saisie !== "REINITIALISER" || enCours}
                className="min-h-[42px] rounded-btn bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {enCours ? "Réinitialisation…" : "Confirmer pour tous les comptes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTousOuvert(false);
                  setSaisie("");
                }}
                className="min-h-[42px] rounded-btn border border-gray-300 px-4 text-sm font-semibold text-gray-700"
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

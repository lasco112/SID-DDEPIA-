"use client";

/**
 * Le circuit de validation du rapport trimestriel, vu par chacun.
 *
 *   agent de saisie → prépare ;  DA → relit et transmet ;
 *   chef de section → valide son domaine ;  DD → relit et produit le définitif.
 *
 * Même écran pour tous : chacun voit où en est le trimestre, et seuls les
 * boutons de SON étape sont actifs.
 */

import { useCallback, useEffect, useState } from "react";
import { trimestreARapporter } from "@/lib/trimestreEchu";
import { lireAvecCopie } from "@/lib/trimestreHorsLigne";
import HorsLigneTrimestre from "@/components/HorsLigneTrimestre";

interface Arrondissement {
  id: string;
  nom: string;
  statut: "EN_PREPARATION" | "TRANSMIS" | "RENVOYE";
  date: string | null;
  auteur: string | null;
  motif: string | null;
  parLeDD: boolean;
}

interface Section {
  code: string;
  chef: string;
  nom: string;
  statut: "EN_ATTENTE" | "A_VALIDER" | "VALIDE";
  date: string | null;
  auteur: string | null;
  parLeDD: boolean;
  motif: string | null;
}

interface Etat {
  periode: string;
  role: string;
  arrondissements: Arrondissement[];
  sections: Section[];
  tousTransmis: boolean;
  complet: boolean;
  peut: { transmettre: boolean; renvoyer: boolean; valider: boolean; annulerSection: string | null; relaisDD: boolean };
}

const BADGE_ARR: Record<Arrondissement["statut"], { texte: string; classe: string }> = {
  EN_PREPARATION: { texte: "En préparation", classe: "bg-amber-100 text-amber-900" },
  TRANSMIS: { texte: "Transmis au DD", classe: "bg-green-100 text-green-800" },
  RENVOYE: { texte: "Renvoyé pour correction", classe: "bg-red-100 text-red-800" },
};
const BADGE_SECTION: Record<Section["statut"], { texte: string; classe: string }> = {
  EN_ATTENTE: { texte: "En attente des arrondissements", classe: "bg-gray-100 text-gray-700" },
  A_VALIDER: { texte: "À valider", classe: "bg-amber-100 text-amber-900" },
  VALIDE: { texte: "Validé", classe: "bg-green-100 text-green-800" },
};

const ETAPES = [
  ["Agent de saisie", "prépare le rapport de son arrondissement : saisie trimestrielle, analyses, textes."],
  ["Délégué d'arrondissement", "relit l'ensemble, corrige s'il le juge utile, puis transmet au DD."],
  ["Chef de section", "une fois les six arrondissements transmis, relit et valide son domaine du rapport départemental."],
  ["Délégué départemental", "relit le document final et produit la version définitive."],
];

const le = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");

export default function CircuitTrimestreClient({ username }: { username: string }) {
  const [{ annee, trimestre }, setPeriode] = useState(() => trimestreARapporter());
  const [etat, setEtat] = useState<Etat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [renvoi, setRenvoi] = useState<{ id: string; motif: string } | null>(null);
  /** Le DD prend le relais : quelle étape, et pourquoi. */
  const [relais, setRelais] = useState<{ cle: string; corps: Record<string, unknown>; motif: string } | null>(null);

  const [copieDu, setCopieDu] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      const lu = await lireAvecCopie<Etat>(username, `/api/trimestre/circuit?annee=${annee}&trimestre=${trimestre}`);
      setEtat(lu.donnees);
      setCopieDu(lu.copieDu);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [annee, trimestre, username]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function agir(corps: Record<string, unknown>, confirmation?: string) {
    // Transmettre, valider, renvoyer engagent le circuit : jamais mis en file,
    // toujours faits avec le réseau, pour que chacun voie le même état.
    if (!navigator.onLine) {
      setErreur("Cette étape demande du réseau : elle engage le circuit de validation. Réessayez une fois connecté.");
      return;
    }
    if (confirmation && !window.confirm(confirmation)) return;
    setOccupe(true);
    setErreur(null);
    setMessage(null);
    try {
      const r = await fetch("/api/trimestre/circuit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee, trimestre, ...corps }),
      });
      if (!r.ok) {
        setErreur((await r.json().catch(() => ({}))).message ?? "Action impossible.");
        return;
      }
      setMessage("Enregistré.");
      setRenvoi(null);
      setRelais(null);
      await charger();
    } catch {
      setErreur("Pas de connexion : rien n'a été enregistré. Réessayez quand le réseau revient.");
    } finally {
      setOccupe(false);
    }
  }

  /** Le formulaire « en tant que DD » : un motif, puis la confirmation. */
  function formulaireRelais(cle: string, libelle: string, corps: Record<string, unknown>) {
    if (!etat?.peut.relaisDD) return null;
    if (relais?.cle !== cle) {
      return (
        <button
          type="button"
          onClick={() => setRelais({ cle, corps, motif: "" })}
          className="mt-2 rounded border border-blue-700 px-2 py-1 text-xs text-blue-800 hover:bg-blue-50"
        >
          {libelle}
        </button>
      );
    }
    return (
      <div className="mt-2">
        <textarea
          value={relais.motif}
          onChange={(e) => setRelais({ ...relais, motif: e.target.value })}
          rows={2}
          placeholder="Motif (obligatoire) : pourquoi vous prenez le relais."
          className="w-full rounded border border-gray-300 p-2 text-sm"
        />
        <div className="mt-1 flex gap-2">
          <button
            type="button"
            disabled={occupe || !relais.motif.trim()}
            onClick={() => void agir({ ...relais.corps, motif: relais.motif })}
            className="flex-1 rounded-md bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {libelle}
          </button>
          <button type="button" onClick={() => setRelais(null)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm">
            Annuler
          </button>
        </div>
      </div>
    );
  }

  if (erreur && !etat) return <p className="rounded-md bg-red-50 p-4 text-sm text-red-800">{erreur}</p>;
  if (!etat) return <p className="text-gray-600">Chargement…</p>;

  const sien = etat.role === "DA" || etat.role === "AGENT_SAISIE" ? etat.arrondissements[0] : null;

  return (
    <div className="max-w-3xl">
      <HorsLigneTrimestre username={username} copieDu={copieDu} />
      <h1 className="text-2xl font-bold text-primary-dark">Circuit du rapport trimestriel</h1>
      <p className="mt-1 text-sm text-gray-600">{etat.periode}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700">
          Année{" "}
          <input
            type="number"
            value={annee}
            onChange={(e) => setPeriode((p) => ({ ...p, annee: Number(e.target.value) }))}
            className="w-24 rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="text-sm text-gray-700">
          Trimestre{" "}
          <select
            value={trimestre}
            onChange={(e) => setPeriode((p) => ({ ...p, trimestre: Number(e.target.value) }))}
            className="rounded border border-gray-300 px-2 py-1"
          >
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ol className="mt-4 space-y-1 rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-700">
        {ETAPES.map(([qui, quoi], i) => (
          <li key={qui}>
            <strong>
              {i + 1}. {qui}
            </strong>{" "}
            {quoi}
          </li>
        ))}
      </ol>

      {erreur && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}
      {message && <p className="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-800">{message}</p>}

      {/* ---- L'arrondissement de l'agent ou du DA ---- */}
      {sien && (
        <section className="mt-5 rounded-md border border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-900">Rapport de l&apos;arrondissement de {sien.nom}</h2>
          <p className="mt-2">
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE_ARR[sien.statut].classe}`}>
              {BADGE_ARR[sien.statut].texte}
            </span>
            {sien.date && (
              <span className="ml-2 text-xs text-gray-500">
                le {le(sien.date)}
                {sien.parLeDD ? ", par le Délégué départemental à votre place" : sien.auteur ? `, par ${sien.auteur}` : ""}
              </span>
            )}
          </p>
          {sien.parLeDD && sien.motif && (
            <p className="mt-2 rounded-md bg-blue-50 p-3 text-sm text-blue-900">Motif du DD : {sien.motif}</p>
          )}
          {sien.statut === "RENVOYE" && sien.motif && (
            <p className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-800">Motif du renvoi : {sien.motif}</p>
          )}
          {sien.statut === "TRANSMIS" ? (
            <p className="mt-2 text-sm text-gray-700">Le rapport est transmis : il n&apos;est plus modifiable, sauf renvoi par le DD ou un chef de section.</p>
          ) : etat.role === "AGENT_SAISIE" ? (
            <p className="mt-2 text-sm text-gray-700">
              Remplissez la saisie trimestrielle, validez les analyses et relisez les textes. Votre DA relira l&apos;ensemble puis le transmettra.
            </p>
          ) : (
            <p className="mt-2 text-sm text-gray-700">
              Vos agents ont préparé le rapport. Relisez la saisie, les analyses et les textes, produisez un aperçu depuis « Mon rapport trimestriel », puis transmettez.
            </p>
          )}
          {etat.peut.transmettre && (
            <button
              type="button"
              disabled={occupe}
              onClick={() =>
                void agir(
                  { action: "transmettre" },
                  "Transmettre le rapport trimestriel au Délégué départemental ? Il ne sera plus modifiable, sauf renvoi."
                )
              }
              className="mt-3 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 sm:w-auto"
            >
              Transmettre au Délégué départemental
            </button>
          )}
        </section>
      )}

      {/* ---- Les six arrondissements (chefs et DD) ---- */}
      {!sien && (
        <section className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Rapports des arrondissements</h2>
          <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
            {etat.arrondissements.map((a) => (
              <li key={a.id} className="px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900">{a.nom}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE_ARR[a.statut].classe}`}>{BADGE_ARR[a.statut].texte}</span>
                </div>
                {a.date && (
                  <p className="text-xs text-gray-500">
                    le {le(a.date)}
                    {a.parLeDD ? ", transmis par le DD à la place du DA" : a.auteur ? `, par ${a.auteur}` : ""}
                  </p>
                )}
                {a.motif && <p className={`mt-1 text-xs ${a.parLeDD ? "text-blue-800" : "text-red-800"}`}>Motif : {a.motif}</p>}
                {a.statut !== "TRANSMIS" && formulaireRelais(`arr-${a.id}`, "Transmettre en tant que DD", { action: "transmettre", arrondissementId: a.id })}
                {etat.peut.renvoyer && a.statut === "TRANSMIS" && (
                  renvoi?.id === a.id ? (
                    <div className="mt-2">
                      <textarea
                        value={renvoi.motif}
                        onChange={(e) => setRenvoi({ id: a.id, motif: e.target.value })}
                        rows={3}
                        placeholder="Ce que le DA doit corriger."
                        className="w-full rounded border border-gray-300 p-2 text-sm"
                      />
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          disabled={occupe || !renvoi.motif.trim()}
                          onClick={() => void agir({ action: "renvoyer", arrondissementId: a.id, motif: renvoi.motif })}
                          className="flex-1 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          Renvoyer au DA
                        </button>
                        <button type="button" onClick={() => setRenvoi(null)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm">
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRenvoi({ id: a.id, motif: "" })}
                      className="mt-2 rounded border border-red-700 px-2 py-1 text-xs text-red-800 hover:bg-red-50"
                    >
                      Renvoyer pour correction
                    </button>
                  )
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---- Les quatre domaines ---- */}
      <section className="mt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Validation par les chefs de section</h2>
        <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
          {etat.sections.map((s) => (
            <li key={s.code} className="px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-gray-900">
                  <strong>{s.code}</strong> — {s.nom}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${BADGE_SECTION[s.statut].classe}`}>{BADGE_SECTION[s.statut].texte}</span>
              </div>
              {s.date && (
                <p className="text-xs text-gray-500">
                  le {le(s.date)}
                  {s.parLeDD ? ", validé par le DD à la place du chef" : s.auteur ? `, par ${s.auteur}` : ""}
                </p>
              )}
              {s.parLeDD && s.motif && <p className="mt-1 text-xs text-blue-800">Motif : {s.motif}</p>}
              {s.statut !== "VALIDE" && formulaireRelais(`sec-${s.code}`, "Valider en tant que DD", { action: "valider", section: s.code })}
              {s.chef === etat.role && etat.peut.valider && (
                <button
                  type="button"
                  disabled={occupe}
                  onClick={() =>
                    void agir(
                      { action: "valider" },
                      "Valider votre domaine du rapport trimestriel ? Ses analyses et ses textes ne seront plus modifiables."
                    )
                  }
                  className="mt-2 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50 sm:w-auto"
                >
                  Valider mon domaine
                </button>
              )}
              {s.statut === "VALIDE" && (etat.peut.annulerSection === "toutes" || etat.peut.annulerSection === s.code) && (
                <button
                  type="button"
                  disabled={occupe}
                  onClick={() => void agir({ action: "annuler", section: s.code }, "Annuler la validation de ce domaine ?")}
                  className="mt-2 rounded border border-gray-400 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  Annuler la validation
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {etat.role === "DD" && (
        <p className={`mt-5 rounded-md p-3 text-sm ${etat.complet ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>
          {etat.complet
            ? "Le circuit est achevé : vous pouvez produire la version définitive depuis « Rapport trimestriel »."
            : "Tant que le circuit n'est pas achevé, « Rapport trimestriel » ne produit qu'un aperçu, marqué PROVISOIRE."}
        </p>
      )}
      {etat.role === "DD" && !etat.complet && (
        <section className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p>
            Exceptionnellement, si un DA ou un chef de section ne franchit pas son étape, vous pouvez prendre le
            relais : chaque étape sera marquée « par le DD », avec votre motif, et l&apos;intéressé prévenu.
          </p>
          {formulaireRelais("tout", "Finaliser tout le circuit en tant que DD", { action: "finaliser" })}
        </section>
      )}
    </div>
  );
}

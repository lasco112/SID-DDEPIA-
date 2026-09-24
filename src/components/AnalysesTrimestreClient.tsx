"use client";

/**
 * Relecture et validation des analyses du rapport trimestriel.
 *
 * Le texte est CALCULÉ par le SID à partir des chiffres de chaque tableau :
 * on ne l'écrit pas, on le relit. Un clic le valide et passe au tableau
 * suivant. On peut aussi le corriger, ou lui ajouter une explication — la
 * cause d'une hausse ou d'une baisse, que les chiffres ne disent pas.
 *
 * Même présentation que la saisie trimestrielle (demande du Délégué) : la
 * liste d'abord, puis un tableau à la fois, avec « précédent » et « suivant ».
 */

import { useCallback, useEffect, useState } from "react";

type Statut = "vide" | "a_valider" | "valide" | "a_revoir";

interface Phrase {
  texte: string;
  calcul: string;
}

interface Analyse {
  numero: number;
  titre: string;
  section: string;
  statut: Statut;
  propose: string;
  phrases: Phrase[];
  texteValide: string | null;
  explication: string | null;
  validePar: string | null;
  valideLe: string | null;
  auRapport: string | null;
  sansComparaison: boolean;
}

interface Ecran {
  portee: string;
  analyses: Analyse[];
}

const LIBELLE: Record<Statut, { texte: string; classe: string }> = {
  a_valider: { texte: "À valider", classe: "bg-amber-100 text-amber-900" },
  valide: { texte: "Validée", classe: "bg-green-100 text-green-800" },
  a_revoir: { texte: "Chiffres modifiés : à revoir", classe: "bg-red-100 text-red-800" },
  vide: { texte: "Tableau vide", classe: "bg-gray-100 text-gray-600" },
};

function trimestreCourant() {
  const d = new Date();
  return { annee: d.getFullYear(), trimestre: Math.floor(d.getMonth() / 3) + 1 };
}

export default function AnalysesTrimestreClient({ presentation }: { presentation: string }) {
  const [{ annee, trimestre }, setPeriode] = useState(trimestreCourant);
  const [ecran, setEcran] = useState<Ecran | null>(null);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [correction, setCorrection] = useState<string | null>(null);
  const [explication, setExplication] = useState("");
  const [voirCalcul, setVoirCalcul] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    const r = await fetch(`/api/trimestre/analyses?annee=${annee}&trimestre=${trimestre}`);
    if (!r.ok) {
      setErreur((await r.json().catch(() => ({}))).message ?? "Chargement impossible.");
      return;
    }
    setEcran((await r.json()) as Ecran);
  }, [annee, trimestre]);

  useEffect(() => {
    setOuvert(null);
    void charger();
  }, [charger]);

  const courant = ecran?.analyses.find((a) => a.numero === ouvert) ?? null;

  // À l'ouverture d'un tableau : l'explication déjà donnée, pas de correction en cours.
  useEffect(() => {
    setCorrection(null);
    setVoirCalcul(false);
    setExplication(courant?.explication ?? "");
    if (courant) window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const suivant = (numero: number) => {
    const liste = ecran?.analyses ?? [];
    const i = liste.findIndex((a) => a.numero === numero);
    return liste.slice(i + 1).find((a) => a.statut !== "vide")?.numero ?? null;
  };

  async function envoyer(methode: "PUT" | "DELETE", corps: Record<string, unknown>, ensuite: number | null) {
    if (!courant) return;
    setOccupe(true);
    setErreur(null);
    try {
      const r = await fetch("/api/trimestre/analyses", {
        method: methode,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee, trimestre, numeroTableau: courant.numero, ...corps }),
      });
      if (!r.ok) {
        setErreur((await r.json().catch(() => ({}))).message ?? "Enregistrement impossible.");
        return;
      }
      await charger();
      setOuvert(ensuite);
    } catch {
      setErreur("Pas de connexion : rien n'a été enregistré. Réessayez quand le réseau revient.");
    } finally {
      setOccupe(false);
    }
  }

  if (erreur && !ecran) return <p className="rounded-md bg-red-50 p-4 text-sm text-red-800">{erreur}</p>;
  if (!ecran) return <p className="text-gray-600">Chargement…</p>;

  const aTraiter = ecran.analyses.filter((a) => a.statut === "a_valider" || a.statut === "a_revoir").length;
  const validees = ecran.analyses.filter((a) => a.statut === "valide").length;

  // ------------------------------------------------------------ un tableau
  if (courant) {
    const liste = ecran.analyses;
    const i = liste.findIndex((a) => a.numero === courant.numero);
    const precedent = liste[i - 1]?.numero ?? null;
    const apres = liste[i + 1]?.numero ?? null;
    const texteActuel = courant.statut === "valide" ? courant.texteValide ?? courant.propose : courant.propose;
    return (
      <div className="max-w-3xl">
        <button
          type="button"
          onClick={() => setOuvert(null)}
          className="mb-3 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          ← Tous les tableaux
        </button>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{courant.section}</p>
        <h1 className="mt-1 text-xl font-bold text-primary-dark">{courant.titre}</h1>
        <p className="mt-2">
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${LIBELLE[courant.statut].classe}`}>
            {LIBELLE[courant.statut].texte}
          </span>
          {courant.validePar && courant.valideLe && (
            <span className="ml-2 text-xs text-gray-500">
              par {courant.validePar}, le {new Date(courant.valideLe).toLocaleDateString("fr-FR")}
            </span>
          )}
        </p>

        {erreur && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

        {courant.statut === "vide" ? (
          <p className="mt-4 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-700">
            Ce tableau n&apos;a aucune donnée pour cette période : il n&apos;y a rien à analyser. Remplissez-le d&apos;abord
            (rapports mensuels ou saisie trimestrielle).
          </p>
        ) : (
          <div className="mt-4 space-y-4 rounded-md border border-gray-200 bg-white p-4">
            {courant.statut === "a_revoir" && (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                Les chiffres du tableau ont changé depuis la validation : le texte ci-dessous a été recalculé. Relisez-le
                et validez-le à nouveau.
              </p>
            )}

            <div>
              <p className="text-sm font-semibold text-gray-700">Texte qui figurera sous le tableau</p>
              {correction == null ? (
                <p className="mt-1 whitespace-pre-line rounded-md bg-gray-50 p-3 text-gray-900">{texteActuel}</p>
              ) : (
                <textarea
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  rows={6}
                  className="mt-1 w-full rounded-md border border-gray-300 p-2 text-gray-900"
                />
              )}
              <button
                type="button"
                onClick={() => setVoirCalcul((v) => !v)}
                className="mt-1 text-sm text-primary underline"
              >
                {voirCalcul ? "Masquer le calcul" : "Voir le calcul"}
              </button>
              {voirCalcul && (
                <ul className="mt-2 space-y-2 text-sm text-gray-700">
                  {courant.phrases.map((p, k) => (
                    <li key={k} className="rounded border border-gray-100 p-2">
                      <span className="block">{p.texte}</span>
                      <span className="block text-xs text-gray-500">Calcul : {p.calcul}</span>
                    </li>
                  ))}
                </ul>
              )}
              {courant.sansComparaison && (
                <p className="mt-2 text-sm text-amber-800">
                  Pas de comparaison avec l&apos;an passé : le total de l&apos;année dernière n&apos;est pas renseigné. Vous
                  pouvez le saisir dans la saisie trimestrielle (colonne « TOTAL » de l&apos;année dernière).
                </p>
              )}
            </div>

            <label className="block">
              <span className="text-sm font-semibold text-gray-700">Explication (facultatif)</span>
              <span className="block text-xs text-gray-500">
                La cause d&apos;une hausse ou d&apos;une baisse, que les chiffres ne disent pas. Elle s&apos;ajoute à la fin du texte.
              </span>
              <input
                type="text"
                value={explication}
                onChange={(e) => setExplication(e.target.value)}
                placeholder="Ex. : fermeture du marché à bétail en août."
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2"
              />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={occupe}
                onClick={() =>
                  void envoyer("PUT", { texte: correction ?? texteActuel, explication }, suivant(courant.numero))
                }
                className="rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
              >
                {occupe ? "Enregistrement…" : "Valider et passer au suivant"}
              </button>
              {correction == null ? (
                <button
                  type="button"
                  onClick={() => setCorrection(texteActuel)}
                  className="rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Corriger le texte
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCorrection(null)}
                  className="rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Annuler la correction
                </button>
              )}
              {(courant.statut === "valide" || courant.statut === "a_revoir") && (
                <button
                  type="button"
                  disabled={occupe}
                  onClick={() => void envoyer("DELETE", {}, courant.numero)}
                  className="rounded-md border border-gray-300 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Revenir au texte calculé
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={precedent == null || occupe}
            onClick={() => setOuvert(precedent)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            ← Tableau précédent
          </button>
          <button
            type="button"
            disabled={apres == null || occupe}
            onClick={() => setOuvert(apres)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            Tableau suivant →
          </button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ la liste
  const sections: { titre: string; analyses: Analyse[] }[] = [];
  for (const a of ecran.analyses) {
    const s = sections.find((x) => x.titre === a.section);
    if (s) s.analyses.push(a);
    else sections.push({ titre: a.section, analyses: [a] });
  }
  const premier = ecran.analyses.find((a) => a.statut === "a_valider" || a.statut === "a_revoir");

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-primary-dark">Analyses du rapport trimestriel</h1>
      <p className="mt-1 text-gray-600">
        {presentation} Rapport de {ecran.portee}.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
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

      <p className="mt-4 text-sm text-gray-700">
        <strong>{validees}</strong> analyse(s) validée(s), <strong>{aTraiter}</strong> à relire.
      </p>
      {premier && (
        <button
          type="button"
          onClick={() => setOuvert(premier.numero)}
          className="mt-2 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary-dark sm:w-auto"
        >
          Commencer la relecture
        </button>
      )}

      {sections.map((s) => (
        <section key={s.titre} className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{s.titre}</h2>
          <ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200 bg-white">
            {s.analyses.map((a) => (
              <li key={a.numero}>
                <button
                  type="button"
                  onClick={() => setOuvert(a.numero)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-gray-50"
                >
                  <span className="text-sm text-gray-900">{a.titre}</span>
                  <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${LIBELLE[a.statut].classe}`}>
                    {LIBELLE[a.statut].texte}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

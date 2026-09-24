"use client";

/**
 * Écran de préparation du rapport trimestriel (E9).
 *
 * Ce que le DD doit voir AVANT de produire quoi que ce soit :
 *   - de quels mois le trimestre est fait, et lesquels manquent ;
 *   - si la comparaison à l'an passé est possible ;
 *   - ce que le rapport dira, avec le calcul de chaque phrase.
 *
 * Le bouton de génération définitive reste inactif tant que la période est
 * incomplète. Produire un brouillon reste possible, mais il est nommé
 * brouillon, et le document le porte sur chaque page.
 */

import { useCallback, useEffect, useState } from "react";

interface Trimestre { annee: number; trimestre: number; libelle: string; court: string; moisPresents: number }
interface MoisEtat { libelle: string; present: boolean; transmis: number; complet: boolean }
interface FaitApercu { libelle: string; phrase: string; calcul: string }

interface Etat {
  disponibles: Trimestre[];
  periode?: { annee: number; trimestre: number; libelle: string; court: string };
  comparaison?: { libelle: string; disponible: boolean };
  mois?: MoisEtat[];
  calculable?: boolean;
  moisAbsents?: string[];
  moisIncomplets?: string[];
  champsSansRegle?: string[];
  apercuFaits?: FaitApercu[];
  /** Le circuit de validation : six rapports transmis, quatre domaines validés. */
  circuit?: { complet: boolean; message: string | null };
}

export default function TrimestreClient() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [choix, setChoix] = useState<{ annee: number; trimestre: number } | null>(null);
  const [chargement, setChargement] = useState(true);
  const [generation, setGeneration] = useState<"final" | "brouillon" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [calculOuvert, setCalculOuvert] = useState<number | null>(null);

  const charger = useCallback(async (c: { annee: number; trimestre: number } | null) => {
    setChargement(true);
    const q = c ? `?annee=${c.annee}&trimestre=${c.trimestre}` : "";
    const res = await fetch(`/api/dd/trimestre${q}`);
    const data = await res.json();
    setEtat(data);
    // Premier chargement : on se place sur le trimestre le plus récent.
    if (!c && data.disponibles?.length) {
      const d = data.disponibles[0];
      setChoix({ annee: d.annee, trimestre: d.trimestre });
    }
    setChargement(false);
  }, []);

  useEffect(() => { charger(null); }, [charger]);
  useEffect(() => { if (choix) charger(choix); }, [choix, charger]);

  /** Le motif de la finalisation exceptionnelle par le DD ; null tant qu'il ne l'a pas demandée. */
  const [motifRelais, setMotifRelais] = useState<string | null>(null);

  async function generer(brouillon: boolean, exceptionnel = false) {
    if (!choix) return;
    setGeneration(brouillon ? "brouillon" : "final");
    setMessage(null);
    const res = await fetch("/api/dd/trimestre", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...choix, apercu: brouillon, ...(exceptionnel ? { exceptionnel: true, motif: motifRelais } : {}) }),
    });
    if (exceptionnel && res.ok) {
      setMotifRelais(null);
      void charger(choix);
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMessage(d.message ?? "La génération a échoué.");
      setGeneration(null);
      return;
    }
    // Le document arrive en binaire : on le remet au navigateur sous son nom.
    const blob = await res.blob();
    const nom =
      res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "rapport-trimestriel.docx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nom;
    a.click();
    URL.revokeObjectURL(url);
    setGeneration(null);
    setMessage(`Document produit : ${nom}`);
  }

  if (chargement && !etat) {
    return <p className="text-sm text-ink-muted">Chargement…</p>;
  }
  if (!etat?.disponibles?.length) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Aucune donnée mensuelle en base : aucun trimestre ne peut encore être consolidé.
      </p>
    );
  }

  const complet = etat.calculable === true;
  const circuitComplet = etat.circuit?.complet === true;

  return (
    <div className="max-w-5xl">
      {/* ---- Choix du trimestre ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-gray-700" htmlFor="trimestre">Période</label>
        <select
          id="trimestre"
          className="w-full max-w-full rounded border border-gray-300 px-3 py-2 text-sm sm:w-auto"
          value={choix ? `${choix.annee}-${choix.trimestre}` : ""}
          onChange={(e) => {
            const [a, t] = e.target.value.split("-").map(Number);
            setChoix({ annee: a, trimestre: t });
          }}
        >
          {etat.disponibles.map((d) => (
            <option key={`${d.annee}-${d.trimestre}`} value={`${d.annee}-${d.trimestre}`}>
              {d.libelle} — {d.moisPresents}/3 mois en base
            </option>
          ))}
        </select>
      </div>

      {/* ---- État des mois ---- */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Mois composant la période</h2>
        <div className={`rounded-lg border p-4 ${complet ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <p className={`text-sm font-semibold ${complet ? "text-green-900" : "text-amber-900"}`}>
            {!complet
              ? "La période est incomplète — seul un brouillon peut être produit."
              : circuitComplet
                ? "Les trois mois sont complets et le circuit de validation est achevé : le rapport définitif peut être produit."
                : "Les trois mois sont complets. Le rapport définitif attend la fin du circuit de validation (menu « Circuit du trimestre »)."}
          </p>

          <ul className="mt-3 space-y-1 text-sm">
            {etat.mois?.map((m) => (
              <li key={m.libelle} className="flex flex-wrap items-center gap-2">
                <span>{m.complet ? "✅" : m.present ? "⚠️" : "❌"}</span>
                <span className="font-medium">{m.libelle}</span>
                <span className="text-xs text-gray-600">
                  {!m.present
                    ? "mois inexistant en base"
                    : m.complet
                      ? "6 arrondissements sur 6 ont transmis"
                      : `${m.transmis} arrondissement(s) sur 6 ont transmis`}
                </span>
              </li>
            ))}
          </ul>

          {etat.comparaison && (
            <p className="mt-3 text-xs text-gray-700">
              Comparaison à l&apos;année précédente — {etat.comparaison.libelle} :{" "}
              {etat.comparaison.disponible
                ? "disponible."
                : "absente de la base. Le rapport sortira sans colonne d'écart."}
            </p>
          )}

          {etat.champsSansRegle && etat.champsSansRegle.length > 0 && (
            <p className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-900">
              {etat.champsSansRegle.length} champ(s) du canevas n&apos;ont pas de règle d&apos;agrégation :{" "}
              {etat.champsSansRegle.slice(0, 5).join(", ")}. La consolidation est bloquée tant que ce point
              n&apos;est pas réglé — c&apos;est volontaire : un champ sans règle produirait un chiffre faux.
            </p>
          )}
        </div>
      </section>

      {/* ---- Ce que le rapport dira ---- */}
      {etat.apercuFaits && etat.apercuFaits.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Ce que le rapport dira — faits les plus notables
          </h2>
          <ul className="space-y-2">
            {etat.apercuFaits.map((f, i) => (
              <li key={i} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-sm text-gray-800">{f.phrase}</p>
                <button
                  onClick={() => setCalculOuvert(calculOuvert === i ? null : i)}
                  className="mt-1 text-xs font-semibold text-primary hover:underline"
                >
                  {calculOuvert === i ? "Masquer le calcul" : "Voir le calcul"}
                </button>
                {calculOuvert === i && (
                  <p className="mt-1 rounded bg-gray-50 p-2 font-mono text-xs text-gray-700">{f.calcul}</p>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Ces phrases sont calculées à partir des données validées. Aucune n&apos;est rédigée par une machine
            à écrire du texte : chacune porte son calcul.
          </p>
        </section>
      )}

      {/* ---- Génération ---- */}
      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Production du document</h2>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => generer(false)}
            disabled={!complet || !circuitComplet || generation !== null}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:bg-gray-300"
            title={!complet ? "La période doit être complète" : !circuitComplet ? "Le circuit de validation doit être achevé" : undefined}
          >
            {generation === "final" ? "Génération…" : "Générer le rapport trimestriel (.docx)"}
          </button>
          <button
            onClick={() => generer(true)}
            disabled={generation !== null}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:text-gray-400"
          >
            {generation === "brouillon" ? "Génération…" : "Générer un brouillon"}
          </button>
        </div>

        <p className="mt-3 text-xs text-ink-muted">
          Le document reproduit le canevas officiel : ses tableaux, leurs colonnes et leurs libellés de
          ligne. Les tableaux, leurs analyses et la conclusion se remplissent à partir des saisies ; les textes
          viennent des chefs de section.
        </p>
        {complet && !circuitComplet && (
          <div className="mt-2 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
            <p>{etat.circuit?.message} Suivez l&apos;avancement dans « Circuit du trimestre ».</p>
            {/* Exceptionnellement, le DD prend le relais d'un DA ou d'un chef défaillant — comme au mensuel. */}
            {motifRelais == null ? (
              <button
                type="button"
                onClick={() => setMotifRelais("")}
                className="mt-2 rounded border border-blue-700 bg-white px-3 py-2 text-sm text-blue-800 hover:bg-blue-50"
              >
                Finaliser exceptionnellement en tant que DD
              </button>
            ) : (
              <div className="mt-2">
                <p className="text-blue-900">
                  Les rapports non transmis seront transmis, et les domaines non validés validés, EN VOTRE NOM — marqués
                  « par le DD » avec ce motif, et les intéressés prévenus. Puis le rapport définitif sera produit.
                </p>
                <textarea
                  value={motifRelais}
                  onChange={(e) => setMotifRelais(e.target.value)}
                  rows={2}
                  placeholder="Motif (obligatoire)"
                  className="mt-1 w-full rounded border border-gray-300 p-2 text-sm text-gray-900"
                />
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!motifRelais.trim() || generation !== null}
                    onClick={() => generer(false, true)}
                    className="rounded-md bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {generation === "final" ? "Génération…" : "Finaliser et produire le rapport définitif"}
                  </button>
                  <button type="button" onClick={() => setMotifRelais(null)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {!complet && (
          <p className="mt-2 text-xs text-amber-900">
            Le rapport définitif est indisponible tant qu&apos;un mois manque ou qu&apos;un arrondissement
            n&apos;a pas transmis. Un brouillon reste possible ; il porte la mention sur chaque page.
          </p>
        )}
        {message && <p className="mt-3 text-sm text-gray-700">{message}</p>}
      </section>
    </div>
  );
}

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
}

export default function TrimestreClient() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [choix, setChoix] = useState<{ annee: number; trimestre: number } | null>(null);
  const [chargement, setChargement] = useState(true);
  const [message] = useState<string | null>(null);
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

  // Le téléchargement du .docx est retiré tant que le rendu ne reproduit pas le
  // canevas officiel — voir RENDU_CONFORME_AU_CANEVAS dans la route. Il sera
  // rétabli avec le nouveau générateur ; git en conserve la première version.

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

  return (
    <div className="max-w-5xl">
      {/* ---- Choix du trimestre ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-gray-700" htmlFor="trimestre">Période</label>
        <select
          id="trimestre"
          className="rounded border border-gray-300 px-3 py-2 text-sm"
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
            {complet
              ? "Les trois mois sont présents et complets : le rapport définitif peut être produit."
              : "La période est incomplète — seul un brouillon peut être produit."}
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

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            La production du document Word est suspendue.
          </p>
          <p className="mt-2 text-sm text-amber-900">
            Le rendu ne reproduit pas encore le canevas officiel : celui-ci impose six colonnes
            d&apos;arrondissement nommées, une colonne de total pour la période, une pour la même période de
            l&apos;année précédente, et des libellés de ligne fixes. Un document non conforme ne doit pas
            pouvoir être transmis à la Délégation Régionale.
          </p>
          <p className="mt-2 text-xs text-amber-900">
            Les chiffres consolidés et les analyses ci-dessus sont exacts et restent consultables. Seule la
            mise en page du document reste à reconstruire.
          </p>
        </div>

        {message && <p className="mt-3 text-sm text-gray-700">{message}</p>}
      </section>
    </div>
  );
}

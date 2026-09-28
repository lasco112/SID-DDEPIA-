"use client";

/**
 * Écran du rapport trimestriel d'ARRONDISSEMENT.
 *
 * Plus dépouillé que celui du DD : un DA n'a pas à arbitrer la consolidation
 * départementale, il produit son propre document. Ce qu'il doit voir avant de
 * l'imprimer, c'est simplement de quels mois sa période est faite et lesquels
 * il n'a pas transmis.
 *
 * La complétude est jugée sur SES transmissions : le retard d'un arrondissement
 * voisin ne doit pas l'empêcher de rendre son rapport.
 */

import { useCallback, useEffect, useState } from "react";
import { ChoixDuRapport } from "@/components/TrimestreClient";
import { choixDepuisAdresse, libelleRapport, requeteRapport, type ChoixRapport, type TypeRapport } from "@/lib/choixRapport";

interface Trimestre { annee: number; trimestre: number; libelle: string; court: string }
interface MoisEtat { libelle: string; present: boolean; complet: boolean }

interface Etat {
  arrondissement?: string;
  disponibles: Trimestre[];
  periode?: { annee: number; trimestre: number | null; type: TypeRapport; rang: number; libelle: string; court: string };
  /** Semestre ou année : les trimestres dont aucun tableau n'a été saisi. */
  trimestresSansSaisie?: string[];
  mois?: MoisEtat[];
  calculable?: boolean;
  /** Le rapport a été transmis au DD (circuit du trimestre) : seul le définitif en découle. */
  transmis?: boolean;
  message?: string;
}

export default function TrimestreArrondissementClient() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [choix, setChoix] = useState<ChoixRapport | null>(null);
  const [chargement, setChargement] = useState(true);
  const [generation, setGeneration] = useState<"final" | "brouillon" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async (c: ChoixRapport | null) => {
    setChargement(true);
    const res = await fetch(`/api/da/trimestre${c ? `?${requeteRapport(c)}` : ""}`);
    const data = await res.json();
    setEtat(data);
    // Premier chargement : la période demandée par l'accueil (?type=…), sinon
    // le trimestre le plus récent.
    if (!c && data.disponibles?.length) {
      setChoix(choixDepuisAdresse() ?? { annee: data.disponibles[0].annee, type: "TRIMESTRIEL", rang: data.disponibles[0].trimestre });
    }
    setChargement(false);
  }, []);

  useEffect(() => { charger(null); }, [charger]);
  useEffect(() => { if (choix) charger(choix); }, [choix, charger]);

  async function generer(brouillon: boolean) {
    if (!choix) return;
    setGeneration(brouillon ? "brouillon" : "final");
    setMessage(null);
    const res = await fetch("/api/da/trimestre", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...choix, apercu: brouillon }),
    });
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

  if (chargement && !etat) return <p className="text-sm text-ink-muted">Chargement…</p>;

  if (etat?.message && !etat.disponibles) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{etat.message}</p>
    );
  }
  if (!etat?.disponibles?.length) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Aucune donnée mensuelle en base : aucun trimestre ne peut encore être consolidé.
      </p>
    );
  }

  const complet = etat.calculable === true;
  const transmis = etat.transmis === true;

  return (
    <div className="max-w-4xl">
      <ChoixDuRapport disponibles={etat.disponibles} choix={choix} onChange={setChoix} />
      {choix && choix.type !== "TRIMESTRIEL" && (
        <p className="mt-3 text-sm text-ink-muted">
          Le rapport {choix.type === "ANNUEL" ? "annuel" : "semestriel"} se calcule à partir de vos trimestres, et suit la
          transmission du {choix.type === "SEMESTRIEL" && choix.rang === 1 ? "2e" : "4e"} trimestre : rien à ressaisir.
        </p>
      )}
      {etat.trimestresSansSaisie && etat.trimestresSansSaisie.length > 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Aucun tableau du trimestre n&apos;a été saisi pour : <strong>{etat.trimestresSansSaisie.join(", ")}</strong>. Le
          rapport ne les compte pas.
        </p>
      )}

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Mois composant la période
        </h2>
        <div className={`rounded-lg border p-4 ${complet ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
          <p className={`text-sm font-semibold ${complet ? "text-green-900" : "text-amber-900"}`}>
            {!complet
              ? "Il vous manque au moins un mois — seul un brouillon peut être produit."
              : transmis
                ? `Vos ${etat.mois?.length ?? 3} mois sont transmis et le rapport aussi : le rapport définitif peut être produit.`
                : `Vos ${etat.mois?.length ?? 3} mois sont transmis. Le rapport définitif suivra la transmission du rapport trimestriel au DD.`}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {etat.mois?.map((m) => (
              <li key={m.libelle} className="flex flex-wrap items-center gap-2">
                <span>{m.complet ? "✅" : m.present ? "⚠️" : "❌"}</span>
                <span className="font-medium">{m.libelle}</span>
                <span className="text-xs text-gray-600">
                  {!m.present ? "mois inexistant en base" : m.complet ? "transmis" : "non transmis"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Production du document
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => generer(false)}
            disabled={!complet || !transmis || generation !== null}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:bg-gray-300"
            title={!complet ? "Tous vos mois doivent être transmis" : !transmis ? "Transmettez d'abord le rapport au DD (étape 5)" : undefined}
          >
            {generation === "final" ? "Génération…" : `Générer mon rapport — ${choix ? libelleRapport(choix).toLowerCase() : ""} (.docx)`}
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
          Le document suit le canevas officiel, ramené à votre arrondissement : une seule colonne
          territoriale au lieu de six. Les tableaux, leurs analyses et la conclusion se remplissent à partir
          de vos saisies. Le rapport définitif est celui que vous avez transmis au Délégué départemental
          (étape 5, « Transmettre mon rapport au DD ») ; avant, seul un brouillon peut être produit.
        </p>
        {complet && !transmis && (
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
            Le rapport définitif sera disponible une fois le rapport transmis au Délégué départemental, à
            l&apos;étape suivante. En attendant, produisez un brouillon pour le relire.
          </p>
        )}
        {message && <p className="mt-3 text-sm text-gray-700">{message}</p>}
      </section>
    </div>
  );
}

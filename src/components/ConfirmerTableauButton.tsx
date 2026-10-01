"use client";

/**
 * « Confirmer ce tableau » — transforme les valeurs reprises du mois précédent
 * en données du mois en cours.
 *
 * Tant qu'un tableau contient des valeurs reprises non confirmées, le rapport
 * ne peut pas être transmis : c'est le garde-fou qui empêche de déclarer la
 * production du mois précédent comme étant celle du mois en cours.
 *
 * Le bouton apparaît aussi quand le SERVEUR signale des reprises que le
 * téléphone ne voit pas (reprise faite après coup, case non affichée) : sans
 * lui, le serveur refusait la transmission et le DA n'avait aucun moyen de
 * valider (constaté le 1er octobre 2026).
 */

import { useEffect, useState } from "react";
import { jeton } from "@/lib/surlignage";
import { oublierServeur, aConfirmerSelonServeur } from "@/lib/aCorriger";

export default function ConfirmerTableauButton({
  templateCode,
  nbReprises,
  periodeId,
  onConfirme,
}: {
  templateCode: string;
  nbReprises: number;
  /** Le mois affiché : pour demander au serveur s'il reste des reprises dans ce tableau. */
  periodeId?: string;
  onConfirme?: () => void;
}) {
  const [etat, setEtat] = useState<"pret" | "envoi" | "fait">("pret");
  const [message, setMessage] = useState<string | null>(null);
  const [selonServeur, setSelonServeur] = useState(false);

  useEffect(() => {
    if (!periodeId) return;
    let annule = false;
    void aConfirmerSelonServeur(periodeId, templateCode).then((oui) => {
      if (!annule) setSelonServeur(oui);
    });
    return () => {
      annule = true;
    };
  }, [periodeId, templateCode]);

  if (nbReprises === 0 && !selonServeur && etat !== "fait") return null;

  async function confirmer() {
    setEtat("envoi");
    setMessage(null);
    try {
      const res = await fetch("/api/da/confirmer-tableau", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Confirmation impossible.");
      setEtat("fait");
      setSelonServeur(false);
      oublierServeur(); // « À corriger » relit tout de suite ce qui reste à confirmer
      setMessage(
        data.tableauxRestants?.length
          ? `Tableau confirmé. Restent à confirmer : ${data.tableauxRestants.join(", ")}.`
          : "Tableau confirmé. Tous les tableaux sont à jour."
      );
      onConfirme?.();
    } catch (e) {
      setEtat("pret");
      setMessage(
        e instanceof Error && !/fetch|network/i.test(e.message)
          ? e.message
          : "Confirmation impossible sans réseau. Réessayez une fois connecté."
      );
    }
  }

  return (
    <div data-cible={jeton("confirmer")} className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
      {etat !== "fait" && (
        <p className="text-sm text-amber-900">
          {nbReprises > 0 ? (
            <>
              <strong>{nbReprises}</strong> valeur{nbReprises > 1 ? "s" : ""} {nbReprises > 1 ? "sont reprises" : "est reprise"} du
              mois précédent et {nbReprises > 1 ? "attendent" : "attend"} votre confirmation (cases grises). Corrigez ce qui a
              changé, puis confirmez : le rapport ne pourra pas être transmis avant.
            </>
          ) : (
            <>
              Ce tableau contient des valeurs reprises du mois précédent, pas encore confirmées. Vérifiez les chiffres ci-dessus,
              corrigez ce qui a changé, puis confirmez : le rapport ne pourra pas être transmis avant.
            </>
          )}
        </p>
      )}
      {etat !== "fait" && (
        <button
          onClick={confirmer}
          disabled={etat === "envoi"}
          className="mt-2 min-h-[44px] rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:bg-gray-300"
        >
          {etat === "envoi" ? "Confirmation…" : "Confirmer ce tableau"}
        </button>
      )}
      {message && <p className="mt-2 text-sm text-gray-700">{message}</p>}
    </div>
  );
}

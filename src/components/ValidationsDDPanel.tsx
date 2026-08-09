"use client";

/**
 * Tableau des validations manquantes du rapport départemental (CDC §10).
 *
 * Le DD doit voir d'un coup d'œil ce qui bloque encore la clôture, et pouvoir
 * choisir entre attendre le chef de section compétent ou valider lui-même au
 * titre de son pouvoir hiérarchique (§9). La validation exercée par le DD
 * reste identifiée comme telle.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface EtatSection {
  sectionId: string;
  code: string;
  nom: string;
  valide: boolean;
  bloquante: boolean;
  parLeDD: boolean;
  validePar: string | null;
  dateValidation: string | null;
  motif: string | null;
}

export interface EtatArrondissement {
  nom: string;
  soumis: boolean;
}

export default function ValidationsDDPanel({
  periodeId,
  periodeCloturee,
  arrondissements,
  sections,
}: {
  periodeId: string;
  periodeCloturee: boolean;
  arrondissements: EtatArrondissement[];
  sections: EtatSection[];
}) {
  const router = useRouter();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const daManquants = arrondissements.filter((a) => !a.soumis);
  const sectionsManquantes = sections.filter((s) => s.bloquante && !s.valide);
  const complet = daManquants.length === 0 && sectionsManquantes.length === 0;

  async function validerEnTantQueDD(sectionId: string) {
    setEnCours(sectionId);
    setMessage(null);
    const res = await fetch("/api/dd/validations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodeId, sectionId, motif: motifs[sectionId] ?? "" }),
    });
    const data = await res.json().catch(() => ({}));
    setEnCours(null);
    if (!res.ok) {
      setMessage(data.message ?? "La validation n'a pas pu être enregistrée.");
      return;
    }
    setMessage("Validation enregistrée au nom du Délégué Départemental.");
    router.refresh();
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Validations du rapport départemental
      </h2>

      <div className={`rounded-lg border p-4 ${complet ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
        <p className={`text-sm font-semibold ${complet ? "text-green-900" : "text-amber-900"}`}>
          {complet
            ? "Toutes les validations nécessaires ont été obtenues : le rapport définitif peut être généré."
            : "Le rapport ne peut pas encore être clôturé."}
        </p>

        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Arrondissements</p>
            <ul className="space-y-1 text-sm">
              {arrondissements.map((a) => (
                <li key={a.nom} className="flex items-center gap-2">
                  <span>{a.soumis ? "✅" : "⚠️"}</span>
                  <span className={a.soumis ? "" : "font-semibold text-amber-900"}>{a.nom}</span>
                  {!a.soumis && <span className="text-xs text-amber-800">rapport non soumis</span>}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Services / Sections</p>
            <ul className="space-y-2 text-sm">
              {sections.map((s) => (
                <li key={s.sectionId}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{s.valide ? "✅" : s.bloquante ? "⚠️" : "○"}</span>
                    <span className={s.valide ? "" : s.bloquante ? "font-semibold text-amber-900" : "text-gray-500"}>
                      {s.code}
                    </span>
                    {s.valide ? (
                      <span className="text-xs text-gray-600">
                        {s.parLeDD ? "validé directement par le DD" : `validé par ${s.validePar ?? "—"}`}
                        {s.dateValidation &&
                          ` le ${new Date(s.dateValidation).toLocaleDateString("fr-FR")} à ${new Date(s.dateValidation).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                    ) : s.bloquante ? (
                      <span className="text-xs text-amber-800">validation manquante</span>
                    ) : (
                      <span className="text-xs text-gray-500">non bloquante ce mois-ci</span>
                    )}
                  </div>

                  {!s.valide && s.bloquante && !periodeCloturee && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 pl-6">
                      <input
                        type="text"
                        placeholder="Motif (facultatif)"
                        className="w-44 rounded border border-gray-300 px-2 py-1 text-xs"
                        value={motifs[s.sectionId] ?? ""}
                        onChange={(e) => setMotifs((p) => ({ ...p, [s.sectionId]: e.target.value }))}
                      />
                      <button
                        onClick={() => validerEnTantQueDD(s.sectionId)}
                        disabled={enCours === s.sectionId}
                        className="rounded bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-hover disabled:bg-gray-300"
                      >
                        {enCours === s.sectionId ? "Validation…" : "Valider en tant que DD"}
                      </button>
                    </div>
                  )}

                  {s.valide && s.parLeDD && s.motif && (
                    <p className="pl-6 text-xs italic text-gray-500">Motif : {s.motif}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {!complet && daManquants.length > 0 && (
          <p className="mt-4 text-xs text-amber-900">
            La soumission d'un rapport d'arrondissement ne peut pas être faite à la place du DA. Utilisez « Reporter
            l'échéance » si le retard est justifié.
          </p>
        )}
        {message && <p className="mt-3 text-sm text-gray-700">{message}</p>}
      </div>
    </section>
  );
}

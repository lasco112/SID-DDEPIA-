"use client";

/**
 * Les informations structurelles d'un acteur du registre (20 octobre 2026) :
 * coordonnées GPS pour tous ; pour un marché, les espèces vendues, les jours
 * de marché et les équipements ; pour un abattoir, un étang ou une clinique,
 * les espèces concernées ; et des observations.
 *
 * Utilisé à l'ajout d'un acteur (autre qu'un marché, qui a son questionnaire)
 * et dans sa fiche. La position se prend par le téléphone, sur place, à 5 m
 * près au plus (CaptureGps) — jamais tapée (21 octobre 2026).
 */
import { ESPECES, QUESTION_ESPECES, type InfosStructurelles } from "@/lib/acteurs";
import CaptureGps from "@/components/CaptureGps";

export default function InfosActeurForm({
  typeCode,
  valeur,
  onChange,
  desactive = false,
}: {
  typeCode: string;
  valeur: InfosStructurelles;
  onChange: (v: InfosStructurelles) => void;
  desactive?: boolean;
}) {
  // Les marchés ont leur questionnaire (QuestionnaireMarche) : ce formulaire sert aux autres acteurs.
  const questionEspeces = QUESTION_ESPECES[typeCode];
  const basculer = (cle: "especes", code: string) => {
    const actuel = valeur[cle] ?? [];
    onChange({ ...valeur, [cle]: actuel.includes(code) ? actuel.filter((x) => x !== code) : [...actuel, code] });
  };
  const position =
    valeur.latitude != null && valeur.longitude != null && valeur.precisionGPS != null
      ? { latitude: valeur.latitude, longitude: valeur.longitude, precisionGPS: valeur.precisionGPS, dateCollecteGPS: valeur.dateCollecteGPS ?? new Date().toISOString() }
      : null;

  const cases = (liste: { code: string; libelle: string }[], cle: "especes") => (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
      {liste.map((x) => (
        <label key={x.code} className="flex min-h-[32px] items-center gap-1.5 text-sm text-ink">
          <input type="checkbox" disabled={desactive} checked={(valeur[cle] ?? []).includes(x.code)} onChange={() => basculer(cle, x.code)} className="h-4 w-4" />
          {x.libelle}
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1 text-[13px] font-bold text-ink">Position GPS — prise sur place, avec le téléphone</p>
        <CaptureGps
          valeur={position}
          desactive={desactive}
          onChange={(p) =>
            onChange({ ...valeur, latitude: p?.latitude ?? null, longitude: p?.longitude ?? null, precisionGPS: p?.precisionGPS ?? null, dateCollecteGPS: p?.dateCollecteGPS ?? null })
          }
        />
      </div>

      {questionEspeces && (
        <div>
          <p className="text-[13px] font-bold text-ink">{questionEspeces}</p>
          {cases(ESPECES, "especes")}
        </div>
      )}

      <div>
        <label className="text-[13px] font-bold text-ink" htmlFor={`obs-${typeCode}`}>
          Observations
        </label>
        <textarea
          id={`obs-${typeCode}`}
          rows={2}
          disabled={desactive}
          value={valeur.observations ?? ""}
          onChange={(e) => onChange({ ...valeur, observations: e.target.value })}
          placeholder="Ex. : capacité, état, remarques…"
          className="mt-1 w-full rounded-input border border-gray-300 bg-white px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}

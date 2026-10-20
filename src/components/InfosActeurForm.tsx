"use client";

/**
 * Les informations structurelles d'un acteur du registre (20 octobre 2026) :
 * coordonnées GPS pour tous ; pour un marché, les espèces vendues, les jours
 * de marché et les équipements ; pour un abattoir, un étang ou une clinique,
 * les espèces concernées ; et des observations.
 *
 * Utilisé à l'ajout d'un acteur et dans sa fiche. « Utiliser ma position »
 * prend la position du téléphone, sur place, avec l'accord de l'agent.
 */
import { useState } from "react";
import { ESPECES, INFRASTRUCTURES_MARCHE, JOURS, QUESTION_ESPECES, libelleJour, type InfosStructurelles } from "@/lib/acteurs";

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
  const [gps, setGps] = useState<string | null>(null);
  const marche = typeCode === "ETAB_MARCHE";
  const questionEspeces = QUESTION_ESPECES[typeCode];
  const basculer = (cle: "especes" | "joursMarche" | "infrastructures", code: string) => {
    const actuel = valeur[cle] ?? [];
    onChange({ ...valeur, [cle]: actuel.includes(code) ? actuel.filter((x) => x !== code) : [...actuel, code] });
  };

  function maPosition() {
    if (!("geolocation" in navigator)) return setGps("Cet appareil ne donne pas sa position.");
    setGps("Recherche de la position…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange({ ...valeur, latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)) });
        setGps(`Position prise (précision ± ${Math.round(p.coords.accuracy)} m).`);
      },
      () => setGps("Position refusée ou introuvable : autorisez la localisation, ou saisissez les coordonnées."),
      { enableHighAccuracy: true, timeout: 20000 }
    );
  }

  const cases = (liste: { code: string; libelle: string }[], cle: "especes" | "joursMarche" | "infrastructures") => (
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
        <p className="text-[13px] font-bold text-ink">Coordonnées GPS</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            inputMode="decimal"
            placeholder="Latitude (ex. 5,4467)"
            disabled={desactive}
            value={valeur.latitude ?? ""}
            onChange={(e) => onChange({ ...valeur, latitude: e.target.value === "" ? null : (e.target.value as unknown as number) })}
            className="min-h-[40px] w-44 rounded-input border border-gray-300 bg-white px-2 text-sm tabular-nums"
          />
          <input
            inputMode="decimal"
            placeholder="Longitude (ex. 10,0533)"
            disabled={desactive}
            value={valeur.longitude ?? ""}
            onChange={(e) => onChange({ ...valeur, longitude: e.target.value === "" ? null : (e.target.value as unknown as number) })}
            className="min-h-[40px] w-44 rounded-input border border-gray-300 bg-white px-2 text-sm tabular-nums"
          />
          <button
            type="button"
            disabled={desactive}
            onClick={maPosition}
            className="min-h-[40px] rounded-btn border border-primary bg-white px-3 text-sm font-semibold text-primary hover:bg-primary-light"
          >
            Utiliser ma position
          </button>
        </div>
        {gps && <p className="mt-1 text-xs text-ink-muted">{gps}</p>}
      </div>

      {questionEspeces && (
        <div>
          <p className="text-[13px] font-bold text-ink">{questionEspeces}</p>
          {cases(ESPECES, "especes")}
        </div>
      )}

      {marche && (
        <>
          <div>
            <p className="text-[13px] font-bold text-ink">Jours de marché</p>
            {cases(JOURS.map((j) => ({ code: j, libelle: libelleJour(j) })), "joursMarche")}
          </div>
          <div>
            <p className="text-[13px] font-bold text-ink">Équipements du marché</p>
            {cases(INFRASTRUCTURES_MARCHE, "infrastructures")}
          </div>
        </>
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
          placeholder={marche ? "Ex. : gestionnaire, fréquentation, provenance des animaux…" : "Ex. : capacité, état, remarques…"}
          className="mt-1 w-full rounded-input border border-gray-300 bg-white px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}

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
import { champsRepertoire, type ChampRepertoire, type FicheRepertoire } from "@/lib/repertoire";
import CaptureGps from "@/components/CaptureGps";

export default function InfosActeurForm({
  typeCode,
  valeur,
  onChange,
  desactive = false,
  fiche = null,
  onFiche,
}: {
  typeCode: string;
  valeur: InfosStructurelles;
  onChange: (v: InfosStructurelles) => void;
  desactive?: boolean;
  /** La fiche du répertoire EPIA de la filière (12 novembre 2026) — src/lib/repertoire.ts. */
  fiche?: FicheRepertoire | null;
  onFiche?: (f: FicheRepertoire) => void;
}) {
  const champsFiche = onFiche ? champsRepertoire(typeCode) : [];
  const fixer = (code: string, v: string) => onFiche?.({ ...(fiche ?? {}), [code]: v === "" ? null : v });
  const classeChamp = "mt-0.5 min-h-[40px] w-full rounded-input border border-gray-300 bg-white px-2 text-sm";
  const champ = (c: ChampRepertoire) => {
    const v = fiche?.[c.code];
    const texte = v == null ? "" : String(v);
    const id = `rep-${typeCode}-${c.code}`;
    const options =
      c.genre === "ouiNon" ? [["OUI", "Oui"], ["NON", "Non"]] : c.genre === "sexe" ? [["M", "M"], ["F", "F"]] : c.genre === "choix" ? (c.options ?? []).map((o) => [o, o]) : null;
    return (
      <div key={c.code}>
        <label htmlFor={id} className="text-[12px] font-semibold text-gray-600">{c.libelle}</label>
        {options ? (
          <select id={id} disabled={desactive} value={texte} onChange={(e) => fixer(c.code, e.target.value)} className={classeChamp}>
            <option value="">—</option>
            {options.map(([val, lib]) => (
              <option key={val} value={val}>{lib}</option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type="text"
            inputMode={c.genre === "nombre" ? "decimal" : undefined}
            disabled={desactive}
            value={texte}
            placeholder={c.exemple ?? ""}
            onChange={(e) => fixer(c.code, e.target.value)}
            className={classeChamp}
          />
        )}
      </div>
    );
  };
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
      {champsFiche.length > 0 && (
        <div data-visite="fiche-repertoire">
          <p className="mb-1 text-[13px] font-bold text-ink">Répertoire des acteurs EPIA</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">{champsFiche.map(champ)}</div>
        </div>
      )}

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

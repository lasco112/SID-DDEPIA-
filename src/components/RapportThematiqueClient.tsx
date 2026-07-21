"use client";

/**
 * RapportThematiqueClient.tsx — le DD choisit les données à extraire
 * (espèce, domaine, arrondissement, période) et génère un extrait dans le
 * format de son choix. Fonction additionnelle : ne remplace ni ne modifie
 * le bouton de génération du rapport mensuel classique (présent ailleurs,
 * sur /dd/supervision, /da/saisie).
 */

import { useEffect, useState } from "react";

interface Option {
  code: string;
  libelle: string;
}

interface Periode {
  id: string;
  mois: number;
  annee: number;
  statut: string;
}

interface Options {
  especes: Option[];
  domaines: Option[];
  arrondissements: { code: string; nom: string }[];
  periodes: Periode[];
}

function ChipToggle({ label, actif, onClick }: { label: string; actif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
        actif ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {label}
    </button>
  );
}

function toggleDans(liste: string[], valeur: string): string[] {
  return liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];
}

export default function RapportThematiqueClient() {
  const [options, setOptions] = useState<Options | null>(null);
  const [chargement, setChargement] = useState(true);
  const [especeCodes, setEspeceCodes] = useState<string[]>([]);
  const [domaines, setDomaines] = useState<string[]>([]);
  const [arrondissementCodes, setArrondissementCodes] = useState<string[]>([]);
  const [periodeIds, setPeriodeIds] = useState<string[]>([]);
  const [enCours, setEnCours] = useState<"xlsx" | "docx" | "pdf" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dd/rapports-thematiques/options")
      .then((r) => r.json())
      .then((data: Options) => {
        setOptions(data);
        if (data.periodes[0]) setPeriodeIds([data.periodes[0].id]);
      })
      .finally(() => setChargement(false));
  }, []);

  async function generer(format: "xlsx" | "docx" | "pdf") {
    if (periodeIds.length === 0) {
      setMessage("Sélectionnez au moins une période.");
      return;
    }
    setEnCours(format);
    setMessage(null);
    try {
      const res = await fetch("/api/reports/thematique", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ especeCodes, domaines, arrondissementCodes, periodeIds, format }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? "Échec de la génération.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? `rapport_thematique.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Extraction générée et téléchargée.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setEnCours(null);
    }
  }

  if (chargement) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (!options) return <p className="text-sm text-red-600">Impossible de charger les filtres.</p>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Espèce / animal (optionnel — laisser vide pour toutes)</h3>
        <div className="flex flex-wrap gap-2">
          {options.especes.map((e) => (
            <ChipToggle key={e.code} label={e.libelle} actif={especeCodes.includes(e.code)} onClick={() => setEspeceCodes(toggleDans(especeCodes, e.code))} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Domaine (optionnel — laisser vide pour tous)</h3>
        <div className="flex flex-wrap gap-2">
          {options.domaines.map((d) => (
            <ChipToggle key={d.code} label={d.libelle} actif={domaines.includes(d.code)} onClick={() => setDomaines(toggleDans(domaines, d.code))} />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Arrondissement (optionnel — laisser vide pour tout le département)</h3>
        <div className="flex flex-wrap gap-2">
          {options.arrondissements.map((a) => (
            <ChipToggle
              key={a.code}
              label={a.nom}
              actif={arrondissementCodes.includes(a.code)}
              onClick={() => setArrondissementCodes(toggleDans(arrondissementCodes, a.code))}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Période(s) — au moins une requise</h3>
        <div className="flex flex-wrap gap-2">
          {options.periodes.map((p) => (
            <ChipToggle
              key={p.id}
              label={`${p.mois}/${p.annee}`}
              actif={periodeIds.includes(p.id)}
              onClick={() => setPeriodeIds(toggleDans(periodeIds, p.id))}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={() => generer("xlsx")}
          disabled={enCours !== null}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {enCours === "xlsx" ? "Génération…" : "Générer en Excel (.xlsx)"}
        </button>
        <button
          onClick={() => generer("docx")}
          disabled={enCours !== null}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {enCours === "docx" ? "Génération…" : "Générer en Word (.docx)"}
        </button>
        <button
          onClick={() => generer("pdf")}
          disabled={enCours !== null}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {enCours === "pdf" ? "Génération…" : "Générer en PDF"}
        </button>
      </div>

      {message && <p className="text-sm text-gray-700">{message}</p>}
    </div>
  );
}

"use client";

/**
 * Contrôle sectoriel (CDC §M4) : vue croisée des 6 arrondissements pour
 * chaque tableau de la section du chef connecté, avec surlignage des
 * variations fortes vs M-1 et correction tracée (valeur avant/après + motif).
 */

import { useEffect, useState, useCallback } from "react";

interface TemplateSummary {
  code: string;
  numero: string;
  titre: string;
  type: "MATRICE" | "NOMINATIF" | "EVENEMENT";
  section: { code: string };
}

export default function SectionControleClient() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [periodeId, setPeriodeId] = useState<string | null>(null);
  const [vue, setVue] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{ id: string; famille: string; valeurActuelle: string } | null>(null);
  const [nouvelleValeur, setNouvelleValeur] = useState("");
  const [motif, setMotif] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [rapports, setRapports] = useState<any[]>([]);
  const [rejetMotif, setRejetMotif] = useState<Record<string, string>>({});

  useEffect(() => {
    async function init() {
      const [tplRes, periodeRes] = await Promise.all([fetch("/api/form-templates"), fetch("/api/periodes/active")]);
      if (tplRes.ok) {
        const data = await tplRes.json();
        setTemplates(data.templates);
      }
      if (periodeRes.ok) {
        const data = await periodeRes.json();
        setPeriodeId(data.periode.id);
        const rapportsRes = await fetch(`/api/rapports?periodeId=${data.periode.id}`);
        if (rapportsRes.ok) setRapports((await rapportsRes.json()).rapports);
      }
    }
    init();
  }, []);

  async function rejeterRapport(rapportId: string) {
    const motif = rejetMotif[rapportId];
    if (!motif?.trim()) return;
    const res = await fetch("/api/rapports/rejeter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rapportId, motif }),
    });
    if (res.ok && periodeId) {
      const rapportsRes = await fetch(`/api/rapports?periodeId=${periodeId}`);
      if (rapportsRes.ok) setRapports((await rapportsRes.json()).rapports);
    }
  }

  const chargerVue = useCallback(async (templateCode: string) => {
    if (!periodeId) return;
    setErreur(null);
    setSelection(templateCode);
    const res = await fetch(`/api/section/vue-croisee/${templateCode}?periodeId=${periodeId}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.message ?? "Accès refusé à ce tableau.");
      setVue(null);
      return;
    }
    setVue(await res.json());
  }, [periodeId]);

  async function validerSection() {
    if (!periodeId) return;
    setValidationMessage(null);
    const res = await fetch("/api/validations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodeId, statut: "VALIDE" }),
    });
    const data = await res.json().catch(() => ({}));
    setValidationMessage(res.ok ? "Section validée pour cette période." : data.message ?? "Échec de la validation.");
  }

  async function enregistrerCorrection() {
    if (!correction || !motif.trim()) return;
    const body: any = { famille: correction.famille, saisieId: correction.id, motif };
    if (nouvelleValeur.trim() === "") {
      body.nonRenseigne = true;
      body.motifNonRenseigne = motif;
    } else {
      body.nonRenseigne = false;
      body.valeur = Number(nouvelleValeur);
    }
    const res = await fetch("/api/corrections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok && selection) {
      setCorrection(null);
      setNouvelleValeur("");
      setMotif("");
      chargerVue(selection);
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[23px] font-bold text-primary-dark">Contrôle sectoriel</h1>
          <p className="mt-1 text-sm text-ink-muted">Vue croisée des 6 arrondissements. Cliquez une valeur pour la corriger (motif obligatoire, trace conservée).</p>
        </div>
        <div className="text-right">
          <button onClick={validerSection} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800">
            Valider ma section pour cette période
          </button>
          {validationMessage && <p className="mt-1 text-xs text-gray-600">{validationMessage}</p>}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="border-b px-3 py-2">Arrondissement</th>
              <th className="border-b px-3 py-2">Statut</th>
              <th className="border-b px-3 py-2">Rejeter (motivé)</th>
            </tr>
          </thead>
          <tbody>
            {rapports.map((r) => (
              <tr key={r.id}>
                <td className="border-b px-3 py-2 font-medium">{r.arrondissement.nom}</td>
                <td className="border-b px-3 py-2">{r.statut}</td>
                <td className="border-b px-3 py-2">
                  {(r.statut === "SOUMIS" || r.statut === "CLOTURE") && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Motif"
                        className="w-40 rounded border border-gray-300 px-2 py-1 text-xs"
                        value={rejetMotif[r.id] ?? ""}
                        onChange={(e) => setRejetMotif((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      />
                      <button
                        onClick={() => rejeterRapport(r.id)}
                        disabled={!rejetMotif[r.id]?.trim()}
                        className="rounded bg-red-700 px-2 py-1 text-xs text-white disabled:bg-gray-300"
                      >
                        Rejeter
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.code}
            onClick={() => chargerVue(t.code)}
            className={`rounded-full border px-3 py-1 text-sm ${
              selection === t.code ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {t.numero} {t.titre}
          </button>
        ))}
      </div>

      {erreur && <p className="mt-4 rounded bg-red-50 p-3 text-red-700">{erreur}</p>}

      {vue?.template?.type === "MATRICE" && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border-b px-3 py-2">Indicateur</th>
                {vue.arrondissements.map((a: any) => (
                  <th key={a.code} className="border-b px-3 py-2 text-center">{a.code}</th>
                ))}
                <th className="border-b px-3 py-2 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {vue.template.fields.map((f: any) => (
                <tr key={f.code} className={vue.variationForte[f.code] ? "bg-amber-50" : ""}>
                  <td className="border-b px-3 py-2 font-medium">{f.libelle}</td>
                  {vue.arrondissements.map((a: any) => {
                    const cell = vue.cells[f.code]?.[a.code];
                    return (
                      <td key={a.code} className="border-b px-3 py-2 text-center">
                        <button
                          className="rounded px-2 py-1 hover:bg-blue-50"
                          onClick={() =>
                            cell &&
                            (setCorrection({ id: cell.id, famille: "MATRICE", valeurActuelle: String(cell.valeur ?? "") }),
                            setNouvelleValeur(cell.valeur == null ? "" : String(cell.valeur)),
                            setMotif(""))
                          }
                        >
                          {cell ? (cell.nonRenseigne ? "N/D" : cell.valeur ?? "—") : "—"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="border-b px-3 py-2 text-center font-semibold">
                    {vue.totaux[f.code]}
                    {vue.variationForte[f.code] && <span title="Variation forte vs mois précédent"> ⚠</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vue?.template?.type === "NOMINATIF" && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border-b px-3 py-2">Établissement</th>
                <th className="border-b px-3 py-2">Arrondissement</th>
                <th className="border-b px-3 py-2">Champ</th>
                <th className="border-b px-3 py-2">Valeur</th>
              </tr>
            </thead>
            <tbody>
              {vue.saisiesNominatives.map((s: any) => (
                <tr key={s.id}>
                  <td className="border-b px-3 py-2">{s.etablissement.nom}</td>
                  <td className="border-b px-3 py-2">{s.rapport.arrondissement.code}</td>
                  <td className="border-b px-3 py-2">{s.fieldCode}</td>
                  <td className="border-b px-3 py-2">
                    <button
                      className="rounded px-2 py-1 hover:bg-blue-50"
                      onClick={() => (setCorrection({ id: s.id, famille: "NOMINATIF", valeurActuelle: String(s.valeur ?? "") }), setNouvelleValeur(s.valeur == null ? "" : String(s.valeur)), setMotif(""))}
                    >
                      {s.nonRenseigne ? "N/D" : s.valeur ?? "—"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vue?.template?.type === "EVENEMENT" && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border-b px-3 py-2">Arrondissement</th>
                <th className="border-b px-3 py-2">Détail</th>
              </tr>
            </thead>
            <tbody>
              {vue.evenements.map((e: any) => (
                <tr key={e.id}>
                  <td className="border-b px-3 py-2">{e.rapport.arrondissement.code}</td>
                  <td className="border-b px-3 py-2">
                    <button
                      className="rounded px-2 py-1 text-left hover:bg-blue-50"
                      onClick={() => (setCorrection({ id: e.id, famille: "EVENEMENT", valeurActuelle: JSON.stringify(e.payload) }), setNouvelleValeur(""), setMotif(""))}
                    >
                      {JSON.stringify(e.payload)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {correction && correction.famille !== "EVENEMENT" && (
        <div className="mt-4 max-w-md rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-semibold">Corriger la valeur</h3>
          <p className="text-sm text-gray-600">Valeur actuelle : {correction.valeurActuelle || "N/D"}</p>
          <input
            type="number"
            className="mt-2 w-full rounded border border-gray-300 px-2 py-1"
            placeholder="Nouvelle valeur (laisser vide = non renseigné)"
            value={nouvelleValeur}
            onChange={(e) => setNouvelleValeur(e.target.value)}
          />
          <input
            type="text"
            className="mt-2 w-full rounded border border-gray-300 px-2 py-1"
            placeholder="Motif de la correction (obligatoire)"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button onClick={enregistrerCorrection} disabled={!motif.trim()} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:bg-gray-300">
              Enregistrer
            </button>
            <button onClick={() => setCorrection(null)} className="rounded border border-gray-300 px-3 py-1.5 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

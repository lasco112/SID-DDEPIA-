"use client";

/**
 * Contrôle sectoriel (CDC §M4) : vue croisée des 6 arrondissements pour
 * chaque tableau de la section du chef connecté, avec surlignage des
 * variations fortes vs M-1 et correction tracée (valeur avant/après + motif).
 *
 * Regroupement par catégorie + filtre arrondissement + résolution des codes
 * de référentiel en libellés lisibles (au lieu d'un JSON.stringify brut) —
 * demande explicite du DD (correction n°4) pour le chef des services
 * vétérinaires, qui devait auparavant lire des blocs JSON illisibles pour
 * comprendre ce que chaque DA avait déclaré.
 */

import { useEffect, useState, useCallback, useMemo } from "react";

interface TemplateSummary {
  code: string;
  numero: string;
  titre: string;
  type: "MATRICE" | "NOMINATIF" | "EVENEMENT";
  section: { code: string };
}

const GROUPES_CONNUS: Record<string, string> = {
  T31: "Événements sanitaires",
  T35: "Événements sanitaires",
  T32: "Activités vétérinaires",
  T33: "Activités vétérinaires",
  T21: "Abattages et inspection",
  T34: "Abattages et inspection",
};
const COULEUR_GROUPE: Record<string, string> = {
  "Événements sanitaires": "border-l-danger",
  "Activités vétérinaires": "border-l-info",
  "Abattages et inspection": "border-l-primary",
};

function libelleGroupe(t: TemplateSummary): string {
  return GROUPES_CONNUS[t.code] ?? `Section ${t.numero.split(".")[0]}`;
}

export default function SectionControleClient() {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [periodeId, setPeriodeId] = useState<string | null>(null);
  const [vue, setVue] = useState<any>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [correction, setCorrection] = useState<{ id: string; famille: string; valeurActuelle: string } | null>(null);
  const [nouvelleValeur, setNouvelleValeur] = useState("");
  const [payloadCorrige, setPayloadCorrige] = useState<Record<string, string>>({});
  const [motif, setMotif] = useState("");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [rapports, setRapports] = useState<any[]>([]);
  const [rejetMotif, setRejetMotif] = useState<Record<string, string>>({});
  const [groupesFermes, setGroupesFermes] = useState<Set<string>>(new Set());
  const [arrondissementFiltre, setArrondissementFiltre] = useState<string | null>(null);

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

  const groupes = useMemo(() => {
    const m = new Map<string, TemplateSummary[]>();
    for (const t of templates) {
      const g = libelleGroupe(t);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(t);
    }
    return Array.from(m.entries());
  }, [templates]);

  function toggleGroupe(nom: string) {
    setGroupesFermes((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(nom)) suivant.delete(nom);
      else suivant.add(nom);
      return suivant;
    });
  }

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
    setArrondissementFiltre(null);
    setCorrection(null);
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

  function ouvrirCorrectionValeur(id: string, valeurActuelle: string) {
    setCorrection({ id, famille: vue.template.type, valeurActuelle });
    setNouvelleValeur(valeurActuelle);
    setMotif("");
  }

  function ouvrirCorrectionEvenement(e: any) {
    const schema = (vue.template.schemaEvenement as Array<{ key: string; label: string }>) ?? [];
    const payload: Record<string, string> = {};
    for (const c of schema) payload[c.key] = e.payload?.[c.key] != null ? String(e.payload[c.key]) : "";
    setCorrection({ id: e.id, famille: "EVENEMENT", valeurActuelle: JSON.stringify(e.payload) });
    setPayloadCorrige(payload);
    setMotif("");
  }

  async function enregistrerCorrection() {
    if (!correction || !motif.trim()) return;
    const body: any = { famille: correction.famille, saisieId: correction.id, motif };
    if (correction.famille === "EVENEMENT") {
      const schema = (vue.template.schemaEvenement as Array<{ key: string; label: string; type: string }>) ?? [];
      const payload: Record<string, unknown> = {};
      for (const c of schema) {
        const brut = payloadCorrige[c.key] ?? "";
        payload[c.key] = c.type === "entier" || c.type === "decimal" ? (brut.trim() === "" ? null : Number(brut)) : brut;
      }
      body.payload = payload;
    } else if (nouvelleValeur.trim() === "") {
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
      setPayloadCorrige({});
      setMotif("");
      chargerVue(selection);
    }
  }

  function libelleRef(categorie: string | undefined, code: unknown, cle: string, payload: Record<string, unknown>): string {
    if (code == null || code === "") return "—";
    const str = String(code);
    if (!categorie) return str;
    const base = vue.refLibelle?.[`${categorie}:${str}`] ?? str;
    if (str.endsWith("_AUTRE")) {
      const precision = payload[`${cle}__PRECISION`];
      return precision ? `${base} (${String(precision)})` : base;
    }
    return base;
  }

  const arrondissementsEvenements: string[] = vue?.evenements
    ? Array.from(new Set<string>(vue.evenements.map((e: any) => e.rapport.arrondissement.code))).sort()
    : [];
  const evenementsFiltres: any[] = vue?.evenements
    ? arrondissementFiltre
      ? vue.evenements.filter((e: any) => e.rapport.arrondissement.code === arrondissementFiltre)
      : vue.evenements
    : [];

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[23px] font-bold text-primary-dark">Contrôle sectoriel</h1>
          <p className="mt-1 text-sm text-ink-muted">Vue croisée des 6 arrondissements. Cliquez une valeur pour la corriger (motif obligatoire, trace conservée).</p>
        </div>
        <div className="text-right">
          <button onClick={validerSection} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover">
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
                        className="rounded bg-danger px-2 py-1 text-xs text-white disabled:bg-gray-300"
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

      <div className="mt-6 space-y-3">
        {groupes.map(([nom, liste]) => {
          const ouvert = !groupesFermes.has(nom);
          return (
            <div key={nom} className={`rounded-lg border border-gray-200 bg-white ${COULEUR_GROUPE[nom] ? `border-l-4 ${COULEUR_GROUPE[nom]}` : ""}`}>
              <button
                onClick={() => toggleGroupe(nom)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="font-semibold text-gray-800">
                  {nom} <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">{liste.length}</span>
                </span>
                <span className="text-gray-400">{ouvert ? "▲" : "▼"}</span>
              </button>
              {ouvert && (
                <div className="flex flex-wrap gap-2 px-4 pb-4">
                  {liste.map((t) => (
                    <button
                      key={t.code}
                      onClick={() => chargerVue(t.code)}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        selection === t.code ? "border-blue-700 bg-primary text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t.numero} {t.titre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
                          onClick={() => cell && ouvrirCorrectionValeur(cell.id, String(cell.valeur ?? ""))}
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
              {vue.saisiesNominatives.map((s: any) => {
                const champ = vue.template.fields.find((f: any) => f.code === s.fieldCode);
                return (
                  <tr key={s.id}>
                    <td className="border-b px-3 py-2">{s.etablissement.nom}</td>
                    <td className="border-b px-3 py-2">{s.rapport.arrondissement.code}</td>
                    <td className="border-b px-3 py-2">{champ?.libelle ?? s.fieldCode}</td>
                    <td className="border-b px-3 py-2">
                      <button
                        className="rounded px-2 py-1 hover:bg-blue-50"
                        onClick={() => ouvrirCorrectionValeur(s.id, String(s.valeur ?? ""))}
                      >
                        {s.nonRenseigne ? "N/D" : s.valeurTexte ?? s.valeur ?? "—"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {vue?.template?.type === "EVENEMENT" && (
        <div className="mt-6">
          {arrondissementsEvenements.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                onClick={() => setArrondissementFiltre(null)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${!arrondissementFiltre ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                Tous les arrondissements
              </button>
              {arrondissementsEvenements.map((code) => (
                <button
                  key={code}
                  onClick={() => setArrondissementFiltre(code)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${arrondissementFiltre === code ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  {code}
                </button>
              ))}
            </div>
          )}

          {evenementsFiltres.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Aucun événement déclaré pour ce tableau ce mois-ci.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="border-b px-3 py-2">Arrondissement</th>
                    {(vue.template.schemaEvenement as Array<{ key: string; label: string }>).map((c) => (
                      <th key={c.key} className="border-b px-3 py-2">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evenementsFiltres.map((e: any) => {
                    const schema = vue.template.schemaEvenement as Array<{ key: string; label: string; type: string; ref?: string }>;
                    const payload = e.payload ?? {};
                    return (
                      <tr key={e.id} className="cursor-pointer hover:bg-blue-50" onClick={() => ouvrirCorrectionEvenement(e)}>
                        <td className="border-b px-3 py-2 font-medium">{e.rapport.arrondissement.code}</td>
                        {schema.map((c) => {
                          const raw = payload[c.key];
                          const texte = c.type === "ref" ? libelleRef(c.ref, raw, c.key, payload) : raw == null || raw === "" ? "—" : String(raw);
                          return (
                            <td key={c.key} className="border-b px-3 py-2">{texte}</td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
            <button onClick={enregistrerCorrection} disabled={!motif.trim()} className="rounded bg-primary px-3 py-1.5 text-sm text-white disabled:bg-gray-300">
              Enregistrer
            </button>
            <button onClick={() => setCorrection(null)} className="rounded border border-gray-300 px-3 py-1.5 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}

      {correction && correction.famille === "EVENEMENT" && vue?.template?.schemaEvenement && (
        <div className="mt-4 max-w-lg rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-semibold">Corriger l'événement</h3>
          <div className="mt-2 space-y-2">
            {(vue.template.schemaEvenement as Array<{ key: string; label: string; type: string; ref?: string }>).map((c) => (
              <div key={c.key}>
                <label className="mb-1 block text-xs font-semibold text-gray-600">{c.label}</label>
                {c.type === "ref" ? (
                  <select
                    className="w-full rounded border border-gray-300 px-2 py-1"
                    value={payloadCorrige[c.key] ?? ""}
                    onChange={(e) => setPayloadCorrige((prev) => ({ ...prev, [c.key]: e.target.value }))}
                  >
                    <option value="">—</option>
                    {Object.entries(vue.refLibelle ?? {})
                      .filter(([cle]) => cle.startsWith(`${c.ref}:`))
                      .map(([cle, libelle]) => (
                        <option key={cle} value={cle.split(":")[1]}>{String(libelle)}</option>
                      ))}
                  </select>
                ) : (
                  <input
                    type={c.type === "entier" || c.type === "decimal" ? "number" : "text"}
                    className="w-full rounded border border-gray-300 px-2 py-1"
                    value={payloadCorrige[c.key] ?? ""}
                    onChange={(e) => setPayloadCorrige((prev) => ({ ...prev, [c.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <input
            type="text"
            className="mt-3 w-full rounded border border-gray-300 px-2 py-1"
            placeholder="Motif de la correction (obligatoire)"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button onClick={enregistrerCorrection} disabled={!motif.trim()} className="rounded bg-primary px-3 py-1.5 text-sm text-white disabled:bg-gray-300">
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

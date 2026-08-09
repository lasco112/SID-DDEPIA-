"use client";

/**
 * Écran « Données par arrondissement » du Délégué Départemental (CDC §4, §7).
 *
 * Le DD choisit un arrondissement et un tableau, lit les données telles que le
 * DA les a saisies, et corrige directement une valeur erronée — motif
 * obligatoire, ancienne et nouvelle valeur conservées. Le total départemental
 * reste affiché en permanence à côté de la valeur de l'arrondissement, de
 * sorte que l'on voit toujours ce que le chiffre pèse dans le consolidé.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

interface Arrondissement { id: string; code: string; nom: string }
interface Template { code: string; numero: string; titre: string; type: string; section: string }
interface Periode { id: string; mois: number; annee: number; statut: string }

interface Correction {
  id: string;
  date: string;
  auteur: string;
  fonction: string;
  parLeDD: boolean;
  arrondissement: string;
  tableau: string;
  donnee: string;
  avant: string;
  apres: string;
  motif: string;
}

const MOIS = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export default function DDDonneesClient({
  periode,
  arrondissements,
  templates,
  arrondissementInitial,
}: {
  periode: Periode;
  arrondissements: Arrondissement[];
  templates: Template[];
  arrondissementInitial: string | null;
}) {
  const [arrondissementId, setArrondissementId] = useState<string | null>(arrondissementInitial);
  const [templateCode, setTemplateCode] = useState<string | null>(null);
  const [vue, setVue] = useState<any>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);

  const [cible, setCible] = useState<{ id: string; famille: string; libelle: string; valeurActuelle: string } | null>(null);
  const [nouvelleValeur, setNouvelleValeur] = useState("");
  const [motif, setMotif] = useState("");
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const arrondissement = arrondissements.find((a) => a.id === arrondissementId) ?? null;

  const parSection = useMemo(() => {
    const m = new Map<string, Template[]>();
    for (const t of templates) {
      if (!m.has(t.section)) m.set(t.section, []);
      m.get(t.section)!.push(t);
    }
    return Array.from(m.entries());
  }, [templates]);

  const chargerHistorique = useCallback(async () => {
    const params = new URLSearchParams({ periodeId: periode.id });
    if (templateCode) params.set("templateCode", templateCode);
    if (arrondissementId) params.set("arrondissementId", arrondissementId);
    const res = await fetch(`/api/dd/corrections?${params}`);
    if (res.ok) setCorrections((await res.json()).corrections);
  }, [periode.id, templateCode, arrondissementId]);

  const chargerVue = useCallback(async (code: string) => {
    setChargement(true);
    setErreur(null);
    setCible(null);
    const res = await fetch(`/api/section/vue-croisee/${code}?periodeId=${periode.id}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErreur(data.message ?? "Impossible de charger ce tableau.");
      setVue(null);
    } else {
      setVue(await res.json());
    }
    setChargement(false);
  }, [periode.id]);

  useEffect(() => {
    if (templateCode) chargerVue(templateCode);
  }, [templateCode, chargerVue]);

  useEffect(() => {
    chargerHistorique();
  }, [chargerHistorique]);

  function ouvrirCorrection(id: string, libelle: string, valeurActuelle: string, famille: string) {
    setCible({ id, famille, libelle, valeurActuelle });
    setNouvelleValeur(valeurActuelle);
    setMotif("");
    setMessage(null);
  }

  async function enregistrer() {
    if (!cible || !motif.trim()) return;
    setEnregistrement(true);
    setMessage(null);
    const body: Record<string, unknown> = { famille: cible.famille, saisieId: cible.id, motif };
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
    const data = await res.json().catch(() => ({}));
    setEnregistrement(false);
    if (!res.ok) {
      setMessage(data.message ?? "La correction n'a pas pu être enregistrée.");
      return;
    }
    setCible(null);
    setMessage("Correction enregistrée et tracée.");
    if (templateCode) chargerVue(templateCode);
    chargerHistorique();
  }

  // Colonnes affichées : l'arrondissement choisi seul, sinon les six.
  const colonnes: Arrondissement[] = arrondissement ? [arrondissement] : arrondissements;

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold text-primary-dark">Données par arrondissement</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Période de travail : <strong>{MOIS[periode.mois]} {periode.annee}</strong>. Cliquez une valeur pour la corriger —
        le motif est obligatoire et la modification est conservée dans l'historique.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => setArrondissementId(null)}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${!arrondissementId ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
        >
          Vue départementale
        </button>
        {arrondissements.map((a) => (
          <button
            key={a.id}
            onClick={() => setArrondissementId(a.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${arrondissementId === a.id ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            {a.nom}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {parSection.map(([section, liste]) => (
          <div key={section} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{section}</p>
            <div className="flex flex-wrap gap-2">
              {liste.map((t) => (
                <button
                  key={t.code}
                  onClick={() => setTemplateCode(t.code)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    templateCode === t.code ? "border-blue-700 bg-primary text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {t.numero} {t.titre}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {chargement && <p className="mt-4 text-sm text-gray-500">Chargement du tableau…</p>}
      {erreur && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{erreur}</p>}

      {vue?.template?.type === "MATRICE" && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border-b px-3 py-2">Indicateur</th>
                {colonnes.map((a) => (
                  <th key={a.code} className="border-b px-3 py-2 text-center">{a.nom}</th>
                ))}
                <th className="border-b px-3 py-2 text-center">Total département</th>
              </tr>
            </thead>
            <tbody>
              {vue.template.fields.map((f: any) => (
                <tr key={f.code} className={vue.variationForte?.[f.code] ? "bg-amber-50" : ""}>
                  <td className="border-b px-3 py-2 font-medium">{f.libelle}</td>
                  {colonnes.map((a) => {
                    const cell = vue.cells?.[f.code]?.[a.code];
                    return (
                      <td key={a.code} className="border-b px-3 py-2 text-center">
                        {cell ? (
                          <button
                            className="rounded px-2 py-1 hover:bg-blue-50"
                            onClick={() => ouvrirCorrection(cell.id, `${f.libelle} — ${a.nom}`, String(cell.valeur ?? ""), "MATRICE")}
                          >
                            {cell.nonRenseigne ? "Non renseigné" : cell.valeur ?? "—"}
                          </button>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-b px-3 py-2 text-center font-semibold">
                    {vue.totaux?.[f.code] ?? 0}
                    {vue.variationForte?.[f.code] && <span title="Écart important par rapport au mois précédent"> ⚠</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vue?.template?.type === "NOMINATIF" && (
        <TableNominatif
          vue={vue}
          arrondissement={arrondissement}
          onCorriger={(id, libelle, valeur) => ouvrirCorrection(id, libelle, valeur, "NOMINATIF")}
        />
      )}

      {vue?.template?.type === "EVENEMENT" && <TableEvenement vue={vue} arrondissement={arrondissement} />}

      {cible && (
        <div className="mt-4 max-w-md rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-semibold text-primary-dark">Corriger une donnée</h3>
          <p className="mt-1 text-sm text-gray-700">{cible.libelle}</p>
          <p className="text-sm text-gray-600">Valeur actuelle : {cible.valeurActuelle || "Non renseigné"}</p>
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
            <button
              onClick={enregistrer}
              disabled={!motif.trim() || enregistrement}
              className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-white disabled:bg-gray-300"
            >
              {enregistrement ? "Enregistrement…" : "Enregistrer la correction"}
            </button>
            <button onClick={() => setCible(null)} className="rounded border border-gray-300 px-3 py-1.5 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-gray-700">{message}</p>}

      <section className="mt-8">
        <button
          onClick={() => setHistoriqueOuvert((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left"
        >
          <span className="font-semibold text-gray-800">
            Historique des corrections
            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">{corrections.length}</span>
          </span>
          <span className="text-gray-400">{historiqueOuvert ? "▲" : "▼"}</span>
        </button>

        {historiqueOuvert && (
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 bg-white">
            {corrections.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">Aucune correction sur ce périmètre.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="border-b px-3 py-2">Date</th>
                    <th className="border-b px-3 py-2">Arrondissement</th>
                    <th className="border-b px-3 py-2">Donnée</th>
                    <th className="border-b px-3 py-2">Avant</th>
                    <th className="border-b px-3 py-2">Après</th>
                    <th className="border-b px-3 py-2">Motif</th>
                    <th className="border-b px-3 py-2">Auteur</th>
                  </tr>
                </thead>
                <tbody>
                  {corrections.map((c) => (
                    <tr key={c.id} className={c.parLeDD ? "bg-blue-50/40" : ""}>
                      <td className="border-b px-3 py-2 whitespace-nowrap text-gray-600">
                        {new Date(c.date).toLocaleString("fr-FR")}
                      </td>
                      <td className="border-b px-3 py-2">{c.arrondissement}</td>
                      <td className="border-b px-3 py-2">
                        <span className="text-gray-500">{c.tableau}</span>
                        <br />
                        {c.donnee}
                      </td>
                      <td className="border-b px-3 py-2 text-red-700 line-through">{c.avant}</td>
                      <td className="border-b px-3 py-2 font-semibold text-green-800">{c.apres}</td>
                      <td className="border-b px-3 py-2">{c.motif}</td>
                      <td className="border-b px-3 py-2 whitespace-nowrap">
                        {c.auteur}
                        <br />
                        <span className="text-xs text-gray-500">{c.fonction}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function TableNominatif({
  vue,
  arrondissement,
  onCorriger,
}: {
  vue: any;
  arrondissement: Arrondissement | null;
  onCorriger: (id: string, libelle: string, valeur: string) => void;
}) {
  const lignes = (vue.saisiesNominatives ?? []).filter(
    (s: any) => !arrondissement || s.rapport.arrondissement.code === arrondissement.code
  );
  if (lignes.length === 0) {
    return <p className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Aucune donnée saisie pour ce tableau sur ce périmètre.</p>;
  }
  return (
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
          {lignes.map((s: any) => {
            const champ = vue.template.fields.find((f: any) => f.code === s.fieldCode);
            const libelle = `${s.etablissement.nom} — ${champ?.libelle ?? s.fieldCode}`;
            return (
              <tr key={s.id}>
                <td className="border-b px-3 py-2">{s.etablissement.nom}</td>
                <td className="border-b px-3 py-2">{s.rapport.arrondissement.nom}</td>
                <td className="border-b px-3 py-2">{champ?.libelle ?? s.fieldCode}</td>
                <td className="border-b px-3 py-2">
                  <button
                    className="rounded px-2 py-1 hover:bg-blue-50"
                    onClick={() => onCorriger(s.id, libelle, String(s.valeur ?? ""))}
                  >
                    {s.nonRenseigne ? "Non renseigné" : s.valeurTexte ?? s.valeur ?? "—"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableEvenement({ vue, arrondissement }: { vue: any; arrondissement: Arrondissement | null }) {
  const schema = (vue.template.schemaEvenement as Array<{ key: string; label: string; type: string; ref?: string }>) ?? [];
  const lignes = (vue.evenements ?? []).filter(
    (e: any) => !arrondissement || e.rapport.arrondissement.code === arrondissement.code
  );

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

  if (lignes.length === 0) {
    return <p className="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">Aucun événement déclaré pour ce tableau sur ce périmètre.</p>;
  }

  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="border-b px-3 py-2">Arrondissement</th>
            {schema.map((c) => (
              <th key={c.key} className="border-b px-3 py-2">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((e: any) => {
            const payload = e.payload ?? {};
            return (
              <tr key={e.id}>
                <td className="border-b px-3 py-2 font-medium">{e.rapport.arrondissement.nom}</td>
                {schema.map((c) => {
                  const brut = payload[c.key];
                  const texte = c.type === "ref" ? libelleRef(c.ref, brut, c.key, payload) : brut == null || brut === "" ? "—" : String(brut);
                  return <td key={c.key} className="border-b px-3 py-2">{texte}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

"use client";

/**
 * La liste des fermes et établissements, par arrondissement ou pour tout le
 * département, par spéculation ou toutes — à l'écran, en Excel, à imprimer
 * (demande du Délégué, 19 octobre 2026). Ajoutée AU-DESSUS du registre, sans
 * rien déplacer de ce qui existait.
 *
 * Le DD choisit l'arrondissement ou « Tout le département » ; un DA ou un agent
 * n'a que le sien (le serveur l'impose de toute façon).
 */
import { useState } from "react";

const SPECULATIONS = [
  { code: "TOUS", label: "Toutes les spéculations" },
  { code: "ETAB_COUVOIR", label: "Couvoirs" },
  { code: "ETAB_FERME_PONTE", label: "Fermes de ponte" },
  { code: "ETAB_FERME_CHAIR", label: "Fermes de poulets de chair" },
  { code: "ETAB_PROVENDERIE", label: "Provenderies" },
];

interface Ligne {
  id: string;
  arrondissement: string;
  speculation: string;
  nom: string;
  localite: string;
  proprietaire: string | null;
  telephone: string | null;
  actif: boolean;
}

export default function ListeFermes({
  estDD,
  arrondissements,
}: {
  estDD: boolean;
  arrondissements: { id: string; nom: string }[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const [arrondissementId, setArrondissementId] = useState("TOUS");
  const [typeCode, setTypeCode] = useState("TOUS");
  const [actifs, setActifs] = useState(true);
  const [resultat, setResultat] = useState<{ portee: string; speculation: string; lignes: Ligne[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const parametres = (format?: string) =>
    new URLSearchParams({ typeCode, arrondissementId, ...(actifs ? { actifs: "1" } : {}), ...(format ? { format } : {}) }).toString();

  async function afficher() {
    setErreur(null);
    setOccupe(true);
    try {
      const r = await fetch(`/api/etablissements/liste?${parametres()}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.message ?? "La liste n'a pas pu être établie.");
      setResultat(j);
    } catch (e) {
      setErreur(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "La liste demande du réseau : elle rassemble tout le registre du serveur. Réessayez une fois connecté."
          : e instanceof Error ? e.message : "La liste n'a pas pu être établie."
      );
    } finally {
      setOccupe(false);
    }
  }

  if (!ouvert) {
    return (
      <button
        type="button"
        data-visite="liste-fermes"
        onClick={() => setOuvert(true)}
        className="mb-5 min-h-[44px] rounded-btn border border-primary bg-white px-4 py-2 text-sm font-bold text-primary hover:bg-primary-light"
      >
        Liste des fermes par arrondissement et par spéculation
      </button>
    );
  }

  // Le nom d'une spéculation tel que le serveur l'écrit, et son pluriel.
  const PLURIELS: Record<string, string> = {
    Couvoir: "couvoirs",
    "Ferme de ponte": "fermes de ponte",
    "Ferme de poulets de chair": "fermes de poulets de chair",
    Provenderie: "provenderies",
  };
  const decompte = resultat
    ? Object.keys(PLURIELS)
        .map((s) => ({ label: PLURIELS[s], n: resultat.lignes.filter((l) => l.speculation === s).length }))
        .filter((x) => x.n > 0)
    : [];

  return (
    <section className="mb-6 rounded-card border border-line bg-white p-4 shadow-card print:border-0 print:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <h2 className="text-[16px] font-bold text-primary-dark">Liste des fermes</h2>
        <button type="button" onClick={() => setOuvert(false)} className="text-sm font-semibold text-ink-muted hover:underline">
          Fermer
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3 print:hidden">
        <label className="text-[13px] font-bold text-ink">
          Arrondissement
          {estDD ? (
            <select
              value={arrondissementId}
              onChange={(e) => setArrondissementId(e.target.value)}
              className="mt-1 block min-h-[42px] w-full rounded-input border border-gray-300 bg-white px-2 text-sm font-normal"
            >
              <option value="TOUS">Tout le département</option>
              {arrondissements.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nom}
                </option>
              ))}
            </select>
          ) : (
            <span className="mt-1 block min-h-[42px] rounded-input border border-gray-200 bg-gray-50 px-2 py-2.5 text-sm font-normal text-ink-muted">
              Votre arrondissement
            </span>
          )}
        </label>
        <label className="text-[13px] font-bold text-ink">
          Spéculation
          <select
            value={typeCode}
            onChange={(e) => setTypeCode(e.target.value)}
            className="mt-1 block min-h-[42px] w-full rounded-input border border-gray-300 bg-white px-2 text-sm font-normal"
          >
            {SPECULATIONS.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-ink">
          <input type="checkbox" checked={actifs} onChange={(e) => setActifs(e.target.checked)} className="h-4 w-4" />
          Seulement les établissements en activité
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => void afficher()}
          disabled={occupe}
          className="min-h-[44px] rounded-btn bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {occupe ? "Recherche…" : "Afficher la liste"}
        </button>
        <a
          href={`/api/etablissements/liste?${parametres("xlsx")}`}
          className="flex min-h-[44px] items-center rounded-btn border border-gray-300 bg-white px-4 text-sm font-bold text-primary hover:bg-gray-100"
        >
          Télécharger (Excel)
        </a>
        {resultat && resultat.lignes.length > 0 && (
          <button
            type="button"
            onClick={() => imprimer(resultat)}
            className="min-h-[44px] rounded-btn border border-gray-300 bg-white px-4 text-sm font-bold text-primary hover:bg-gray-100"
          >
            Imprimer
          </button>
        )}
      </div>

      {erreur && <p className="mt-3 rounded-input bg-red-50 p-2 text-sm text-red-800">{erreur}</p>}

      {resultat && (
        <div className="mt-4">
          <p className="text-[15px] font-bold text-nuit">
            {resultat.portee} — {resultat.speculation}
          </p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {resultat.lignes.length} établissement{resultat.lignes.length > 1 ? "s" : ""}
            {decompte.length > 1 && ` : ${decompte.map((d) => `${d.n} ${d.label}`).join(", ")}`}
          </p>
          {resultat.lignes.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">Aucun établissement ne correspond à ce choix.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-card border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="border-b border-gray-200 px-3 py-2 text-right">N°</th>
                    <th className="border-b border-gray-200 px-3 py-2">Arrondissement</th>
                    <th className="border-b border-gray-200 px-3 py-2">Spéculation</th>
                    <th className="border-b border-gray-200 px-3 py-2">Nom</th>
                    <th className="border-b border-gray-200 px-3 py-2">Localité</th>
                    <th className="border-b border-gray-200 px-3 py-2">Propriétaire</th>
                    <th className="border-b border-gray-200 px-3 py-2">Téléphone</th>
                    <th className="border-b border-gray-200 px-3 py-2">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {resultat.lignes.map((l, i) => (
                    <tr key={l.id}>
                      <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums">{i + 1}</td>
                      <td className="border-b border-gray-100 px-3 py-2">{l.arrondissement}</td>
                      <td className="border-b border-gray-100 px-3 py-2">{l.speculation}</td>
                      <td className="border-b border-gray-100 px-3 py-2 font-medium">{l.nom}</td>
                      <td className="border-b border-gray-100 px-3 py-2">{l.localite}</td>
                      <td className="border-b border-gray-100 px-3 py-2">{l.proprietaire ?? "—"}</td>
                      <td className="border-b border-gray-100 px-3 py-2">{l.telephone ?? "—"}</td>
                      <td className="border-b border-gray-100 px-3 py-2">{l.actif ? "En activité" : "Désactivé"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const echapper = (s: string | null) =>
  (s ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** La liste seule, dans une page à part : sans le menu ni le registre autour. */
function imprimer(r: { portee: string; speculation: string; lignes: Ligne[] }) {
  const fenetre = window.open("", "_blank");
  if (!fenetre) return;
  const lignes = r.lignes
    .map(
      (l, i) =>
        `<tr><td style="text-align:right">${i + 1}</td><td>${echapper(l.arrondissement)}</td><td>${echapper(l.speculation)}</td><td><b>${echapper(l.nom)}</b></td><td>${echapper(l.localite)}</td><td>${echapper(l.proprietaire)}</td><td>${echapper(l.telephone)}</td><td>${l.actif ? "En activité" : "Désactivé"}</td></tr>`
    )
    .join("");
  fenetre.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Liste des fermes</title>
<style>body{font-family:Arial,sans-serif;color:#10253f;margin:24px}h1{font-size:18px;margin:0}p{margin:4px 0 14px;color:#4e5a68;font-size:13px}
table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cfc9bc;padding:5px 7px;text-align:left}th{background:#f2efe8}</style></head>
<body><h1>Liste des fermes — ${echapper(r.portee)} — ${echapper(r.speculation)}</h1>
<p>${r.lignes.length} établissement(s) · état au ${new Date().toLocaleDateString("fr-FR")}</p>
<table><thead><tr><th>N°</th><th>Arrondissement</th><th>Spéculation</th><th>Nom</th><th>Localité</th><th>Propriétaire</th><th>Téléphone</th><th>Statut</th></tr></thead><tbody>${lignes}</tbody></table>
<script>window.onload=function(){window.print()}</script></body></html>`);
  fenetre.document.close();
}
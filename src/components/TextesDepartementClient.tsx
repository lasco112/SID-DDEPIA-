"use client";

/**
 * Textes de mon département — les textes PERMANENTS du rapport trimestriel :
 * situation et relief, pédologie, démographie, missions, vision, organisation,
 * introduction, bibliographie ; pour le département et pour chaque
 * arrondissement (décision du Délégué, 14 octobre 2026). Repris à chaque
 * période ; les rédacteurs peuvent encore les adapter pour une période donnée.
 *
 * Deux usages, un seul écran : le DD sur son département ; l'administrateur
 * du système sur le département qu'il choisit.
 */
import { useCallback, useEffect, useState } from "react";

interface Zone {
  cle: string;
  titre: string;
  consigne: string;
  texte: string | null;
  reference: string | null;
  modifieLe: string | null;
}

interface Ecran {
  departement: { id: string; nom: string; nomAvecArticle: string };
  arrondissements: { id: string; nom: string }[];
  portee: string;
  zones: Zone[];
}

function ZoneEditable({ zone, enregistrer }: { zone: Zone; enregistrer: (cle: string, texte: string) => Promise<string | null> }) {
  const [texte, setTexte] = useState(zone.texte ?? zone.reference ?? "");
  const [etat, setEtat] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => setTexte(zone.texte ?? zone.reference ?? ""), [zone.texte, zone.reference]);

  const modifie = texte !== (zone.texte ?? zone.reference ?? "");

  async function envoyer(valeur: string) {
    setEnCours(true);
    setEtat(null);
    const erreur = await enregistrer(zone.cle, valeur);
    setEnCours(false);
    setEtat(erreur ? { ok: false, texte: erreur } : { ok: true, texte: valeur.trim() ? "Enregistré." : "Effacé." });
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4 shadow-card">
      <h3 className="text-[15px] font-bold text-primary-dark">{zone.titre}</h3>
      {zone.consigne && <p className="mt-0.5 text-[12.5px] text-ink-faint">{zone.consigne}</p>}
      {!zone.texte && zone.reference && (
        <p className="mt-2 rounded-md bg-primary-light px-3 py-1.5 text-[12.5px] text-primary-dark">
          Texte de référence du SID, repris dans le rapport tant que vous ne le remplacez pas.
        </p>
      )}
      <textarea
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        rows={Math.min(14, Math.max(4, Math.ceil(texte.length / 110)))}
        placeholder="Rédigez ce texte une fois : il sera repris dans chaque rapport trimestriel."
        className="mt-2 w-full rounded-input border border-line px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-aqua focus:outline-none"
      />
      {/\{[A-Z_]+\}/.test(texte) && (
        <p className="mt-1 text-[12px] text-ink-faint">
          Les mots entre accolades, comme {"{MOIS_DEBUT}"}, sont remplacés dans le rapport par la période et le service concernés.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={enCours || !modifie}
          onClick={() => envoyer(texte)}
          className="min-h-[40px] rounded-btn bg-primary px-4 text-[13.5px] font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {enCours ? "Enregistrement…" : "Enregistrer"}
        </button>
        {zone.texte && (
          <button
            type="button"
            disabled={enCours}
            onClick={() => {
              if (window.confirm(zone.reference ? "Effacer ce texte et revenir au texte de référence du SID ?" : "Effacer ce texte ? La zone restera vide dans le rapport.")) envoyer("");
            }}
            className="min-h-[40px] rounded-btn border border-line px-4 text-[13.5px] text-ink-muted hover:bg-appbg"
          >
            {zone.reference ? "Revenir au texte de référence" : "Effacer"}
          </button>
        )}
        {zone.modifieLe && (
          <span className="text-[12px] text-ink-faint">Modifié le {new Date(zone.modifieLe).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
        )}
        {etat && <span className={`text-[13px] font-semibold ${etat.ok ? "text-green-800" : "text-red-800"}`}>{etat.texte}</span>}
      </div>
    </div>
  );
}

export default function TextesDepartementClient({ administration = false }: { administration?: boolean }) {
  const [departements, setDepartements] = useState<{ id: string; nom: string; actif: boolean }[]>([]);
  const [departementId, setDepartementId] = useState("");
  const [portee, setPortee] = useState("");
  const [ecran, setEcran] = useState<Ecran | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const base = administration ? "/api/admin-systeme/textes" : "/api/dd/textes-departement";

  useEffect(() => {
    if (!administration) return;
    fetch("/api/admin-systeme/departements")
      .then((r) => r.json())
      .then((j) => setDepartements(j.departements ?? []))
      .catch(() => setDepartements([]));
  }, [administration]);

  const charger = useCallback(() => {
    if (administration && !departementId) {
      setEcran(null);
      return;
    }
    const q = new URLSearchParams({ portee, ...(administration ? { departementId } : {}) });
    fetch(`${base}?${q}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message ?? "Échec du chargement.");
        setEcran(j);
        setErreur(null);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : "Échec du chargement."));
  }, [administration, base, departementId, portee]);

  useEffect(charger, [charger]);

  async function enregistrer(cle: string, texte: string): Promise<string | null> {
    const r = await fetch(base, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portee, cle, texte, ...(administration ? { departementId } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return j.message ?? "Échec de l'enregistrement.";
    charger();
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 rounded-card border border-line bg-surface p-4 shadow-card">
        {administration && (
          <label className="text-[13px] font-semibold text-ink">
            Département
            <select
              value={departementId}
              onChange={(e) => {
                setDepartementId(e.target.value);
                setPortee("");
              }}
              className="mt-1 block min-h-[44px] w-64 rounded-input border border-line px-3 text-[14.5px] font-normal"
            >
              <option value="">— Choisir —</option>
              {departements.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
          </label>
        )}
        {ecran && (
          <label className="text-[13px] font-semibold text-ink">
            Textes de
            <select value={portee} onChange={(e) => setPortee(e.target.value)} className="mt-1 block min-h-[44px] w-[26rem] max-w-full rounded-input border border-line px-3 text-[14.5px] font-normal">
              <option value="">La Délégation départementale {ecran.departement.nomAvecArticle}</option>
              {ecran.arrondissements.map((a) => (
                <option key={a.id} value={a.id}>
                  L&apos;arrondissement de {a.nom}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {erreur && <p className="rounded-md bg-red-50 p-3 text-red-800">{erreur}</p>}
      {administration && !departementId && <p className="text-ink-muted">Choisissez un département.</p>}
      {ecran && (
        <div className="space-y-3">
          {ecran.zones.map((z) => (
            <ZoneEditable key={`${ecran.departement.id}|${ecran.portee}|${z.cle}`} zone={z} enregistrer={enregistrer} />
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * Rédaction des zones de texte du rapport trimestriel.
 *
 * Quarante-sept zones : les présenter d'un bloc rendrait l'écran illisible et
 * ferait perdre le rédacteur. Elles sont donc groupées par section du canevas,
 * chaque section repliée par défaut, avec le compte de ce qui reste à écrire —
 * on voit d'un coup d'œil où l'on en est.
 *
 * L'enregistrement se fait à la sortie du champ, jamais à chaque frappe : la
 * connexion est mauvaise sur le terrain, et une requête par caractère
 * remplirait le journal d'activité de bruit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Zone {
  cle: string;
  consigne: string;
  sectionCle: string;
  sectionTitre: string;
  contexte: string;
  fixe: boolean;
  contenu: string;
  /** Le texte de référence, déjà mis à la période ; null s'il n'y en a pas. */
  reference: string | null;
  /** Ce qui a été écrit au trimestre précédent. */
  precedent: string | null;
  /**
   * Le texte rédigé AUTOMATIQUEMENT à partir du rapport (les conclusions). Tant
   * que personne ne le modifie, c'est lui qui part au document, et il suit les
   * chiffres.
   */
  automatique: string | null;
}

interface Etat {
  periode?: { annee: number; trimestre: number; libelle: string };
  pour?: "departement" | "arrondissement";
  zones?: Zone[];
  redigees?: number;
  total?: number;
  message?: string;
}

const TRIMESTRES = [1, 2, 3, 4];

export default function RubriquesTrimestreClient({ annee, trimestre }: { annee: number; trimestre: number }) {
  const [choix, setChoix] = useState({ annee, trimestre });
  const [etat, setEtat] = useState<Etat | null>(null);
  const [chargement, setChargement] = useState(true);
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Ce qui est affiché dans les champs, avant enregistrement.
  const [saisie, setSaisie] = useState<Record<string, string>>({});
  const dernierEnregistre = useRef<Record<string, string>>({});

  const charger = useCallback(async (c: { annee: number; trimestre: number }) => {
    setChargement(true);
    const res = await fetch(`/api/trimestre/rubriques?annee=${c.annee}&trimestre=${c.trimestre}`);
    const data: Etat = await res.json();
    setEtat(data);
    const initial: Record<string, string> = {};
    for (const z of data.zones ?? []) initial[z.cle] = z.contenu;
    setSaisie(initial);
    dernierEnregistre.current = { ...initial };
    setChargement(false);
  }, []);

  useEffect(() => { charger(choix); }, [choix, charger]);

  /** Reprend un texte dans la zone, pour le corriger ; il est enregistré aussitôt. */
  function reprendre(cle: string, texte: string) {
    const actuel = (saisie[cle] ?? "").trim();
    if (actuel && !window.confirm("Remplacer ce qui est déjà écrit dans cette zone ?")) return;
    setSaisie((x) => ({ ...x, [cle]: texte }));
    void enregistrer(cle, texte);
  }

  async function enregistrer(cle: string, force?: string) {
    const contenu = force ?? saisie[cle] ?? "";
    // Rien n'a changé depuis le dernier enregistrement : ne pas écrire pour rien.
    if (contenu === (dernierEnregistre.current[cle] ?? "")) return;
    setEnCours(cle);
    setMessage(null);
    const res = await fetch("/api/trimestre/rubriques", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...choix, cle, contenu }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMessage(d.message ?? "L'enregistrement a échoué.");
    } else {
      dernierEnregistre.current[cle] = contenu;
      setMessage("Enregistré.");
    }
    setEnCours(null);
  }

  const sections = useMemo(() => {
    const m = new Map<string, { titre: string; zones: Zone[] }>();
    for (const z of etat?.zones ?? []) {
      const e = m.get(z.sectionCle) ?? { titre: z.sectionTitre, zones: [] };
      e.zones.push(z);
      m.set(z.sectionCle, e);
    }
    return Array.from(m.entries());
  }, [etat]);

  /** Une zone est prête si elle est écrite, ou rédigée automatiquement, ou couverte par un texte de référence. */
  const prete = (z: Zone) => Boolean((saisie[z.cle] ?? "").trim() || z.automatique || z.reference);
  const redigees = (etat?.zones ?? []).filter(prete).length;
  const total = etat?.total ?? 0;

  if (chargement && !etat) return <p className="text-sm text-ink-muted">Chargement…</p>;
  if (etat?.message && !etat.zones) {
    return <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{etat.message}</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold text-gray-700" htmlFor="annee">Période</label>
        <input
          id="annee"
          type="number"
          className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
          value={choix.annee}
          onChange={(e) => setChoix({ ...choix, annee: Number(e.target.value) })}
        />
        <select
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          value={choix.trimestre}
          onChange={(e) => setChoix({ ...choix, trimestre: Number(e.target.value) })}
        >
          {TRIMESTRES.map((t) => <option key={t} value={t}>{t}ᵉ trimestre</option>)}
        </select>
        <span className="text-sm text-ink-muted">
          {redigees} / {total} zones prêtes
          {etat?.pour === "arrondissement" ? " — pour votre arrondissement" : ""}
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: total ? `${Math.round((redigees / total) * 100)}%` : "0%" }}
        />
      </div>

      <p className="mt-3 text-xs text-ink-muted">
        Une zone laissée vide porte « Néant. » dans le document — sauf une présentation suivie de ses
        tableaux, qui n&apos;écrit rien. Les conclusions sont rédigées automatiquement à partir du rapport :
        relisez-les, et ne les modifiez que si c&apos;est nécessaire.
      </p>

      {sections.map(([cle, s]) => {
        const ouverte = ouvertes.has(cle);
        const faites = s.zones.filter(prete).length;
        return (
          <section key={cle} className="mt-4 rounded-lg border border-gray-200 bg-white">
            <button
              onClick={() => {
                const n = new Set(ouvertes);
                if (n.has(cle)) n.delete(cle); else n.add(cle);
                setOuvertes(n);
              }}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
            >
              <span className="text-sm font-semibold text-primary-dark">{s.titre}</span>
              <span className={`text-xs ${faites === s.zones.length ? "text-green-700" : "text-ink-muted"}`}>
                {faites}/{s.zones.length} {ouverte ? "▾" : "▸"}
              </span>
            </button>

            {ouverte && (
              <div className="border-t border-gray-100 px-4 py-3">
                {s.zones.map((z) => (
                  <div key={z.cle} className="mb-5 last:mb-0">
                    <div className="mb-1 flex flex-wrap items-baseline gap-2">
                      <span className="text-sm font-medium text-gray-800">{z.contexte}</span>
                      {z.fixe && (
                        <span
                          className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600"
                          title="Un texte de référence existe déjà pour cette zone ; ce que vous écrivez ici le remplace pour cette période."
                        >
                          texte de référence disponible
                        </span>
                      )}
                    </div>
                    <p className="mb-1 text-xs italic text-ink-muted">{z.consigne}</p>
                    {(z.reference || z.precedent) && (
                      <div className="mb-1 flex flex-wrap gap-2">
                        {z.reference && (
                          <button
                            type="button"
                            onClick={() => reprendre(z.cle, z.reference!)}
                            className="rounded border border-primary px-2 py-1 text-xs text-primary hover:bg-primary hover:text-white"
                          >
                            Reprendre le texte de référence
                          </button>
                        )}
                        {z.precedent && (
                          <button
                            type="button"
                            onClick={() => reprendre(z.cle, z.precedent!)}
                            className="rounded border border-gray-400 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                          >
                            Reprendre le texte du trimestre précédent
                          </button>
                        )}
                      </div>
                    )}
                    {z.automatique && !(saisie[z.cle] ?? "").trim() ? (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-green-800">
                          Rédigée automatiquement à partir du rapport — elle se met à jour toute seule avec les chiffres.
                        </p>
                        <p className="whitespace-pre-line rounded border border-green-200 bg-green-50 p-3 text-sm text-gray-900">
                          {z.automatique}
                        </p>
                        <button
                          type="button"
                          onClick={() => setSaisie({ ...saisie, [z.cle]: z.automatique! })}
                          className="mt-1 rounded border border-gray-400 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                        >
                          Modifier ce texte
                        </button>
                      </div>
                    ) : (
                    <>
                    {z.automatique && (
                      <button
                        type="button"
                        onClick={() => {
                          setSaisie({ ...saisie, [z.cle]: "" });
                          void enregistrer(z.cle, "");
                        }}
                        className="mb-1 rounded border border-green-700 px-2 py-1 text-xs text-green-800 hover:bg-green-50"
                      >
                        Revenir au texte automatique
                      </button>
                    )}
                    <textarea
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      rows={Math.min(12, Math.max(3, Math.ceil((saisie[z.cle] ?? "").length / 90) + 2))}
                      value={saisie[z.cle] ?? ""}
                      onChange={(e) => setSaisie({ ...saisie, [z.cle]: e.target.value })}
                      onBlur={() => enregistrer(z.cle)}
                      placeholder={
                        z.reference
                          ? "Vide : le texte de référence figurera dans le document. Pour le corriger, cliquez sur « Reprendre le texte de référence »."
                          : "Laissez vide : le document portera « Néant. »."
                      }
                    />
                    </>
                    )}
                    <p className="mt-0.5 text-[11px] text-ink-muted">
                      {enCours === z.cle
                        ? "Enregistrement…"
                        : (saisie[z.cle] ?? "").trim()
                          ? `${(saisie[z.cle] ?? "").trim().length} caractères`
                          : "vide"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {message && <p className="mt-4 text-sm text-gray-700">{message}</p>}
    </div>
  );
}

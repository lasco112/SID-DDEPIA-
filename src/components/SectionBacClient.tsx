"use client";

/**
 * Saisie des treize tableaux du Bureau des Affaires Communes.
 *
 * La grille n'est pas décrite ici : elle vient du canevas, servie par
 * `/api/trimestre/bac`. L'écran et le document imprimé ne peuvent donc pas
 * diverger — si le canevas gagne une ligne, elle apparaît ici sans qu'on touche
 * à ce fichier.
 *
 * Chaque cellule s'enregistre en quittant la case, une par une. Pas de bouton
 * « Enregistrer » global : un tableau de 8 colonnes sur 14 lignes se remplit sur
 * plusieurs jours, et perdre la saisie d'une demi-heure parce qu'on a fermé
 * l'onglet serait inacceptable.
 */

import { useCallback, useEffect, useState } from "react";

interface Grille {
  numero: number;
  titre: string;
  enteteLigne: string;
  colonnes: string[];
  lignes: string[];
  renseignees: number;
}

interface Reponse {
  periode: string;
  tableaux: Grille[];
  valeurs: Record<string, string | number | null>;
  total: number;
  renseignees: number;
}

const cle = (numero: number, ligne: string, colonne: string) => `${numero} ${ligne} ${colonne}`;

/** Le trimestre en cours, à défaut d'un choix explicite. */
function trimestreCourant() {
  const d = new Date();
  return { annee: d.getFullYear(), trimestre: Math.floor(d.getMonth() / 3) + 1 };
}

export default function SectionBacClient() {
  const [{ annee, trimestre }, setPeriode] = useState(trimestreCourant);
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<number | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    const r = await fetch(`/api/trimestre/bac?annee=${annee}&trimestre=${trimestre}`);
    if (!r.ok) {
      setErreur((await r.json().catch(() => ({}))).message ?? "Chargement impossible.");
      return;
    }
    const j = (await r.json()) as Reponse;
    setDonnees(j);
    setValeurs(
      Object.fromEntries(Object.entries(j.valeurs).map(([k, v]) => [k, v == null ? "" : String(v)]))
    );
    setOuvert((o) => o ?? j.tableaux[0]?.numero ?? null);
  }, [annee, trimestre]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function enregistrer(numero: number, ligne: string, colonne: string, valeur: string) {
    const k = cle(numero, ligne, colonne);
    setEnCours(k);
    setErreur(null);
    try {
      const r = await fetch("/api/trimestre/bac", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee, trimestre, numeroTableau: numero, ligne, colonne, valeur }),
      });
      if (!r.ok) {
        setErreur((await r.json().catch(() => ({}))).message ?? "Enregistrement impossible.");
        return;
      }
      // Le compteur de cases remplies suit la saisie, sans recharger la page.
      const { enregistre } = (await r.json()) as { enregistre: boolean };
      setDonnees((d) => {
        if (!d) return d;
        const avait = Boolean(valeurs[k]);
        if (avait === enregistre) return d;
        const delta = enregistre ? 1 : -1;
        return {
          ...d,
          renseignees: d.renseignees + delta,
          tableaux: d.tableaux.map((t) =>
            t.numero === numero ? { ...t, renseignees: t.renseignees + delta } : t
          ),
        };
      });
    } finally {
      setEnCours(null);
    }
  }

  if (erreur && !donnees) {
    return <p className="rounded-md bg-red-50 p-4 text-sm text-red-800">{erreur}</p>;
  }
  if (!donnees) return <p className="text-gray-600">Chargement…</p>;

  return (
    <div className="max-w-full">
      <h1 className="text-2xl font-bold text-primary-dark">Tableaux du Bureau des Affaires Communes</h1>
      <p className="mt-1 max-w-3xl text-gray-600">
        Personnel, infrastructures, matériel, équipements, budget et recettes. Ces tableaux ne sont
        collectés nulle part ailleurs : sans votre saisie, ils sortent vides du rapport trimestriel.
        Chaque case s&apos;enregistre dès que vous la quittez.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-700">
          Année{" "}
          <input
            type="number"
            value={annee}
            onChange={(e) => setPeriode((p) => ({ ...p, annee: Number(e.target.value) }))}
            className="w-24 rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="text-sm text-gray-700">
          Trimestre{" "}
          <select
            value={trimestre}
            onChange={(e) => setPeriode((p) => ({ ...p, trimestre: Number(e.target.value) }))}
            className="rounded border border-gray-300 px-2 py-1"
          >
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <span className="text-sm font-medium text-gray-800">{donnees.periode}</span>
        <span className="text-sm text-gray-600">
          {donnees.renseignees} case(s) renseignée(s) sur {donnees.total}
        </span>
      </div>

      {erreur && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      <div className="mt-6 space-y-3">
        {donnees.tableaux.map((t) => (
          <section key={t.numero} className="rounded-md border border-gray-200">
            <button
              type="button"
              onClick={() => setOuvert((o) => (o === t.numero ? null : t.numero))}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
            >
              <span className="font-medium text-gray-900">
                Tableau n° {t.numero} — {t.titre}
              </span>
              <span className="shrink-0 text-sm text-gray-600">
                {t.renseignees}/{t.lignes.length * t.colonnes.length}
              </span>
            </button>

            {ouvert === t.numero && (
              <div className="overflow-x-auto border-t border-gray-200">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="sticky left-0 z-10 border border-gray-200 bg-gray-50 px-2 py-1 text-left">
                        {t.enteteLigne}
                      </th>
                      {t.colonnes.map((c) => (
                        <th key={c} className="border border-gray-200 px-2 py-1 text-left font-medium">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.lignes.map((l) => (
                      <tr key={l}>
                        <th className="sticky left-0 z-10 border border-gray-200 bg-white px-2 py-1 text-left font-normal text-gray-800">
                          {l}
                        </th>
                        {t.colonnes.map((c) => {
                          const k = cle(t.numero, l, c);
                          return (
                            <td key={c} className="border border-gray-200 p-0">
                              <input
                                value={valeurs[k] ?? ""}
                                onChange={(e) => setValeurs((v) => ({ ...v, [k]: e.target.value }))}
                                onBlur={(e) => void enregistrer(t.numero, l, c, e.target.value)}
                                className={`w-28 px-2 py-1 outline-none focus:bg-amber-50 ${
                                  enCours === k ? "bg-amber-100" : ""
                                }`}
                                aria-label={`${t.enteteLigne} ${l}, ${c}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

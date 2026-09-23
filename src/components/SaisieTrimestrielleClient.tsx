"use client";

/**
 * Saisie trimestrielle des tableaux du canevas (décision D9 du Délégué).
 *
 * La grille n'est pas décrite ici : elle vient du canevas, servie par
 * `/api/trimestre/saisie`, avec l'état de chaque case pour la personne
 * connectée. L'écran et le document imprimé ne peuvent donc pas diverger.
 *
 *  - case blanche : à saisir ;
 *  - case grise : calculée — à partir des rapports mensuels, ou total ;
 *  - case sans cadre : d'un autre ressort, en lecture.
 *
 * Chaque case s'enregistre en la quittant, une par une : un tableau se remplit
 * souvent en plusieurs fois, et perdre une demi-heure de saisie parce qu'on a
 * fermé l'onglet serait inacceptable. Après chaque enregistrement, la grille
 * est relue : les totaux se recalculent sous les yeux.
 */

import { useCallback, useEffect, useState } from "react";

type EtatCase = "saisie" | "calculee" | "total" | "lecture";

interface CaseGrille {
  colonne: string;
  etat: EtatCase;
  affiche: string | null;
  saisi: string | null;
}

interface Grille {
  numero: number;
  titre: string;
  section: string;
  enteteLigne: string;
  lignes: { cle: string; libelle: string; cases: CaseGrille[] }[];
  avertissements: string[];
}

interface ResumeTableau {
  numero: number;
  titre: string;
  section: string;
  saisissables: number;
  renseignees: number;
  automatique: boolean;
}

interface LigneNonClassee {
  tableau: string;
  arrondissement: string;
  ligne: string;
  quantite: number | null;
}

interface Liste {
  periode: string;
  arrondissement: string | null;
  tableaux: ResumeTableau[];
  nonClassees: LigneNonClassee[];
}

/** Le trimestre en cours, à défaut d'un choix explicite. */
function trimestreCourant() {
  const d = new Date();
  return { annee: d.getFullYear(), trimestre: Math.floor(d.getMonth() / 3) + 1 };
}

const cleCase = (ligne: string, colonne: string) => `${ligne} | ${colonne}`;

export default function SaisieTrimestrielleClient({
  titre = "Saisie trimestrielle",
  presentation,
  seulement,
}: {
  titre?: string;
  presentation?: string;
  /** Limite l'écran à certains tableaux — ceux du BAC, pour le chef BAC. */
  seulement?: number[];
}) {
  const [{ annee, trimestre }, setPeriode] = useState(trimestreCourant);
  const [liste, setListe] = useState<Liste | null>(null);
  const [grille, setGrille] = useState<Grille | null>(null);
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [chargementGrille, setChargementGrille] = useState(false);
  const [voirNonClassees, setVoirNonClassees] = useState(false);

  const chargerListe = useCallback(async () => {
    setErreur(null);
    const r = await fetch(`/api/trimestre/saisie?annee=${annee}&trimestre=${trimestre}`);
    if (!r.ok) {
      setErreur((await r.json().catch(() => ({}))).message ?? "Chargement impossible.");
      return;
    }
    const j = (await r.json()) as Liste;
    if (seulement) j.tableaux = j.tableaux.filter((t) => seulement.includes(t.numero));
    setListe(j);
  }, [annee, trimestre, seulement]);

  const chargerGrille = useCallback(
    async (numero: number) => {
      setChargementGrille(true);
      try {
        const r = await fetch(`/api/trimestre/saisie?annee=${annee}&trimestre=${trimestre}&tableau=${numero}`);
        if (!r.ok) {
          setErreur((await r.json().catch(() => ({}))).message ?? "Chargement impossible.");
          return;
        }
        const g = (await r.json()).grille as Grille;
        setGrille(g);
        const v: Record<string, string> = {};
        for (const l of g.lignes) for (const c of l.cases) if (c.etat === "saisie") v[cleCase(l.cle, c.colonne)] = c.saisi ?? "";
        setValeurs(v);
      } finally {
        setChargementGrille(false);
      }
    },
    [annee, trimestre]
  );

  useEffect(() => {
    setGrille(null);
    setOuvert(null);
    void chargerListe();
  }, [chargerListe]);

  function ouvrir(numero: number) {
    if (ouvert === numero) {
      setOuvert(null);
      setGrille(null);
      return;
    }
    setOuvert(numero);
    setGrille(null);
    void chargerGrille(numero);
  }

  async function enregistrer(ligne: string, colonne: string, avant: string | null) {
    if (!grille) return;
    const k = cleCase(ligne, colonne);
    const valeur = valeurs[k] ?? "";
    // Rien n'a changé : pas d'aller-retour inutile, précieux sur une connexion lente.
    if ((avant ?? "") === valeur.trim()) return;
    setEnCours(k);
    setErreur(null);
    try {
      const r = await fetch("/api/trimestre/saisie", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee, trimestre, numeroTableau: grille.numero, ligne, colonne, valeur }),
      });
      if (!r.ok) {
        setErreur((await r.json().catch(() => ({}))).message ?? "Enregistrement impossible.");
        return;
      }
      await Promise.all([chargerGrille(grille.numero), chargerListe()]);
    } catch {
      setErreur("Pas de connexion : la case n'a pas été enregistrée. Réessayez quand le réseau revient.");
    } finally {
      setEnCours(null);
    }
  }

  if (erreur && !liste) return <p className="rounded-md bg-red-50 p-4 text-sm text-red-800">{erreur}</p>;
  if (!liste) return <p className="text-gray-600">Chargement…</p>;

  // Regroupement par section du canevas, dans l'ordre.
  const sections: { titre: string; tableaux: ResumeTableau[] }[] = [];
  for (const t of liste.tableaux) {
    const s = sections.find((x) => x.titre === t.section);
    if (s) s.tableaux.push(t);
    else sections.push({ titre: t.section, tableaux: [t] });
  }
  const total = liste.tableaux.reduce((n, t) => n + t.saisissables, 0);
  const faites = liste.tableaux.reduce((n, t) => n + t.renseignees, 0);

  return (
    <div className="max-w-full">
      <h1 className="text-2xl font-bold text-primary-dark">{titre}</h1>
      <p className="mt-1 max-w-3xl text-gray-600">
        {presentation ??
          (liste.arrondissement
            ? `Ce que les rapports mensuels ne collectent pas, pour l'arrondissement de ${liste.arrondissement}. Vous ne remplissez que sa ligne ; les cases grises se calculent seules.`
            : "Ce que les rapports mensuels ne collectent pas. Les cases grises se calculent seules : à partir du mensuel, ou comme totaux.")}{" "}
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
        <span className="text-sm font-medium text-gray-800">{liste.periode}</span>
        <span className="text-sm text-gray-600">
          {faites} case(s) renseignée(s) sur {total}
        </span>
      </div>

      {erreur && <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}

      {liste.nonClassees.length > 0 && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <button type="button" onClick={() => setVoirNonClassees((v) => !v)} className="font-medium text-amber-900">
            {liste.nonClassees.length} ligne(s) des rapports mensuels ne correspondent à aucune case du canevas
            {voirNonClassees ? " ▲" : " ▼"}
          </button>
          <p className="mt-1 text-amber-900">
            Elles comptent dans les totaux, mais dans aucune colonne. À vous de décider : corriger la saisie
            mensuelle, ou les citer dans le texte du rapport.
          </p>
          {voirNonClassees && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-950">
              {liste.nonClassees.map((l, i) => (
                <li key={i}>
                  {l.arrondissement} · {l.ligne} · {l.quantite ?? "—"} — <span className="italic">{l.tableau}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {sections.length === 0 && (
        <p className="mt-6 text-gray-600">Aucun tableau à saisir pour ce trimestre.</p>
      )}

      <div className="mt-6 space-y-6">
        {sections.map((s) => (
          <div key={s.titre}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{s.titre}</h2>
            <div className="space-y-2">
              {s.tableaux.map((t) => (
                <section key={t.numero} className="rounded-md border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => ouvrir(t.numero)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <span className="font-medium text-gray-900">
                      {t.titre}
                      {t.automatique && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                          en partie calculé
                        </span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 text-sm ${t.renseignees === t.saisissables ? "text-green-700" : "text-gray-600"}`}
                    >
                      {t.renseignees}/{t.saisissables}
                    </span>
                  </button>

                  {ouvert === t.numero && (
                    <div className="border-t border-gray-200 p-3">
                      {chargementGrille && !grille && <p className="text-sm text-gray-600">Chargement…</p>}
                      {grille && grille.numero === t.numero && (
                        <TableauSaisie
                          grille={grille}
                          valeurs={valeurs}
                          enCours={enCours}
                          onChange={(k, v) => setValeurs((x) => ({ ...x, [k]: v }))}
                          onQuitter={enregistrer}
                        />
                      )}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableauSaisie({
  grille,
  valeurs,
  enCours,
  onChange,
  onQuitter,
}: {
  grille: Grille;
  valeurs: Record<string, string>;
  enCours: string | null;
  onChange: (cle: string, valeur: string) => void;
  onQuitter: (ligne: string, colonne: string, avant: string | null) => void;
}) {
  const colonnes = grille.lignes[0]?.cases.map((c) => c.colonne) ?? [];
  const lignesSaisies = grille.lignes.filter((l) => l.cases.some((c) => c.etat === "saisie"));

  const champ = (l: Grille["lignes"][number], c: CaseGrille, large = false) => {
    const k = cleCase(l.cle, c.colonne);
    if (c.etat === "saisie") {
      return (
        <input
          value={valeurs[k] ?? ""}
          onChange={(e) => onChange(k, e.target.value)}
          onBlur={() => onQuitter(l.cle, c.colonne, c.saisi)}
          className={`${large ? "w-full" : "w-28"} rounded-sm border border-gray-300 bg-white px-2 py-1 outline-none focus:border-primary focus:bg-amber-50 ${
            enCours === k ? "bg-amber-100" : ""
          }`}
          aria-label={`${l.libelle}, ${c.colonne}`}
        />
      );
    }
    const titre =
      c.etat === "calculee"
        ? "Calculé à partir des rapports mensuels"
        : c.etat === "total"
          ? "Total calculé"
          : "Hors de votre ressort";
    return (
      <span
        title={titre}
        className={`block px-2 py-1 ${c.etat === "lecture" ? "text-gray-700" : "bg-gray-100 text-gray-600"} ${
          c.etat === "total" ? "italic" : ""
        }`}
      >
        {c.affiche ?? "—"}
      </span>
    );
  };

  return (
    <div>
      {grille.avertissements.length > 0 && (
        <ul className="mb-3 list-disc rounded-md bg-amber-50 p-3 pl-7 text-sm text-amber-900">
          {grille.avertissements.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}

      {/*
        Une seule ligne à remplir — le cas du DA, qui ne saisit que son
        arrondissement : un formulaire vertical se lit mieux sur un téléphone
        qu'un tableau de dix colonnes.
      */}
      {lignesSaisies.length === 1 ? (
        <div className="grid max-w-xl gap-2">
          {lignesSaisies[0].cases.map((c) => (
            <label key={c.colonne} className="grid grid-cols-[1fr,10rem] items-center gap-3 text-sm">
              <span className="text-gray-800">{c.colonne}</span>
              {champ(lignesSaisies[0], c, true)}
            </label>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 z-10 border border-gray-200 bg-gray-50 px-2 py-1 text-left">
                  {grille.enteteLigne}
                </th>
                {colonnes.map((c) => (
                  <th key={c} className="border border-gray-200 px-2 py-1 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grille.lignes.map((l) => (
                <tr key={l.cle}>
                  <th className="sticky left-0 z-10 border border-gray-200 bg-white px-2 py-1 text-left font-normal text-gray-800">
                    {l.libelle || l.cle}
                  </th>
                  {l.cases.map((c) => (
                    <td key={c.colonne} className="border border-gray-200 p-0">
                      {champ(l, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-gray-500">
        Cases grises : calculées automatiquement — à partir des rapports mensuels, ou comme totaux. Elles ne se saisissent pas.
      </p>
    </div>
  );
}

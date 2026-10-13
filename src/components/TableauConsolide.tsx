"use client";

/**
 * Le tableau consolidé, en LECTURE (demande du Délégué, 9 octobre 2026) : les
 * chefs de section valident l'analyse d'un tableau et rédigent les rubriques
 * sans accès à la saisie. Ils lisent ici ce que chaque arrondissement a produit,
 * tel que le rapport l'imprimera — et ce qu'il faut y vérifier : erreurs,
 * manques, écarts, variations fortes, signalements en cours. Toucher un point
 * encadre ses cases. Gardé sur le téléphone une fois lu.
 */
import { useEffect, useMemo, useState } from "react";
import { lireAvecCopie } from "@/lib/trimestreHorsLigne";

interface TableauLu {
  enteteLigne: string;
  colonnes: string[];
  lignes: { cle: string; libelle: string; valeurs: (string | null)[] }[];
}

type Genre = "erreur" | "ecart" | "manque" | "variation" | "observation" | "circuit";

interface Point {
  genre: Genre;
  texte: string;
  cases: { ligne: string; colonne?: string }[];
}

interface Consultation {
  numero: number;
  titre: string;
  axe: "lignes" | "colonnes" | null;
  arrondissement: string | null;
  tableau: TableauLu;
  versions: { arrondissement: string; tableau: TableauLu }[];
  points?: Point[];
  /** Ce compte peut y remplir une case, ou en signaler une : l'écran de saisie lui ouvre ce tableau. */
  modifiable?: boolean;
}

/** Dans l'ordre de gravité : une case marquée deux fois prend la marque la plus grave. */
export const GENRES: Record<Genre, { libelle: string; pluriel: string; puce: string; casse: string }> = {
  erreur: { libelle: "Erreur", pluriel: "erreurs", puce: "bg-red-100 text-red-800", casse: "bg-red-100 text-red-900" },
  ecart: { libelle: "Écart BAC", pluriel: "écarts BAC", puce: "bg-orange-100 text-orange-800", casse: "bg-orange-100 text-orange-900" },
  manque: { libelle: "Manque", pluriel: "manques", puce: "bg-amber-100 text-amber-900", casse: "bg-amber-50 text-amber-800" },
  variation: { libelle: "Variation forte", pluriel: "variations fortes", puce: "bg-yellow-100 text-yellow-900", casse: "bg-yellow-100 text-yellow-900" },
  observation: { libelle: "Signalé", pluriel: "signalés", puce: "bg-blue-100 text-blue-800", casse: "bg-blue-50 text-blue-900" },
  circuit: { libelle: "Transmission", pluriel: "transmission", puce: "bg-gray-100 text-gray-700", casse: "" },
};
const ORDRE: Genre[] = ["erreur", "ecart", "manque", "variation", "observation", "circuit"];

const estTotal = (s: string) => /^\s*(TOTAL|ÉCART)\b/i.test(s);

export default function TableauConsolide({
  username,
  annee,
  trimestre,
  numero,
  ouvert = true,
}: {
  username: string;
  annee: number;
  trimestre: number;
  numero: number;
  /** Déplié d'emblée. */
  ouvert?: boolean;
}) {
  const [c, setC] = useState<Consultation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copieDu, setCopieDu] = useState<string | null>(null);
  /** Le point touché : ses cases sont encadrées. */
  const [focus, setFocus] = useState<number | null>(null);

  useEffect(() => {
    let actif = true;
    setC(null);
    setErreur(null);
    setFocus(null);
    lireAvecCopie<Consultation>(username, `/api/trimestre/analyses?annee=${annee}&trimestre=${trimestre}&tableau=${numero}`)
      .then((lu) => {
        if (!actif) return;
        setC(lu.donnees);
        setCopieDu(lu.copieDu);
      })
      .catch((e) => actif && setErreur(e instanceof Error ? e.message : "Tableau indisponible."));
    return () => {
      actif = false;
    };
  }, [username, annee, trimestre, numero]);

  const points = useMemo(
    () => [...(c?.points ?? [])].sort((a, b) => ORDRE.indexOf(a.genre) - ORDRE.indexOf(b.genre)),
    [c]
  );
  // La marque de chaque case : « ligne|colonne », ou « ligne|* » pour toute la ligne.
  const marques = useMemo(() => {
    const m = new Map<string, Genre>();
    for (const p of [...points].reverse()) for (const k of p.cases) m.set(`${k.ligne}|${k.colonne ?? "*"}`, p.genre);
    return m;
  }, [points]);
  const encadrees = useMemo(
    () => new Set(focus == null ? [] : (points[focus]?.cases ?? []).map((k) => `${k.ligne}|${k.colonne ?? "*"}`)),
    [focus, points]
  );

  function viser(i: number) {
    setFocus(focus === i ? null : i);
    setTimeout(() => document.querySelector(".tc-encadree")?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }), 50);
  }

  const departement = c != null && !c.arrondissement;
  const anomalies = points.filter((p) => p.genre !== "circuit");
  const compte = (g: Genre) => points.filter((p) => p.genre === g).length;

  return (
    <details open={ouvert} data-visite="tableau-consolide" className="rounded-md border border-gray-200 bg-white">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-primary-dark">
        {c?.arrondissement ? "Le tableau de votre arrondissement" : "Le tableau : ce que chaque arrondissement a produit"}
        {departement && anomalies.length > 0 && (
          <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
            {ORDRE.filter((g) => g !== "circuit" && compte(g)).map((g) => (
              <span key={g} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${GENRES[g].puce}`}>
                {compte(g)} {compte(g) > 1 ? GENRES[g].pluriel : GENRES[g].libelle.toLowerCase()}
              </span>
            ))}
          </span>
        )}
      </summary>
      <div className="border-t border-gray-100 p-3">
        {erreur && <p className="text-sm text-red-700">{erreur}</p>}
        {!c && !erreur && <p className="text-sm text-gray-500">Chargement du tableau…</p>}
        {c && (
          <>
            {departement && (
              <div data-visite="points-a-verifier" className="mb-3">
                {anomalies.length === 0 ? (
                  <p className="rounded-md bg-green-50 p-2 text-sm text-green-900">
                    ✓ Rien d&apos;anormal : ni incohérence, ni case attendue vide, ni variation forte sur un an.
                  </p>
                ) : (
                  <p className="mb-1 text-sm font-semibold text-gray-800">
                    À vérifier dans ce tableau ({anomalies.length}) — touchez un point pour voir ses cases :
                  </p>
                )}
                {points.length > 0 && (
                  <ul className="space-y-1">
                    {points.map((p, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => viser(i)}
                          disabled={p.cases.length === 0}
                          className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm ${
                            focus === i ? "bg-gray-100 ring-2 ring-primary" : "hover:bg-gray-50"
                          } disabled:cursor-default`}
                        >
                          <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${GENRES[p.genre].puce}`}>
                            {GENRES[p.genre].libelle}
                          </span>
                          <span className="text-gray-800">{p.texte}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="mb-2 text-xs text-gray-600">
              {c.arrondissement
                ? `Les chiffres de ${c.arrondissement}, tels qu'ils figureront au rapport. Pour les modifier : étape « Compléter les tableaux du trimestre ».`
                : `${
                    c.axe === "lignes"
                      ? "Une ligne par arrondissement ; en gras, les totaux du département."
                      : c.axe === "colonnes"
                        ? "Une colonne par arrondissement ; en gras, les totaux du département."
                        : c.versions.length > 0
                          ? "Version du département ; celle de chaque arrondissement est plus bas."
                          : "Tel qu'il figurera au rapport."
                  } ${
                    c.modifiable
                      ? "Ici, lecture seule : pour remplir une case vide ou faire corriger un chiffre, ouvrez le tableau."
                      : "Lecture seule : un chiffre vous paraît faux ? Prévenez le DD, qui peut le signaler à l'arrondissement."
                  }`}
              {copieDu && ` Copie gardée sur ce téléphone, du ${new Date(copieDu).toLocaleString("fr-FR")}.`}
            </p>
            {c.modifiable && (
              <a
                href={`/trimestre/saisie?tableau=${c.numero}`}
                data-visite="ouvrir-tableau"
                className="mb-2 inline-flex min-h-[44px] items-center rounded-md border border-primary px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-light"
              >
                Compléter une case ou la signaler à l&apos;arrondissement →
              </a>
            )}
            <Grille t={c.tableau} axe={c.axe} marques={marques} encadrees={encadrees} />
            {marques.size > 0 && (
              <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-gray-600">
                Cases colorées :
                {ORDRE.filter((g) => g !== "circuit" && compte(g)).map((g) => (
                  <span key={g} className={`rounded px-1.5 ${GENRES[g].puce}`}>{GENRES[g].libelle.toLowerCase()}</span>
                ))}
              </p>
            )}
            {c.versions.map((v) => (
              <details key={v.arrondissement} className="mt-3 rounded border border-gray-200">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-gray-800">{v.arrondissement}</summary>
                <div className="p-2">
                  <Grille t={v.tableau} axe={null} />
                </div>
              </details>
            ))}
          </>
        )}
      </div>
    </details>
  );
}

function Grille({
  t,
  axe,
  marques = new Map(),
  encadrees = new Set(),
}: {
  t: TableauLu;
  axe: Consultation["axe"];
  marques?: Map<string, Genre>;
  encadrees?: Set<string>;
}) {
  const colTotal = t.colonnes.map(estTotal);
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-20">
          <tr className="bg-gray-50">
            <th className="sticky left-0 z-10 border border-gray-200 bg-gray-50 px-2 py-1 text-left">{t.enteteLigne}</th>
            {t.colonnes.map((col, i) => (
              <th
                key={col}
                className={`border border-gray-200 bg-gray-50 px-2 py-1 text-left ${colTotal[i] ? "font-bold" : axe === "colonnes" ? "font-semibold text-primary-dark" : "font-medium"}`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.lignes.map((l) => {
            const total = estTotal(l.libelle);
            const ligneMarquee = marques.get(`${l.cle}|*`);
            const ligneEncadree = encadrees.has(`${l.cle}|*`);
            return (
              <tr key={l.cle} className={total ? "bg-gray-50 font-bold" : ""}>
                <th
                  className={`sticky left-0 z-10 border border-gray-200 px-2 py-1 text-left ${
                    ligneMarquee ? GENRES[ligneMarquee].casse : total ? "bg-gray-50" : "bg-white"
                  } ${axe === "lignes" && !total ? "font-semibold text-primary-dark" : total ? "" : "font-normal text-gray-800"} ${
                    ligneEncadree ? "tc-encadree outline outline-2 -outline-offset-2 outline-primary" : ""
                  }`}
                >
                  {ligneMarquee && "⚠ "}
                  {l.libelle}
                </th>
                {l.valeurs.map((v, i) => {
                  const k = `${l.cle}|${t.colonnes[i]}`;
                  const m = marques.get(k);
                  const encadree = encadrees.has(k) || ligneEncadree;
                  return (
                    <td
                      key={i}
                      className={`border border-gray-200 px-2 py-1 text-right tabular-nums ${
                        m ? GENRES[m].casse : colTotal[i] ? "bg-gray-50 font-bold" : ""
                      } ${encadree ? "tc-encadree outline outline-2 -outline-offset-2 outline-primary" : ""}`}
                    >
                      {v ?? (m === "manque" ? <span className="text-xs italic">manque</span> : "—")}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

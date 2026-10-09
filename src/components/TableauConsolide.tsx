"use client";

/**
 * Le tableau consolidé, en LECTURE (demande du Délégué, 9 octobre 2026) : les
 * chefs de section valident l'analyse d'un tableau et rédigent les rubriques
 * sans accès à la saisie. Ils lisent ici ce que chaque arrondissement a produit,
 * tel que le rapport l'imprimera. Gardé sur le téléphone une fois lu.
 */
import { useEffect, useState } from "react";
import { lireAvecCopie } from "@/lib/trimestreHorsLigne";

interface TableauLu {
  enteteLigne: string;
  colonnes: string[];
  lignes: { libelle: string; valeurs: (string | null)[] }[];
}

interface Consultation {
  numero: number;
  titre: string;
  axe: "lignes" | "colonnes" | null;
  arrondissement: string | null;
  tableau: TableauLu;
  versions: { arrondissement: string; tableau: TableauLu }[];
}

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

  useEffect(() => {
    let actif = true;
    setC(null);
    setErreur(null);
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

  return (
    <details open={ouvert} data-visite="tableau-consolide" className="rounded-md border border-gray-200 bg-white">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-semibold text-primary-dark">
        {c?.arrondissement ? "Le tableau de votre arrondissement" : "Le tableau : ce que chaque arrondissement a produit"}
      </summary>
      <div className="border-t border-gray-100 p-3">
        {erreur && <p className="text-sm text-red-700">{erreur}</p>}
        {!c && !erreur && <p className="text-sm text-gray-500">Chargement du tableau…</p>}
        {c && (
          <>
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
                  } Lecture seule : un chiffre vous paraît faux ? Prévenez le DD, qui peut le signaler à l'arrondissement.`}
              {copieDu && ` Copie gardée sur ce téléphone, du ${new Date(copieDu).toLocaleString("fr-FR")}.`}
            </p>
            <Grille t={c.tableau} axe={c.axe} />
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

function Grille({ t, axe }: { t: TableauLu; axe: Consultation["axe"] }) {
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
          {t.lignes.map((l, r) => {
            const total = estTotal(l.libelle);
            return (
              <tr key={r} className={total ? "bg-gray-50 font-bold" : ""}>
                <th
                  className={`sticky left-0 z-10 border border-gray-200 px-2 py-1 text-left ${total ? "bg-gray-50" : "bg-white"} ${
                    axe === "lignes" && !total ? "font-semibold text-primary-dark" : total ? "" : "font-normal text-gray-800"
                  }`}
                >
                  {l.libelle}
                </th>
                {l.valeurs.map((v, i) => (
                  <td key={i} className={`border border-gray-200 px-2 py-1 text-right tabular-nums ${colTotal[i] ? "bg-gray-50 font-bold" : ""}`}>
                    {v ?? "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

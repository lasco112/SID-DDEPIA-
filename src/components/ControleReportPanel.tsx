"use client";

/**
 * Contrôle du report automatique vers le tableau 1.2, pour le DD.
 *
 * Remplace la requête SQL qu'il fallait lancer depuis la console de la base :
 * l'application, elle, a accès à la base de production. Lecture seule.
 */

import { useState } from "react";

interface Ligne {
  arrondissement: string;
  ligne: string;
  tableauSource: string;
  valeurActuelle: number | null;
  sommeSource: number;
  nbFermes: number;
  etat: "CONSERVEE" | "REMPLIE" | "COHERENTE" | "ECART";
}

const ETAT = {
  ECART: { texte: "Écart à examiner", classe: "bg-red-100 text-red-800" },
  COHERENTE: { texte: "Cohérente", classe: "bg-green-100 text-green-800" },
  REMPLIE: { texte: "Remplie par le report", classe: "bg-blue-100 text-blue-800" },
  CONSERVEE: { texte: "Conservée (tableau source vide)", classe: "bg-gray-100 text-gray-600" },
};

export default function ControleReportPanel() {
  const [ouvert, setOuvert] = useState(false);
  const [data, setData] = useState<any>(null);
  const [chargement, setChargement] = useState(false);

  async function ouvrir() {
    const suivant = !ouvert;
    setOuvert(suivant);
    if (suivant && !data) {
      setChargement(true);
      const res = await fetch("/api/dd/controle-report");
      if (res.ok) setData(await res.json());
      setChargement(false);
    }
  }

  return (
    <section>
      <button
        onClick={ouvrir}
        className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left"
      >
        <span className="font-semibold text-gray-800">
          Contrôle du report automatique vers le tableau 1.2
          {data?.resume?.ecarts > 0 && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
              {data.resume.ecarts} écart{data.resume.ecarts > 1 ? "s" : ""}
            </span>
          )}
        </span>
        <span className="text-gray-400">{ouvert ? "▲" : "▼"}</span>
      </button>

      {ouvert && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-4">
          {chargement && <p className="text-sm text-gray-500">Contrôle en cours…</p>}
          {data && (
            <>
              <p className="text-sm text-gray-700">
                Les cases « Pondeuse » et « Poulet chair » du tableau 1.2 sont la somme des tableaux 1.4 et 1.5.
                Ce contrôle vérifie leur cohérence pour {data.periode.mois}/{data.periode.annee}. Il ne modifie rien.
              </p>
              <p className="mt-2 text-sm">
                <strong className={data.resume.ecarts > 0 ? "text-red-700" : "text-green-800"}>
                  {data.resume.ecarts} écart{data.resume.ecarts > 1 ? "s" : ""}
                </strong>
                {" · "}
                {data.resume.coherentes} cohérente(s) · {data.resume.remplies} remplie(s) ·{" "}
                {data.resume.conservees} conservée(s)
              </p>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="border-b px-3 py-2">Arrondissement</th>
                      <th className="border-b px-3 py-2">Ligne du 1.2</th>
                      <th className="border-b px-3 py-2 text-right">Valeur actuelle</th>
                      <th className="border-b px-3 py-2 text-right">Somme source</th>
                      <th className="border-b px-3 py-2">État</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.lignes as Ligne[]).map((l, i) => (
                      <tr key={i} className={l.etat === "ECART" ? "bg-red-50/50" : ""}>
                        <td className="border-b px-3 py-2">{l.arrondissement}</td>
                        <td className="border-b px-3 py-2">
                          {l.ligne}
                          <span className="ml-1 text-xs text-gray-500">(tableau {l.tableauSource})</span>
                        </td>
                        <td className="border-b px-3 py-2 text-right">{l.valeurActuelle ?? "—"}</td>
                        <td className="border-b px-3 py-2 text-right">
                          {l.sommeSource}
                          <span className="ml-1 text-xs text-gray-500">({l.nbFermes})</span>
                        </td>
                        <td className="border-b px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ETAT[l.etat].classe}`}>
                            {ETAT[l.etat].texte}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {data.modifications.length > 0 && (
                <>
                  <p className="mt-5 text-sm font-semibold text-gray-800">
                    Valeurs réellement modifiées par le report ({data.modifications.length})
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-gray-700">
                    {data.modifications.map((m: any, i: number) => (
                      <li key={i}>
                        {m.arrondissement} — {m.donnee} :{" "}
                        <span className="text-red-700 line-through">{m.avant ?? "vide"}</span> →{" "}
                        <span className="font-semibold text-green-800">{m.apres}</span>
                        <span className="ml-2 text-xs text-gray-500">
                          {new Date(m.date).toLocaleString("fr-FR")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

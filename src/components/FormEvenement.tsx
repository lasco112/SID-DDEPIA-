"use client";

/**
 * FormEvenement.tsx — rendu générique des tableaux EVENEMENT (CDC §M2) :
 * nombre de lignes variable (foyer, vaccination, mouvement, saisie...),
 * colonnes typées par schemaEvenement, sélecteurs alimentés par le
 * référentiel. Une ligne = un événement = un enregistrement Dexie.
 */

import { useEffect, useState, useCallback } from "react";
import { offlineDB } from "@/lib/dexie";

interface ChampSchema {
  key: string;
  label: string;
  type: "ref" | "texte" | "entier" | "decimal";
  ref?: string;
}
interface TemplateDto {
  code: string;
  titre: string;
  schemaEvenement: ChampSchema[];
}
interface ReferentielItemDto {
  code: string;
  libelle: string;
}

type EvenementLocal = { clientId: string; payload: Record<string, string> };

export default function FormEvenement({
  template,
  periodeId,
  referentiels,
  username,
}: {
  template: TemplateDto;
  periodeId: string;
  referentiels: Record<string, ReferentielItemDto[]>;
  username: string;
}) {
  const [evenements, setEvenements] = useState<EvenementLocal[]>([]);
  const [auteurs, setAuteurs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    async function charger() {
      setLoading(true);
      const locaux = await offlineDB.saisies
        .where("[username+periodeId+templateCode]")
        .equals([username, periodeId, template.code])
        .and((s) => s.famille === "EVENEMENT")
        .toArray();

      let liste: EvenementLocal[] = locaux.map((s) => ({
        clientId: s.clientId,
        payload: (s.payload as Record<string, string>) ?? {},
      }));
      const auteursTrouves: Record<string, string> = {};

      if (liste.length === 0) {
        try {
          const res = await fetch(`/api/rapports/mes-saisies?periodeId=${periodeId}&templateCode=${template.code}`);
          if (res.ok) {
            const data = await res.json();
            const distants: Array<{ clientId: string; payload: Record<string, string>; saisiPar: { nom: string; username: string } | null }> = data.evenement ?? [];
            for (const d of distants) {
              await offlineDB.saisies.put({
                clientId: d.clientId,
                username,
                periodeId,
                templateCode: template.code,
                famille: "EVENEMENT",
                payload: d.payload,
                nonRenseigne: false,
                statutLocal: "SYNCHRONISE",
                updatedAt: new Date().toISOString(),
              });
              if (d.saisiPar) auteursTrouves[d.clientId] = d.saisiPar.username === username ? "Vous" : d.saisiPar.nom;
            }
            liste = distants.map((d) => ({ clientId: d.clientId, payload: d.payload }));
          }
        } catch {
          // hors-ligne
        }
      }

      if (!annule) {
        setEvenements(liste);
        setAuteurs(auteursTrouves);
        setLoading(false);
      }
    }
    charger();
    return () => {
      annule = true;
    };
  }, [template.code, periodeId, username]);

  const majEvenement = useCallback(
    (clientId: string, key: string, value: string) => {
      setEvenements((prev) => {
        const suivant = prev.map((e) => (e.clientId === clientId ? { ...e, payload: { ...e.payload, [key]: value } } : e));
        const courant = suivant.find((e) => e.clientId === clientId);
        if (courant) {
          offlineDB.saisies.put({
            clientId,
            username,
            periodeId,
            templateCode: template.code,
            famille: "EVENEMENT",
            payload: courant.payload,
            nonRenseigne: false,
            statutLocal: "BROUILLON_LOCAL",
            updatedAt: new Date().toISOString(),
          });
        }
        return suivant;
      });
    },
    [periodeId, template.code, username]
  );

  const ajouterLigne = useCallback(() => {
    setEvenements((prev) => [...prev, { clientId: crypto.randomUUID(), payload: {} }]);
  }, []);

  const supprimerLigne = useCallback(async (clientId: string) => {
    await offlineDB.saisies.delete(clientId);
    setEvenements((prev) => prev.filter((e) => e.clientId !== clientId));
  }, []);

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              {template.schemaEvenement.map((c) => (
                <th key={c.key} className="border-b border-gray-200 px-3 py-2">{c.label}</th>
              ))}
              <th className="border-b border-gray-200 px-3 py-2">Saisi par</th>
              <th className="border-b border-gray-200 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {evenements.map((evt) => (
              <tr key={evt.clientId}>
                {template.schemaEvenement.map((c) => (
                  <td key={c.key} className="border-b border-gray-100 px-3 py-2">
                    {c.type === "ref" ? (
                      <select
                        className="w-40 rounded border border-gray-300 px-2 py-1"
                        value={evt.payload[c.key] ?? ""}
                        onChange={(e) => majEvenement(evt.clientId, c.key, e.target.value)}
                      >
                        <option value="">—</option>
                        {(referentiels[c.ref ?? ""] ?? []).map((r) => (
                          <option key={r.code} value={r.code}>{r.libelle}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={c.type === "entier" || c.type === "decimal" ? "number" : "text"}
                        className="w-32 rounded border border-gray-300 px-2 py-1"
                        value={evt.payload[c.key] ?? ""}
                        onChange={(e) => majEvenement(evt.clientId, c.key, e.target.value)}
                      />
                    )}
                  </td>
                ))}
                <td className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">{auteurs[evt.clientId] ?? "—"}</td>
                <td className="border-b border-gray-100 px-3 py-2">
                  <button onClick={() => supprimerLigne(evt.clientId)} className="text-xs text-red-600 hover:underline">
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
            {evenements.length === 0 && (
              <tr>
                <td colSpan={template.schemaEvenement.length + 2} className="px-3 py-4 text-center text-gray-400">
                  Aucun événement saisi ce mois-ci.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button onClick={ajouterLigne} className="rounded border border-blue-700 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">
        + Ajouter un événement
      </button>
    </div>
  );
}

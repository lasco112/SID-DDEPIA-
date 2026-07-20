"use client";

/**
 * FormNominatif.tsx — rendu générique des tableaux NOMINATIF (CDC §M2).
 * Une ligne par établissement actif du registre (arrondissement du DA),
 * une colonne par FormField.
 */

import { useEffect, useState, useCallback } from "react";
import { offlineDB, trouverSaisieNominatif } from "@/lib/dexie";

interface FormFieldDto {
  code: string;
  libelle: string;
  uniteCode: string | null;
  ordre: number;
}
interface EtablissementDto {
  id: string;
  nom: string;
  localite: string;
}
interface TemplateDto {
  code: string;
  titre: string;
  fields: FormFieldDto[];
}

type Cellule = { valeur: string; nonRenseigne: boolean; clientId: string };
type Cle = string; // `${etablissementId}:${fieldCode}`

export default function FormNominatif({
  template,
  periodeId,
  etablissements,
  username,
}: {
  template: TemplateDto;
  periodeId: string;
  etablissements: EtablissementDto[];
  username: string;
}) {
  const [cellules, setCellules] = useState<Record<Cle, Cellule>>({});
  const [auteurs, setAuteurs] = useState<Record<Cle, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    async function charger() {
      setLoading(true);
      const initial: Record<Cle, Cellule> = {};
      const auteursInitial: Record<Cle, string> = {};

      let serveur: Array<{ etablissementId: string; fieldCode: string; valeur: string | null; nonRenseigne: boolean; clientId: string; saisiPar: { nom: string; username: string } | null }> = [];
      try {
        const res = await fetch(`/api/rapports/mes-saisies?periodeId=${periodeId}&templateCode=${template.code}`);
        if (res.ok) serveur = (await res.json()).nominatif ?? [];
      } catch {
        // hors-ligne
      }
      for (const s of serveur) {
        if (s.saisiPar) auteursInitial[`${s.etablissementId}:${s.fieldCode}`] = s.saisiPar.username === username ? "Vous" : s.saisiPar.nom;
      }

      for (const etab of etablissements) {
        for (const f of template.fields) {
          const cle = `${etab.id}:${f.code}`;
          const local = await trouverSaisieNominatif(username, periodeId, template.code, etab.id, f.code);
          if (local) {
            initial[cle] = { valeur: local.valeur == null ? "" : String(local.valeur), nonRenseigne: local.nonRenseigne, clientId: local.clientId };
            continue;
          }
          const distant = serveur.find((s) => s.etablissementId === etab.id && s.fieldCode === f.code);
          if (distant) {
            await offlineDB.saisies.put({
              clientId: distant.clientId,
              username,
              periodeId,
              templateCode: template.code,
              famille: "NOMINATIF",
              etablissementId: etab.id,
              fieldCode: f.code,
              valeur: distant.valeur == null ? null : Number(distant.valeur),
              nonRenseigne: distant.nonRenseigne,
              statutLocal: "SYNCHRONISE",
              updatedAt: new Date().toISOString(),
            });
            initial[cle] = { valeur: distant.valeur == null ? "" : String(distant.valeur), nonRenseigne: distant.nonRenseigne, clientId: distant.clientId };
          } else {
            initial[cle] = { valeur: "", nonRenseigne: false, clientId: crypto.randomUUID() };
          }
        }
      }
      if (!annule) {
        setCellules(initial);
        setAuteurs(auteursInitial);
        setLoading(false);
      }
    }
    charger();
    return () => {
      annule = true;
    };
  }, [template.code, template.fields, periodeId, etablissements, username]);

  const sauvegarder = useCallback(
    async (etablissementId: string, fieldCode: string, patch: Partial<Cellule>) => {
      const cle = `${etablissementId}:${fieldCode}`;
      setCellules((prev) => {
        const courante = prev[cle] ?? { valeur: "", nonRenseigne: false, clientId: crypto.randomUUID() };
        const nouvelle = { ...courante, ...patch };
        const numVal = nouvelle.valeur.trim() === "" ? null : Number(nouvelle.valeur);

        offlineDB.saisies.put({
          clientId: nouvelle.clientId,
          username,
          periodeId,
          templateCode: template.code,
          famille: "NOMINATIF",
          etablissementId,
          fieldCode,
          valeur: nouvelle.nonRenseigne ? null : numVal,
          nonRenseigne: nouvelle.nonRenseigne,
          statutLocal: "BROUILLON_LOCAL",
          updatedAt: new Date().toISOString(),
        });

        return { ...prev, [cle]: nouvelle };
      });
    },
    [periodeId, template.code, username]
  );

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>;
  if (etablissements.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Aucun établissement actif de ce type n'est enregistré pour votre arrondissement. Contactez le DD pour compléter le registre.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="border-b border-gray-200 px-4 py-2">Établissement</th>
            {template.fields.map((f) => (
              <th key={f.code} className="border-b border-gray-200 px-4 py-2">{f.libelle}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {etablissements.map((etab) => (
            <tr key={etab.id}>
              <td className="border-b border-gray-100 px-4 py-2 font-medium">
                {etab.nom}
                <div className="text-xs text-gray-500">{etab.localite}</div>
              </td>
              {template.fields.map((f) => {
                const cle = `${etab.id}:${f.code}`;
                const cellule = cellules[cle];
                return (
                  <td key={f.code} className="border-b border-gray-100 px-4 py-2">
                    <input
                      type="number"
                      className="w-24 rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"
                      value={cellule?.nonRenseigne ? "" : cellule?.valeur ?? ""}
                      disabled={cellule?.nonRenseigne}
                      onChange={(e) => sauvegarder(etab.id, f.code, { valeur: e.target.value })}
                    />
                    <label className="mt-1 flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={cellule?.nonRenseigne ?? false}
                        onChange={(e) => sauvegarder(etab.id, f.code, { nonRenseigne: e.target.checked, valeur: "" })}
                      />
                      N/D
                    </label>
                    {auteurs[cle] && <div className="mt-0.5 text-[11px] text-gray-400">{auteurs[cle]}</div>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

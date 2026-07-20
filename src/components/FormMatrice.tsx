"use client";

/**
 * FormMatrice.tsx — rendu générique des tableaux MATRICE (CDC §M2).
 * Une ligne par FormField (l'arrondissement est implicite : celui du DA
 * connecté). Écriture Dexie au fil de la frappe ; `0 ≠ non renseigné`.
 * Les champs `typeValeur === "TEXTE"` (ex. T21_LIEUX) utilisent un champ
 * texte libre et ne passent jamais par `Number()`.
 */

import { useEffect, useState, useCallback } from "react";
import { offlineDB, trouverSaisieMatrice } from "@/lib/dexie";

interface FormFieldDto {
  id: string;
  code: string;
  libelle: string;
  uniteCode: string | null;
  uniteLibelle?: string;
  typeValeur: string;
  ordre: number;
}

interface TemplateDto {
  id: string;
  code: string;
  titre: string;
  numero: string;
  fields: FormFieldDto[];
}

type Ligne = {
  valeur: string;
  nonRenseigne: boolean;
  motifNonRenseigne: string;
  clientId: string;
  savedAt: number | null;
};

export default function FormMatrice({ template, periodeId, username }: { template: TemplateDto; periodeId: string; username: string }) {
  const [lignes, setLignes] = useState<Record<string, Ligne>>({});
  const [auteurs, setAuteurs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let annule = false;
    async function charger() {
      setLoading(true);
      const initial: Record<string, Ligne> = {};
      const auteursInitial: Record<string, string> = {};

      // 1. Valeurs déjà synchronisées côté serveur (hydrate si Dexie est vide)
      let serveur: Array<{ fieldCode: string; valeur: string | null; valeurTexte: string | null; nonRenseigne: boolean; motifNonRenseigne: string | null; clientId: string; saisiPar: { nom: string; username: string } | null }> = [];
      try {
        const res = await fetch(`/api/rapports/mes-saisies?periodeId=${periodeId}&templateCode=${template.code}`);
        if (res.ok) {
          const data = await res.json();
          serveur = data.matrice ?? [];
        }
      } catch {
        // hors-ligne : on continue avec le seul contenu local
      }
      for (const s of serveur) {
        if (s.saisiPar) auteursInitial[s.fieldCode] = s.saisiPar.username === username ? "Vous" : s.saisiPar.nom;
      }

      for (const f of template.fields) {
        const texte = f.typeValeur === "TEXTE";
        const local = await trouverSaisieMatrice(username, periodeId, template.code, f.code);
        if (local) {
          initial[f.code] = {
            valeur: texte ? local.valeurTexte ?? "" : local.valeur == null ? "" : String(local.valeur),
            nonRenseigne: local.nonRenseigne,
            motifNonRenseigne: local.motifNonRenseigne ?? "",
            clientId: local.clientId,
            savedAt: Date.now(),
          };
          continue;
        }
        const distant = serveur.find((s) => s.fieldCode === f.code);
        if (distant) {
          const clientId = distant.clientId;
          await offlineDB.saisies.put({
            clientId,
            username,
            periodeId,
            templateCode: template.code,
            famille: "MATRICE",
            fieldCode: f.code,
            valeur: texte ? null : distant.valeur == null ? null : Number(distant.valeur),
            valeurTexte: texte ? distant.valeurTexte ?? null : null,
            nonRenseigne: distant.nonRenseigne,
            motifNonRenseigne: distant.motifNonRenseigne,
            statutLocal: "SYNCHRONISE",
            updatedAt: new Date().toISOString(),
          });
          initial[f.code] = {
            valeur: texte ? distant.valeurTexte ?? "" : distant.valeur == null ? "" : String(distant.valeur),
            nonRenseigne: distant.nonRenseigne,
            motifNonRenseigne: distant.motifNonRenseigne ?? "",
            clientId,
            savedAt: Date.now(),
          };
        } else {
          initial[f.code] = { valeur: "", nonRenseigne: false, motifNonRenseigne: "", clientId: crypto.randomUUID(), savedAt: null };
        }
      }
      if (!annule) {
        setLignes(initial);
        setAuteurs(auteursInitial);
        setLoading(false);
      }
    }
    charger();
    return () => {
      annule = true;
    };
  }, [template.code, template.fields, periodeId, username]);

  const sauvegarder = useCallback(
    async (fieldCode: string, texte: boolean, patch: Partial<Ligne>) => {
      setLignes((prev) => {
        const courante = prev[fieldCode] ?? { valeur: "", nonRenseigne: false, motifNonRenseigne: "", clientId: crypto.randomUUID(), savedAt: null };
        const nouvelle = { ...courante, ...patch };

        const numVal = nouvelle.valeur.trim() === "" ? null : Number(nouvelle.valeur);
        offlineDB.saisies.put({
          clientId: nouvelle.clientId,
          username,
          periodeId,
          templateCode: template.code,
          famille: "MATRICE",
          fieldCode,
          valeur: texte || nouvelle.nonRenseigne ? null : numVal,
          valeurTexte: texte && !nouvelle.nonRenseigne ? (nouvelle.valeur.trim() === "" ? null : nouvelle.valeur) : null,
          nonRenseigne: nouvelle.nonRenseigne,
          motifNonRenseigne: nouvelle.nonRenseigne ? nouvelle.motifNonRenseigne || null : null,
          statutLocal: "BROUILLON_LOCAL",
          updatedAt: new Date().toISOString(),
        });

        return { ...prev, [fieldCode]: { ...nouvelle, savedAt: Date.now() } };
      });
    },
    [periodeId, template.code, username]
  );

  if (loading) return <p className="text-sm text-gray-500">Chargement…</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="border-b border-gray-200 px-4 py-2">Indicateur</th>
            <th className="border-b border-gray-200 px-4 py-2">Unité</th>
            <th className="border-b border-gray-200 px-4 py-2">Valeur</th>
            <th className="border-b border-gray-200 px-4 py-2">Non renseigné</th>
            <th className="border-b border-gray-200 px-4 py-2">Saisi par</th>
          </tr>
        </thead>
        <tbody>
          {template.fields.map((f) => {
            const ligne = lignes[f.code];
            const texte = f.typeValeur === "TEXTE";
            return (
              <tr key={f.code} className="align-top">
                <td className="border-b border-gray-100 px-4 py-2 font-medium">{f.libelle}</td>
                <td className="border-b border-gray-100 px-4 py-2 text-gray-500">{f.uniteLibelle ?? ""}</td>
                <td className="border-b border-gray-100 px-4 py-2">
                  <input
                    type={texte ? "text" : "number"}
                    className={texte ? "w-56 rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100" : "w-28 rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100"}
                    value={ligne?.nonRenseigne ? "" : ligne?.valeur ?? ""}
                    disabled={ligne?.nonRenseigne}
                    onChange={(e) => sauvegarder(f.code, texte, { valeur: e.target.value })}
                  />
                </td>
                <td className="border-b border-gray-100 px-4 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={ligne?.nonRenseigne ?? false}
                      onChange={(e) => sauvegarder(f.code, texte, { nonRenseigne: e.target.checked, valeur: "" })}
                    />
                    <span>N/D</span>
                  </label>
                  {ligne?.nonRenseigne && (
                    <input
                      type="text"
                      placeholder="Motif obligatoire"
                      className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
                      value={ligne.motifNonRenseigne}
                      onChange={(e) => sauvegarder(f.code, texte, { motifNonRenseigne: e.target.value })}
                    />
                  )}
                </td>
                <td className="border-b border-gray-100 px-4 py-2 text-xs text-gray-500">{auteurs[f.code] ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

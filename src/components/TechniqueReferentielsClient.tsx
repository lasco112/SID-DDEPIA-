"use client";

import { useEffect, useState, useCallback } from "react";

interface Item {
  id: string;
  categorie: string;
  code: string;
  libelle: string;
  libelleEn: string | null;
  actif: boolean;
  enAttenteValidationDD: boolean;
}

const CATEGORIES_STRUCTURELLES = ["ESPECE", "VOLAILLE", "ESPECE_HALIEUTIQUE"];

const CATEGORIES = [
  { code: "ESPECE", label: "Espèces (⚙ validation DD)" },
  { code: "VOLAILLE", label: "Volailles (⚙ validation DD)" },
  { code: "CATEGORIE_ANIMALE", label: "Catégories animales (commercialisation)" },
  { code: "MALADIE", label: "Maladies" },
  { code: "VACCIN", label: "Vaccins" },
  { code: "ACTE_VETERINAIRE", label: "Actes vétérinaires" },
  { code: "MOTIF_SAISIE", label: "Motifs de saisie" },
  { code: "ESPECE_HALIEUTIQUE", label: "Espèces halieutiques (⚙ validation DD)" },
  { code: "UNITE", label: "Unités" },
  { code: "TYPE_ETABLISSEMENT", label: "Types d'établissement" },
];

export default function TechniqueReferentielsClient() {
  const [categorie, setCategorie] = useState(CATEGORIES[0].code);
  const [items, setItems] = useState<Item[]>([]);
  const [chargement, setChargement] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState({ code: "", libelle: "", libelleEn: "" });
  const [ajout, setAjout] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    const res = await fetch(`/api/technique/referentiels?categorie=${categorie}`);
    if (res.ok) setItems((await res.json()).items);
    setChargement(false);
  }, [categorie]);

  useEffect(() => {
    charger();
  }, [charger]);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!nouveau.code.trim() || !nouveau.libelle.trim()) {
      setMessage("Code et libellé requis.");
      return;
    }
    setAjout(true);
    try {
      const res = await fetch("/api/technique/referentiels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categorie, ...nouveau }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec de la création.");
      setNouveau({ code: "", libelle: "", libelleEn: "" });
      setMessage(data.message ?? `« ${data.item.libelle} » ajouté.`);
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setAjout(false);
    }
  }

  async function modifier(id: string, patch: Partial<Item>) {
    setMessage(null);
    try {
      const res = await fetch(`/api/technique/referentiels/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec de la modification.");
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.code}
            onClick={() => setCategorie(c.code)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              categorie === c.code ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {CATEGORIES_STRUCTURELLES.includes(categorie) && (
        <p className="mb-3 rounded bg-amber-50 p-3 text-sm text-amber-800">
          Cette catégorie crée de nouvelles colonnes dans le rapport officiel : tout ajout reste{" "}
          <strong>en attente de validation du DD</strong> avant de prendre effet dans la saisie et les rapports.
        </p>
      )}
      <form onSubmit={ajouter} className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Ajouter un item</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input
            placeholder="Code stable (ex : MAL_NOUVELLE)"
            value={nouveau.code}
            onChange={(e) => setNouveau({ ...nouveau, code: e.target.value.toUpperCase() })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Libellé (français)"
            value={nouveau.libelle}
            onChange={(e) => setNouveau({ ...nouveau, libelle: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Libellé anglais (optionnel)"
            value={nouveau.libelleEn}
            onChange={(e) => setNouveau({ ...nouveau, libelleEn: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={ajout}
          className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {ajout ? "Ajout…" : "Ajouter"}
        </button>
      </form>

      {message && <p className="mb-3 text-sm text-gray-700">{message}</p>}

      {chargement ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border-b border-gray-200 px-3 py-2">Code</th>
                <th className="border-b border-gray-200 px-3 py-2">Libellé</th>
                <th className="border-b border-gray-200 px-3 py-2">Libellé (EN)</th>
                <th className="border-b border-gray-200 px-3 py-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <LigneItem key={item.id} item={item} onModifier={(patch) => modifier(item.id, patch)} />
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-gray-400">
                    Aucun item dans cette catégorie.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LigneItem({ item, onModifier }: { item: Item; onModifier: (patch: Partial<Item>) => void }) {
  const [libelle, setLibelle] = useState(item.libelle);
  const [libelleEn, setLibelleEn] = useState(item.libelleEn ?? "");

  const champCommun =
    "w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none disabled:text-gray-400";

  return (
    <tr className={!item.actif ? "bg-gray-50 text-gray-400" : ""}>
      <td className="border-b border-gray-100 px-3 py-2 font-mono text-xs">{item.code}</td>
      <td className="border-b border-gray-100 px-3 py-2">
        <input value={libelle} disabled={!item.actif} onChange={(e) => setLibelle(e.target.value)} onBlur={() => libelle !== item.libelle && onModifier({ libelle })} className={champCommun} />
      </td>
      <td className="border-b border-gray-100 px-3 py-2">
        <input
          value={libelleEn}
          disabled={!item.actif}
          onChange={(e) => setLibelleEn(e.target.value)}
          onBlur={() => libelleEn !== (item.libelleEn ?? "") && onModifier({ libelleEn })}
          className={champCommun}
        />
      </td>
      <td className="border-b border-gray-100 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {item.enAttenteValidationDD && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">En attente DD</span>
          )}
          <button
            onClick={() => onModifier({ actif: !item.actif })}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.actif ? "bg-green-100 text-green-800 hover:bg-red-100 hover:text-red-800" : "bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-800"}`}
          >
            {item.actif ? "Actif — désactiver" : "Inactif — réactiver"}
          </button>
        </div>
      </td>
    </tr>
  );
}

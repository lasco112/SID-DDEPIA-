"use client";

/**
 * EtablissementsClient.tsx — gestion du registre des établissements NOMINATIF
 * (CDC §B.5.3) : ajout, correction du nom/localité/propriétaire/téléphone,
 * désactivation (conserve l'historique) et suppression définitive.
 *
 * Les trois rôles qui saisissent (DD, DA, agent de saisie) peuvent ajouter et
 * supprimer — élargissement demandé par le DD, l'agent créant lui-même ses
 * établissements pendant la saisie doit pouvoir corriger un doublon sans
 * remonter la hiérarchie. Le DA et l'agent restent cloisonnés sur LEUR
 * arrondissement (le serveur le revérifie), seul le DD choisit parmi les six.
 */

import { useEffect, useState, useCallback } from "react";
import type { EtablissementOffline } from "@/lib/dexie";
import {
  listerEtablissements,
  creerEtablissement,
  modifierEtablissement,
  supprimerEtablissement,
  synchroniserEtablissements,
  nombreOperationsEnAttente,
} from "@/lib/etablissementsLocal";

interface Arrondissement {
  id: string;
  code: string;
  nom: string;
}

/** Même forme que la table locale : cet écran lit et écrit désormais Dexie. */
type Etablissement = EtablissementOffline;

const TYPES = [
  { code: "ETAB_COUVOIR", label: "Couvoirs — Tableau 1.3" },
  { code: "ETAB_FERME_PONTE", label: "Fermes de ponte — Tableau 1.4" },
  { code: "ETAB_FERME_CHAIR", label: "Fermes de poulets de chair — Tableau 1.5" },
  { code: "ETAB_PROVENDERIE", label: "Provenderies — Tableau 2.3" },
];

export default function EtablissementsClient({
  role,
  arrondissements,
  ownArrondissementId,
}: {
  role: "DA" | "DD" | "AGENT_SAISIE";
  arrondissements: Arrondissement[];
  ownArrondissementId: string | null;
}) {
  // Seul le DD choisit l'arrondissement : le DA et l'agent de saisie sont
  // cloisonnés sur le leur (§A.2), le serveur le revérifie de son côté.
  const estDD = role === "DD";
  const [arrondissementId, setArrondissementId] = useState(
    estDD ? arrondissements[0]?.id ?? "" : ownArrondissementId ?? ""
  );
  const [typeCode, setTypeCode] = useState(TYPES[0].code);
  const [liste, setListe] = useState<Etablissement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState({ nom: "", localite: "", proprietaire: "", telephone: "" });
  const [ajout, setAjout] = useState(false);
  const [aSupprimer, setASupprimer] = useState<{ id: string; nom: string } | null>(null);

  // Lecture depuis la base LOCALE de l'appareil (remplie par /api/bootstrap),
  // jamais depuis le réseau : la page reste consultable et modifiable sans
  // connexion. Une synchronisation est tentée en arrière-plan si le réseau
  // est là, puis la liste est relue.
  const charger = useCallback(async () => {
    if (!arrondissementId) return;
    setLoading(true);
    setListe(await listerEtablissements(typeCode, arrondissementId));
    setLoading(false);
  }, [typeCode, arrondissementId]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Rattrapage : les opérations faites hors ligne repartent dès que le réseau
  // revient, puis la liste affichée est relue.
  useEffect(() => {
    async function rattraper() {
      const { envoyees } = await synchroniserEtablissements();
      if (envoyees > 0) await charger();
    }
    void rattraper();
    window.addEventListener("online", rattraper);
    return () => window.removeEventListener("online", rattraper);
  }, [charger]);

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!nouveau.nom.trim() || !nouveau.localite.trim()) {
      setMessage("Nom et localité requis.");
      return;
    }
    setAjout(true);
    try {
      const cree = await creerEtablissement({ typeCode, arrondissementId, ...nouveau });
      setNouveau({ nom: "", localite: "", proprietaire: "", telephone: "" });
      // On se fie au RÉSULTAT réel, pas à navigator.onLine : celui-ci reste
      // « en ligne » quand l'appareil est connecté au Wi-Fi sans Internet.
      setMessage(
        (await nombreOperationsEnAttente()) > 0
          ? `« ${cree.nom} » enregistré sur cet appareil — il sera transmis dès que le serveur sera joignable.`
          : `« ${cree.nom} » ajouté.`
      );
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setAjout(false);
    }
  }

  async function modifier(id: string, patch: Partial<Etablissement>) {
    setMessage(null);
    try {
      await modifierEtablissement(id, patch);
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    }
  }

  async function confirmerSuppression() {
    if (!aSupprimer) return;
    const { id, nom } = aSupprimer;
    setMessage(null);
    setASupprimer(null);
    try {
      await supprimerEtablissement(id);
      setMessage(
        (await nombreOperationsEnAttente()) > 0
          ? `« ${nom} » retiré de cet appareil — la suppression sera transmise dès que le serveur sera joignable.`
          : `« ${nom} » supprimé définitivement.`
      );
      await charger();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erreur.");
    }
  }

  return (
    <div>
      {aSupprimer && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <p className="text-sm font-semibold text-gray-800">Supprimer définitivement ?</p>
            <p className="mt-2 text-sm text-gray-600">
              « {aSupprimer.nom} » sera supprimé définitivement, ainsi que toutes les saisies qui lui sont rattachées.
              Cette action est irréversible.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setASupprimer(null)} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">
                Annuler
              </button>
              <button onClick={confirmerSuppression} className="rounded-md bg-statut-rejeteText px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.code}
            onClick={() => setTypeCode(t.code)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              typeCode === t.code ? "bg-primary text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {estDD && (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold text-gray-600">Arrondissement</label>
          <select
            value={arrondissementId}
            onChange={(e) => setArrondissementId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {arrondissements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nom}
              </option>
            ))}
          </select>
        </div>
      )}

      <form onSubmit={ajouter} className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Ajouter un établissement</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            placeholder="Nom *"
            value={nouveau.nom}
            onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Localité *"
            value={nouveau.localite}
            onChange={(e) => setNouveau({ ...nouveau, localite: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Propriétaire (optionnel)"
            value={nouveau.proprietaire}
            onChange={(e) => setNouveau({ ...nouveau, proprietaire: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Téléphone (optionnel)"
            value={nouveau.telephone}
            onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={ajout}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {ajout ? "Ajout…" : "Ajouter"}
        </button>
      </form>

      {message && <p className="mb-3 text-sm text-gray-700">{message}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : liste.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun établissement de ce type pour cet arrondissement.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="border-b border-gray-200 px-3 py-2">Nom</th>
                <th className="border-b border-gray-200 px-3 py-2">Localité</th>
                <th className="border-b border-gray-200 px-3 py-2">Propriétaire</th>
                <th className="border-b border-gray-200 px-3 py-2">Téléphone</th>
                <th className="border-b border-gray-200 px-3 py-2">Statut</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right">Suppression</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((etab) => (
                <LigneEtablissement
                  key={etab.id}
                  etab={etab}
                  onModifier={(patch) => modifier(etab.id, patch)}
                  onSupprimer={() => setASupprimer({ id: etab.id, nom: etab.nom })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LigneEtablissement({
  etab,
  onModifier,
  onSupprimer,
}: {
  etab: Etablissement;
  onModifier: (patch: Partial<Etablissement>) => void;
  onSupprimer: () => void;
}) {
  const [nom, setNom] = useState(etab.nom);
  const [localite, setLocalite] = useState(etab.localite);
  const [proprietaire, setProprietaire] = useState(etab.proprietaire ?? "");
  const [telephone, setTelephone] = useState(etab.telephone ?? "");

  const champCommun = "w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none disabled:text-gray-400";

  return (
    <tr className={!etab.actif ? "bg-gray-50 text-gray-400" : ""}>
      <td className="border-b border-gray-100 px-3 py-2">
        <input value={nom} disabled={!etab.actif} onChange={(e) => setNom(e.target.value)} onBlur={() => nom !== etab.nom && onModifier({ nom })} className={champCommun} />
      </td>
      <td className="border-b border-gray-100 px-3 py-2">
        <input value={localite} disabled={!etab.actif} onChange={(e) => setLocalite(e.target.value)} onBlur={() => localite !== etab.localite && onModifier({ localite })} className={champCommun} />
      </td>
      <td className="border-b border-gray-100 px-3 py-2">
        <input value={proprietaire} disabled={!etab.actif} onChange={(e) => setProprietaire(e.target.value)} onBlur={() => proprietaire !== (etab.proprietaire ?? "") && onModifier({ proprietaire })} className={champCommun} />
      </td>
      <td className="border-b border-gray-100 px-3 py-2">
        <input value={telephone} disabled={!etab.actif} onChange={(e) => setTelephone(e.target.value)} onBlur={() => telephone !== (etab.telephone ?? "") && onModifier({ telephone })} className={champCommun} />
      </td>
      <td className="border-b border-gray-100 px-3 py-2">
        <button
          onClick={() => onModifier({ actif: !etab.actif })}
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${etab.actif ? "bg-green-100 text-green-800 hover:bg-red-100 hover:text-red-800" : "bg-gray-200 text-gray-600 hover:bg-green-100 hover:text-green-800"}`}
        >
          {etab.actif ? "Actif — désactiver" : "Inactif — réactiver"}
        </button>
      </td>
      <td className="border-b border-gray-100 px-3 py-2 text-right">
        <button onClick={onSupprimer} className="text-xs font-semibold text-statut-rejeteText hover:underline">
          Supprimer
        </button>
      </td>
    </tr>
  );
}

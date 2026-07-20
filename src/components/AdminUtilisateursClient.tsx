"use client";

/**
 * Administration des comptes (CDC §M1, §4.1) : le DD crée un compte pour un
 * poste (rôle + rattachement), l'autorise (la personne ne peut se connecter
 * qu'après), puis relaie une seule fois l'identifiant + le mot de passe
 * temporaire généré. La personne complète elle-même ses informations
 * personnelles et choisit son mot de passe définitif à sa première connexion.
 */

import { useEffect, useState, useCallback } from "react";

interface UserRow {
  id: string;
  nom: string;
  username: string;
  role: string;
  arrondissement: string | null;
  section: string | null;
  telephone: string | null;
  actif: boolean;
  enAttente: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
interface Ref {
  id: string;
  nom?: string;
  code?: string;
}

const LIBELLES_ROLE: Record<string, string> = {
  DD: "Délégué Départemental",
  DA: "Délégué d'Arrondissement",
  AGENT_SAISIE: "Agent de saisie",
  CHEF_BAC: "Chef de section — BAC",
  CHEF_SSV: "Chef de section — SSV",
  CHEF_PSA: "Chef de section — PSA",
  CHEF_SPAIH: "Chef de section — SPAIH",
  ADMIN_TECH: "Administrateur technique",
};

export default function AdminUtilisateursClient() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [arrondissements, setArrondissements] = useState<Ref[]>([]);
  const [sections, setSections] = useState<Ref[]>([]);
  const [chargement, setChargement] = useState(true);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [role, setRole] = useState("DA");
  const [arrondissementId, setArrondissementId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [telephone, setTelephone] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);
  const [identifiantsGeneres, setIdentifiantsGeneres] = useState<{ username: string; motDePasseTemporaire: string } | null>(null);

  const charger = useCallback(async () => {
    const res = await fetch("/api/admin/utilisateurs");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
      setArrondissements(data.arrondissements);
      setSections(data.sections);
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  async function creerCompte(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setCreation(true);
    try {
      const res = await fetch("/api/admin/utilisateurs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          role,
          arrondissementId: role === "DA" || role === "AGENT_SAISIE" ? arrondissementId : undefined,
          sectionId: role.startsWith("CHEF_") ? sectionId : undefined,
          telephone: telephone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec de la création.");
      setIdentifiantsGeneres({ username: data.user.username, motDePasseTemporaire: data.motDePasseTemporaire });
      setNom("");
      setTelephone("");
      setFormulaireOuvert(false);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setCreation(false);
    }
  }

  async function changerStatut(id: string, actif: boolean) {
    const res = await fetch(`/api/admin/utilisateurs/${id}/statut`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actif }),
    });
    if (res.ok) await charger();
  }

  async function reinitialiserMotDePasse(id: string) {
    const res = await fetch(`/api/admin/utilisateurs/${id}/reset-password`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      const u = users.find((x) => x.id === id);
      setIdentifiantsGeneres({ username: u?.username ?? "", motDePasseTemporaire: data.motDePasseTemporaire });
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[23px] font-bold text-primary-dark">Comptes utilisateurs</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Créez un compte, autorisez-le, puis communiquez l'identifiant et le mot de passe temporaire une seule fois.
            La personne complète ensuite elle-même ses informations et choisit son mot de passe définitif.
          </p>
        </div>
        <button
          onClick={() => setFormulaireOuvert((v) => !v)}
          className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-darker"
        >
          + Nouveau compte
        </button>
      </div>

      {identifiantsGeneres && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary-light p-4">
          <p className="text-sm font-semibold text-primary-dark">
            Compte créé — à communiquer une seule fois à la personne concernée (non récupérable ensuite) :
          </p>
          <p className="mt-2 font-mono text-sm text-ink">
            Identifiant : <strong>{identifiantsGeneres.username}</strong>
            <br />
            Mot de passe temporaire : <strong>{identifiantsGeneres.motDePasseTemporaire}</strong>
          </p>
          <button onClick={() => setIdentifiantsGeneres(null)} className="mt-2 text-xs text-primary hover:underline">
            Fermer
          </button>
        </div>
      )}

      {formulaireOuvert && (
        <form onSubmit={creerCompte} className="mt-4 rounded-lg border border-line bg-white p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-[#3d4855]">Nom complet</label>
              <input
                type="text"
                required
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="ex : Jean Kamdem"
                className="w-full rounded-md border border-[#c3ccd6] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-[#3d4855]">Rôle</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-md border border-[#c3ccd6] bg-white px-3 py-2 text-sm">
                <option value="DA">Délégué d'Arrondissement</option>
                <option value="AGENT_SAISIE">Agent de saisie (subalterne d'un DA)</option>
                <option value="CHEF_BAC">Chef de section — BAC</option>
                <option value="CHEF_SSV">Chef de section — SSV</option>
                <option value="CHEF_PSA">Chef de section — PSA</option>
                <option value="CHEF_SPAIH">Chef de section — SPAIH</option>
                <option value="DD">Délégué Départemental</option>
                <option value="ADMIN_TECH">Administrateur technique</option>
              </select>
            </div>
            {(role === "DA" || role === "AGENT_SAISIE") && (
              <div>
                <label className="mb-1 block text-[13px] font-semibold text-[#3d4855]">Arrondissement</label>
                <select value={arrondissementId} onChange={(e) => setArrondissementId(e.target.value)} required className="w-full rounded-md border border-[#c3ccd6] bg-white px-3 py-2 text-sm">
                  <option value="">— Choisir —</option>
                  {arrondissements.map((a) => (
                    <option key={a.id} value={a.id}>{a.nom}</option>
                  ))}
                </select>
              </div>
            )}
            {role.startsWith("CHEF_") && (
              <div>
                <label className="mb-1 block text-[13px] font-semibold text-[#3d4855]">Section</label>
                <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} required className="w-full rounded-md border border-[#c3ccd6] bg-white px-3 py-2 text-sm">
                  <option value="">— Choisir —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.nom}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-[#3d4855]">Téléphone (optionnel)</label>
              <input
                type="text"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="ex : 6XX XXX XXX"
                className="w-full rounded-md border border-[#c3ccd6] px-3 py-2 text-sm"
              />
            </div>
          </div>
          {erreur && <p className="mt-3 text-sm text-statut-rejeteText">{erreur}</p>}
          <div className="mt-4 flex gap-2">
            <button type="submit" disabled={creation} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-darker disabled:opacity-60">
              {creation ? "Création…" : "Créer le compte"}
            </button>
            <button type="button" onClick={() => setFormulaireOuvert(false)} className="rounded-md border border-[#c3ccd6] px-4 py-2 text-sm font-semibold text-ink-muted">
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-[#e8eef5] text-left">
              <th className="border-b-2 border-[#cdd8e3] px-4 py-2.5 font-bold text-[#3d4855]">Nom</th>
              <th className="border-b-2 border-[#cdd8e3] px-4 py-2.5 font-bold text-[#3d4855]">Identifiant</th>
              <th className="border-b-2 border-[#cdd8e3] px-4 py-2.5 font-bold text-[#3d4855]">Rôle</th>
              <th className="border-b-2 border-[#cdd8e3] px-4 py-2.5 font-bold text-[#3d4855]">Rattachement</th>
              <th className="border-b-2 border-[#cdd8e3] px-4 py-2.5 font-bold text-[#3d4855]">Statut</th>
              <th className="border-b-2 border-[#cdd8e3] px-4 py-2.5 text-right font-bold text-[#3d4855]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!chargement && users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-ink-faint">Aucun compte.</td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id}>
                <td className="border-b border-[#eef1f5] px-4 py-3 font-medium text-[#28323d]">{u.nom}</td>
                <td className="border-b border-[#eef1f5] px-4 py-3 font-mono text-ink-muted">{u.username}</td>
                <td className="border-b border-[#eef1f5] px-4 py-3 text-ink-muted">{LIBELLES_ROLE[u.role] ?? u.role}</td>
                <td className="border-b border-[#eef1f5] px-4 py-3 text-ink-muted">{u.arrondissement ?? u.section ?? "—"}</td>
                <td className="border-b border-[#eef1f5] px-4 py-3">
                  {u.enAttente ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-statut-retardBorder bg-statut-retardBg px-2.5 py-1 text-xs font-semibold text-statut-retardText">
                      En attente d'autorisation
                    </span>
                  ) : u.actif ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-statut-soumisBorder bg-statut-soumisBg px-2.5 py-1 text-xs font-semibold text-statut-soumisText">
                      Actif
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-statut-rejeteBorder bg-statut-rejeteBg px-2.5 py-1 text-xs font-semibold text-statut-rejeteText">
                      Désactivé
                    </span>
                  )}
                </td>
                <td className="border-b border-[#eef1f5] px-4 py-3">
                  <div className="flex justify-end gap-3 text-xs">
                    {!u.actif && (
                      <button onClick={() => changerStatut(u.id, true)} className="font-semibold text-primary hover:underline">
                        {u.enAttente ? "Autoriser" : "Réactiver"}
                      </button>
                    )}
                    {u.actif && (
                      <button onClick={() => changerStatut(u.id, false)} className="font-semibold text-statut-rejeteText hover:underline">
                        Désactiver
                      </button>
                    )}
                    <button onClick={() => reinitialiserMotDePasse(u.id)} className="font-semibold text-ink-muted hover:underline">
                      Réinitialiser le mot de passe
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

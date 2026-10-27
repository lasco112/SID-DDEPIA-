"use client";

/** Journal de l'administration du système : qui a fait quoi, quand, et pour quel département. */
import { useEffect, useState } from "react";

interface Ligne {
  id: string;
  le: string;
  action: string;
  auteur: string;
  details: Record<string, unknown> | null;
}

const LIBELLES: Record<string, string> = {
  ACTIVATION_DEPARTEMENT: "Département lancé",
  EXTINCTION_DEPARTEMENT: "Département éteint",
  IDENTIFIANTS_GENERES: "Fiches d'identifiants produites",
  MOTS_DE_PASSE_REINITIALISES: "Mots de passe réinitialisés",
  COMPTE_REACTIVE: "Compte réactivé",
  PURGE_DONNEES_TEST: "Données d'essai purgées",
  SUPPRESSION_ETABLISSEMENTS_DEMO: "Établissements de démonstration retirés",
  VALIDATION_REFERENTIEL: "Nouvelle espèce validée",
  REJET_REFERENTIEL: "Nouvelle espèce rejetée",
  TEXTE_DEPARTEMENT: "Texte permanent d'un département",
  DEMONSTRATION_REINITIALISEE: "Démonstration remise à zéro",
};

function precision(l: Ligne): string {
  const d = l.details ?? {};
  const morceaux: string[] = [];
  if (typeof d.departement === "string") morceaux.push(d.departement);
  if (Array.isArray(d.comptes)) morceaux.push(`${d.comptes.length} compte(s) : ${d.comptes.join(", ")}`);
  if (l.action === "PURGE_DONNEES_TEST" && typeof d.saisies === "number") morceaux.push(`${d.saisies} saisie(s), ${d.rapports ?? 0} rapport(s)`);
  if (typeof d.supprimes === "number") morceaux.push(`${d.supprimes} établissement(s)`);
  if (l.action === "DEMONSTRATION_REINITIALISEE" && typeof d.mois === "number") morceaux.push(`${d.mois} mois, ${d.saisies} saisies`);
  if (typeof d.code === "string" && l.action.includes("REFERENTIEL")) morceaux.push(String(d.code));
  if (typeof d.cle === "string") morceaux.push(`zone ${d.cle}`);
  return morceaux.join(" · ");
}

export default function JournalClient() {
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin-systeme/journal")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.message ?? "Échec du chargement.");
        setLignes(j.lignes);
      })
      .catch((e) => setErreur(e instanceof Error ? e.message : "Échec du chargement."));
  }, []);

  if (erreur) return <p className="rounded-md bg-red-50 p-4 text-red-800">{erreur}</p>;
  if (!lignes) return <p className="text-ink-muted">Chargement…</p>;
  if (lignes.length === 0) return <p className="text-ink-muted">Aucune action d&apos;administration pour l&apos;instant.</p>;

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="bg-primary-light text-left">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Action</th>
            <th className="px-3 py-2">Précisions</th>
            <th className="px-3 py-2">Par</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id} className="border-t border-line align-top">
              <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                {new Date(l.le).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </td>
              <td className="px-3 py-2 font-semibold text-ink">{LIBELLES[l.action] ?? l.action}</td>
              <td className="px-3 py-2 text-ink-muted">{precision(l)}</td>
              <td className="px-3 py-2 text-ink-muted">{l.auteur}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

"use client";

/**
 * Première connexion (CDC §4.1) : après autorisation du DD, la personne
 * concernée complète elle-même ses informations personnelles et choisit son
 * mot de passe définitif (remplace le mot de passe temporaire communiqué par
 * le DD).
 */

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function PremiereConnexionPage() {
  const { data: session, update } = useSession();
  const router = useRouter();

  const [nom, setNom] = useState((session?.user as any)?.name ?? "");
  const [telephone, setTelephone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);

    if (motDePasse.length < 8) {
      setErreur("Le mot de passe doit contenir au moins 8 caractères.");
      return;
    }
    if (motDePasse !== confirmation) {
      setErreur("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setEnCours(true);
    try {
      const res = await fetch("/api/mon-compte/premiere-connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, telephone, whatsapp, email, nouveauMotDePasse: motDePasse }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Échec de l'enregistrement.");

      await update(); // rafraîchit la session (mustChangePassword → false) sans reconnexion
      router.push("/dashboard");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#eef3f8] to-[#dde6f0] p-5">
      <div className="w-full max-w-[480px]">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-[15px] font-bold tracking-wide text-white shadow-[0_4px_14px_rgba(30,96,145,.28)]">
            DDEPIA
          </div>
          <div className="text-[13px] font-semibold uppercase tracking-[2px] text-ink-faint">Bienvenue</div>
        </div>

        <form onSubmit={valider} className="rounded-xl border border-line bg-white p-[30px_30px_26px] shadow-[0_10px_30px_rgba(24,52,80,.08)]">
          <h1 className="mb-1 text-2xl font-bold text-primary-dark">Complétez votre compte</h1>
          <p className="mb-6 text-[13.5px] text-ink-muted">
            Votre compte a été autorisé par le Délégué Départemental. Confirmez vos informations et choisissez votre
            mot de passe définitif.
          </p>

          {erreur && <div className="mb-4 rounded-md bg-statut-rejeteBg p-3 text-sm text-statut-rejeteText">{erreur}</div>}

          <label className="mb-1.5 block text-[13px] font-semibold text-[#3d4855]">Nom complet</label>
          <input
            type="text"
            required
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="mb-4 w-full rounded-[7px] border border-[#c3ccd6] px-[13px] py-[11px] text-[15px]"
          />

          <label className="mb-1.5 block text-[13px] font-semibold text-[#3d4855]">Téléphone</label>
          <input
            type="text"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="ex : 6XX XXX XXX"
            className="mb-4 w-full rounded-[7px] border border-[#c3ccd6] px-[13px] py-[11px] text-[15px]"
          />

          <label className="mb-1.5 block text-[13px] font-semibold text-[#3d4855]">WhatsApp (si différent)</label>
          <input
            type="text"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="mb-4 w-full rounded-[7px] border border-[#c3ccd6] px-[13px] py-[11px] text-[15px]"
          />

          <label className="mb-1.5 block text-[13px] font-semibold text-[#3d4855]">E-mail (optionnel)</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mb-4 w-full rounded-[7px] border border-[#c3ccd6] px-[13px] py-[11px] text-[15px]"
          />

          <label className="mb-1.5 block text-[13px] font-semibold text-[#3d4855]">Nouveau mot de passe</label>
          <input
            type="password"
            required
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            placeholder="8 caractères minimum"
            className="mb-4 w-full rounded-[7px] border border-[#c3ccd6] px-[13px] py-[11px] text-[15px]"
          />

          <label className="mb-1.5 block text-[13px] font-semibold text-[#3d4855]">Confirmer le mot de passe</label>
          <input
            type="password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="mb-6 w-full rounded-[7px] border border-[#c3ccd6] px-[13px] py-[11px] text-[15px]"
          />

          <button
            type="submit"
            disabled={enCours}
            className="w-full rounded-[7px] bg-primary py-3 text-[15.5px] font-semibold text-white hover:bg-primary-darker disabled:cursor-not-allowed disabled:opacity-60"
          >
            {enCours ? "Enregistrement…" : "Valider et accéder à l'application"}
          </button>

          <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="mt-3 w-full text-center text-xs text-ink-faint hover:underline">
            Se déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}

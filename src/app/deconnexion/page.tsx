"use client";

/**
 * La déconnexion, en français et sans question.
 *
 * Le bouton « Déconnexion » menait à la page par défaut de NextAuth, en
 * anglais : « Sign Out — Are you sure you want to sign out? ». Le Délégué a
 * demandé qu'aucune page anglaise de la connexion ne reste, nulle part
 * (15 octobre 2026). On déconnecte ici directement, puis on revient à la page
 * de connexion du SID.
 */
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

export default function DeconnexionPage() {
  const [erreur, setErreur] = useState(false);

  useEffect(() => {
    signOut({ callbackUrl: "/" }).catch(() => setErreur(true));
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-gradient-soft p-5">
      <div className="w-full max-w-[380px] rounded-card border border-line bg-surface p-6 text-center shadow-card">
        <p className="text-lg font-bold text-primary">SID EPIA-O</p>
        {erreur ? (
          <>
            <p className="mt-2 text-[14px] text-ink">La déconnexion n&apos;a pas abouti : le réseau a sans doute coupé.</p>
            <button
              type="button"
              onClick={() => {
                setErreur(false);
                signOut({ callbackUrl: "/" }).catch(() => setErreur(true));
              }}
              className="mt-4 min-h-[44px] w-full rounded-btn bg-primary text-[15px] font-semibold text-white hover:bg-primary-hover"
            >
              Réessayer
            </button>
          </>
        ) : (
          <p className="mt-2 text-[14px] text-ink-muted">Déconnexion en cours…</p>
        )}
      </div>
    </div>
  );
}

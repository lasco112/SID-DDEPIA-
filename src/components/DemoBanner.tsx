"use client";

/**
 * Bandeau permanent de l'environnement de démonstration (correction n°10,
 * §10.2) : affiché sur TOUTE page dès que la session est démo, sans qu'aucune
 * page n'ait besoin de le savoir (monté une seule fois dans le layout racine).
 */

import { useSession } from "next-auth/react";

export default function DemoBanner() {
  const { data: session } = useSession();
  if (!(session?.user as any)?.isDemo) return null;

  return (
    <div className="sticky top-0 z-[100] flex items-center justify-center gap-2 bg-alerte px-3 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-white sm:text-sm">
      Mode démonstration — Données fictives
    </div>
  );
}

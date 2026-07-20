"use client";

/**
 * AppShellClient.tsx — partie interactive de l'ossature applicative : gère
 * l'ouverture/fermeture du tiroir de navigation sur petit écran (téléphone
 * en portrait notamment, où la barre latérale fixe de 236px ne laissait
 * quasiment plus de place au contenu — d'où le rendu correct seulement en
 * paysage avant ce correctif). Au-delà du seuil `md` (768px), la barre
 * latérale reste affichée en permanence comme avant, le bouton hamburger
 * disparaît.
 */

import { useState } from "react";
import { Menu, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import OnlineIndicator from "@/components/OnlineIndicator";

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

export default function AppShellClient({
  role,
  username,
  periodeLabel,
  children,
}: {
  role: string;
  username: string;
  periodeLabel?: string;
  children: React.ReactNode;
}) {
  const [menuOuvert, setMenuOuvert] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-[58px] shrink-0 items-center gap-4 bg-primary px-[18px] text-white shadow-[0_1px_0_rgba(0,0,0,.12)]">
        <button
          type="button"
          onClick={() => setMenuOuvert((v) => !v)}
          aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
          className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-white/10 md:hidden"
        >
          {menuOuvert ? <X size={22} /> : <Menu size={22} />}
        </button>

        <div className="flex items-center gap-[11px]">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[7px] bg-white/15 text-[10px] font-bold tracking-wide">
            DD
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold">SID DDEPIA-Menoua</div>
            <div className="hidden text-[11px] text-white/70 sm:block">Délégation Départementale · Menoua</div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <OnlineIndicator />
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-[13.5px] font-semibold">{username}</div>
            <div className="text-[11.5px] text-white/75">{LIBELLES_ROLE[role] ?? role}</div>
          </div>
          <a
            href="/api/auth/signout"
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-[13px] font-semibold text-white hover:bg-white/20"
          >
            Déconnexion
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {menuOuvert && (
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMenuOuvert(false)} aria-hidden="true" />
        )}

        <div
          className={`fixed inset-y-0 left-0 z-50 -translate-x-full transition-transform duration-200 ease-out md:relative md:z-auto md:translate-x-0 ${
            menuOuvert ? "translate-x-0" : ""
          }`}
        >
          <Sidebar role={role} periodeLabel={periodeLabel} onNavigate={() => setMenuOuvert(false)} />
        </div>

        <main className="sid-scroll flex-1 min-w-0 overflow-auto bg-appbg p-6 md:p-[26px_30px]">{children}</main>
      </div>
    </div>
  );
}

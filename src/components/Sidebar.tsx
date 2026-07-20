"use client";

/**
 * Sidebar.tsx — navigation latérale par rôle (charte graphique SID DDEPIA-Menoua).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}

const NAV_PAR_ROLE: Record<string, NavItem[]> = {
  DA: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/da/saisie", label: "Saisie de données" },
    { href: "/etablissements", label: "Établissements" },
  ],
  AGENT_SAISIE: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/da/saisie", label: "Saisie de données" },
  ],
  DD: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/dd/supervision", label: "Supervision" },
    { href: "/dd/rapports-thematiques", label: "Rapports thématiques" },
    { href: "/admin/utilisateurs", label: "Comptes utilisateurs" },
    { href: "/etablissements", label: "Établissements" },
    { href: "/dd/referentiels", label: "Propositions de référentiel" },
  ],
  CHEF_BAC: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/section/controle", label: "Vue croisée de contrôle" },
    { href: "/section/analyse", label: "Synthèse d'analyse" },
  ],
  CHEF_SSV: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/section/controle", label: "Vue croisée de contrôle" },
    { href: "/section/analyse", label: "Synthèse d'analyse" },
  ],
  CHEF_PSA: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/section/controle", label: "Vue croisée de contrôle" },
    { href: "/section/analyse", label: "Synthèse d'analyse" },
  ],
  CHEF_SPAIH: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/section/controle", label: "Vue croisée de contrôle" },
    { href: "/section/analyse", label: "Synthèse d'analyse" },
  ],
  ADMIN_TECH: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/technique", label: "Santé du système" },
    { href: "/technique/sauvegarde", label: "Sauvegarde de la base" },
    { href: "/technique/referentiels", label: "Listes de référence" },
    { href: "/technique/audit", label: "Journal d'audit" },
  ],
};

export default function Sidebar({
  role,
  periodeLabel,
  onNavigate,
}: {
  role: string;
  periodeLabel?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = NAV_PAR_ROLE[role] ?? [{ href: "/dashboard", label: "Tableau de bord" }];

  return (
    <nav className="h-full w-[236px] shrink-0 overflow-y-auto border-r border-line bg-white p-3">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`relative mb-0.5 flex items-center gap-2.5 rounded-md py-2.5 pl-4 pr-3 text-[13.5px] ${
              active ? "bg-primary-light font-bold text-primary-dark" : "font-medium text-ink-muted hover:bg-appbg"
            }`}
          >
            <span
              className={`absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-sm ${active ? "bg-primary" : "bg-transparent"}`}
            />
            <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${active ? "bg-primary" : "bg-line"}`} />
            {item.label}
          </Link>
        );
      })}
      {periodeLabel && (
        <div className="mt-4 border-t border-appbg px-3 pb-1 pt-4">
          <div className="text-[11px] leading-relaxed text-ink-faint">
            Période active
            <br />
            <strong className="text-[13px] text-ink-muted">{periodeLabel}</strong>
          </div>
        </div>
      )}
    </nav>
  );
}

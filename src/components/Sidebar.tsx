"use client";

/**
 * Sidebar.tsx — navigation latérale par rôle (charte graphique SID DDEPIA-Menoua).
 *
 * Rangée par rapport (voir navItems.ts) : chaque groupe porte le nom du
 * rapport qu'il prépare ; les étapes du trimestriel sont numérotées.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MENU_PAR_ROLE, entreeCourante, type NavItem } from "@/lib/navItems";

function Entree({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`relative mb-0.5 flex items-center gap-2.5 rounded-md py-2 pl-4 pr-3 text-[13.5px] leading-snug ${
        active ? "bg-primary-light font-bold text-primary-dark" : "font-medium text-ink-muted hover:bg-appbg"
      }`}
    >
      <span className={`absolute left-0 top-[7px] bottom-[7px] w-[3px] rounded-sm ${active ? "bg-primary" : "bg-transparent"}`} />
      {item.etape != null ? (
        <span
          className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            active ? "bg-primary text-white" : "bg-appbg text-ink-muted"
          }`}
        >
          {item.etape}
        </span>
      ) : (
        <span className={`mx-[6.5px] h-[7px] w-[7px] shrink-0 rounded-full ${active ? "bg-primary" : "bg-line"}`} />
      )}
      {item.label}
    </Link>
  );
}

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
  const groupes = MENU_PAR_ROLE[role] ?? [{ cle: "accueil" as const, items: [{ href: "/dashboard", label: "Accueil" }] }];
  const courante = entreeCourante(role, pathname);

  return (
    <nav className="h-full w-[252px] shrink-0 overflow-y-auto border-r border-line bg-white p-3">
      {groupes.map((groupe) => (
        <div key={groupe.cle} className={groupe.titre ? "mt-4 first:mt-0" : ""}>
          {groupe.titre && (
            <div className="mb-1 px-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint">{groupe.titre}</div>
          )}
          {groupe.items.map((item) => (
            <Entree key={item.href} item={item} active={courante?.item.href === item.href} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
      {/* Reprises du bandeau, masquees au-dela de `sm` ou elles y figurent deja. */}
      <div className="mt-3 border-t border-appbg pt-3 sm:hidden">
        <Link
          href="/mon-compte/securite"
          onClick={onNavigate}
          className="mb-0.5 flex items-center gap-2.5 rounded-md py-2.5 pl-4 pr-3 text-[13.5px] font-medium text-ink-muted hover:bg-appbg"
        >
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-line" />
          Sécurité de l'appareil
        </Link>
        <Link
          href="/technique/aide"
          onClick={onNavigate}
          className="mb-0.5 flex items-center gap-2.5 rounded-md py-2.5 pl-4 pr-3 text-[13.5px] font-medium text-ink-muted hover:bg-appbg"
        >
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-line" />
          Aide
        </Link>
      </div>

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

"use client";

/**
 * Sidebar.tsx — navigation latérale par rôle (charte graphique SID DDEPIA-Menoua).
 *
 * Rangée par rapport (voir navItems.ts), et REPLIABLE (demande du Délégué,
 * 27 septembre 2026) : on touche « Rapport mensuel », ses écrans apparaissent.
 * Une seule rubrique ouverte à la fois — celle de l'écran en cours à
 * l'arrivée — pour un menu court. Pensé d'abord pour le téléphone, l'outil
 * principal de tous : lignes hautes, faciles à toucher du doigt.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ChevronDown, FileText, Home, Settings, Wrench, type LucideIcon } from "lucide-react";
import { MENU_PAR_ROLE, entreeCourante, type CleGroupe, type NavItem } from "@/lib/navItems";
import { revoirLaVisite } from "@/lib/visites";

const ICONES: Record<CleGroupe, LucideIcon> = {
  accueil: Home,
  mensuel: CalendarDays,
  trimestriel: BookOpen,
  autres: FileText,
  outils: Wrench,
  administration: Settings,
};

function Entree({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-[44px] items-center gap-2.5 rounded-md py-2 pl-3 pr-2 text-[14px] leading-snug ${
        active ? "bg-primary-light font-bold text-primary-dark" : "font-medium text-ink-muted hover:bg-appbg"
      }`}
    >
      {item.etape != null ? (
        <span
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            active ? "bg-primary text-white" : "bg-appbg text-ink-muted"
          }`}
        >
          {item.etape}
        </span>
      ) : (
        <span className={`mx-[7.5px] h-[7px] w-[7px] shrink-0 rounded-full ${active ? "bg-primary" : "bg-line"}`} />
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
  const [ouvert, setOuvert] = useState<CleGroupe | null>(courante?.groupe.cle ?? null);

  // En changeant d'écran, la rubrique de l'écran s'ouvre.
  useEffect(() => {
    if (courante?.groupe.titre) setOuvert(courante.groupe.cle);
  }, [courante?.groupe.cle, courante?.groupe.titre]);

  return (
    <nav className="h-full w-[268px] shrink-0 overflow-y-auto border-r border-line bg-white p-3">
      {groupes.map((groupe) => {
        const Icone = ICONES[groupe.cle];

        // L'accueil : une entrée simple, pas de rubrique.
        if (!groupe.titre) {
          const item = groupe.items[0];
          const actif = courante?.item.href === item.href;
          return (
            <Link
              key={groupe.cle}
              href={item.href}
              onClick={onNavigate}
              aria-current={actif ? "page" : undefined}
              className={`mb-1 flex min-h-[48px] items-center gap-3 rounded-lg px-3 text-[15px] font-bold ${
                actif ? "bg-primary-light text-primary-dark" : "text-primary-dark hover:bg-appbg"
              }`}
            >
              <Icone size={19} className="shrink-0 text-primary" />
              {item.label}
            </Link>
          );
        }

        const estOuvert = ouvert === groupe.cle;
        const contientLaPage = courante?.groupe.cle === groupe.cle;
        return (
          <div key={groupe.cle} className="mb-1">
            <button
              type="button"
              onClick={() => setOuvert(estOuvert ? null : groupe.cle)}
              aria-expanded={estOuvert}
              className={`flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] font-bold hover:bg-appbg ${
                contientLaPage ? "text-primary-dark" : "text-[#28323d]"
              }`}
            >
              <Icone size={19} className="shrink-0 text-primary" />
              <span className="flex-1">{groupe.titre}</span>
              <ChevronDown size={18} className={`shrink-0 text-ink-faint transition-transform ${estOuvert ? "rotate-180" : ""}`} />
            </button>
            {estOuvert && (
              <div className="mb-2 ml-[21px] border-l border-line pl-2">
                {groupe.items.map((item) => (
                  <Entree key={item.href} item={item} active={courante?.item.href === item.href} onNavigate={onNavigate} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Reprises du bandeau, masquées au-delà de `sm` où elles y figurent déjà. */}
      <div className="mt-3 border-t border-appbg pt-3 sm:hidden">
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            // Le tiroir se referme d'abord : la visite montre l'écran, pas le menu.
            setTimeout(revoirLaVisite, 300);
          }}
          className="flex min-h-[44px] w-full items-center gap-2.5 rounded-md pl-4 pr-3 text-left text-[14px] font-medium text-primary-dark hover:bg-appbg"
        >
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-primary" />
          Revoir la visite de cet écran
        </button>
        <Link
          href="/mon-compte/securite"
          onClick={onNavigate}
          className="flex min-h-[44px] items-center gap-2.5 rounded-md pl-4 pr-3 text-[14px] font-medium text-ink-muted hover:bg-appbg"
        >
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-line" />
          Sécurité de l'appareil
        </Link>
        <Link
          href="/technique/aide"
          onClick={onNavigate}
          className="flex min-h-[44px] items-center gap-2.5 rounded-md pl-4 pr-3 text-[14px] font-medium text-ink-muted hover:bg-appbg"
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

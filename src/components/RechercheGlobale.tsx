"use client";

/**
 * RechercheGlobale.tsx — retrouver rapidement une page ou un tableau dont on
 * a oublié l'emplacement (demande utilisateur). Liste les pages accessibles
 * au rôle courant (même source que Sidebar.tsx) + les 28 tableaux du canevas
 * pour DA/agent de saisie, filtrés en tapant. Raccourci clavier Ctrl+K.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { NAV_PAR_ROLE } from "@/lib/navItems";
import { offlineDB } from "@/lib/dexie";

interface Resultat {
  href: string;
  label: string;
  sousLabel?: string;
}

export default function RechercheGlobale({ role }: { role: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [terme, setTerme] = useState("");
  const [tableaux, setTableaux] = useState<Resultat[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (role === "DA" || role === "AGENT_SAISIE") {
      offlineDB.tableaux
        .orderBy("ordre")
        .toArray()
        .then((liste) =>
          setTableaux(liste.map((t) => ({ href: `/da/saisie/${t.code}`, label: `${t.numero} ${t.titre}`, sousLabel: "Tableau de saisie" })))
        )
        .catch(() => {});
    }
  }, [role]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOuvert(true);
      }
      if (e.key === "Escape") setOuvert(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (ouvert) setTimeout(() => inputRef.current?.focus(), 50);
    else setTerme("");
  }, [ouvert]);

  const items: Resultat[] = useMemo(() => {
    const pages = (NAV_PAR_ROLE[role] ?? []).map((i) => ({ href: i.href, label: i.label, sousLabel: "Page" }));
    return [...pages, ...tableaux];
  }, [role, tableaux]);

  const filtres = useMemo(() => {
    const t = terme.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) => i.label.toLowerCase().includes(t));
  }, [items, terme]);

  function aller(href: string) {
    setOuvert(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        title="Rechercher (Ctrl+K)"
        className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10"
      >
        <Search size={17} />
      </button>

      {ouvert && (
        <div className="fixed inset-0 z-[220] flex items-start justify-center bg-black/40 p-4 pt-20" onClick={() => setOuvert(false)}>
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
              <Search size={16} className="text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={terme}
                onChange={(e) => setTerme(e.target.value)}
                placeholder="Rechercher une page ou un tableau…"
                className="flex-1 text-sm outline-none"
              />
              <button onClick={() => setOuvert(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {filtres.length === 0 && <p className="px-3 py-4 text-sm text-gray-400">Aucun résultat.</p>}
              {filtres.map((r) => (
                <button
                  key={r.href}
                  onClick={() => aller(r.href)}
                  className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-sm hover:bg-gray-100"
                >
                  <span className="font-medium text-gray-800">{r.label}</span>
                  {r.sousLabel && <span className="text-xs text-gray-400">{r.sousLabel}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

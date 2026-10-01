"use client";

/**
 * Sur la liste des 28 tableaux du mensuel, une pastille sur ceux qui ont un
 * point à corriger dans le mois de travail (demande du Délégué, 1er octobre
 * 2026). Un seul calcul pour toute la liste : chaque pastille lit le même.
 *
 * Affichage seulement.
 */
import { createContext, useContext } from "react";
import { usePointsACorriger } from "@/components/ACorriger";
import type { PointACorriger } from "@/lib/aCorriger";

const Points = createContext<PointACorriger[]>([]);

export function PastillesProvider({ children }: { children: React.ReactNode }) {
  const { points } = usePointsACorriger();
  return <Points.Provider value={points ?? []}>{children}</Points.Provider>;
}

export function Pastille({ code }: { code: string }) {
  const points = useContext(Points).filter(
    (p) => p.rapport === "mensuel" && !p.periodeId && (p.lien === `/da/saisie/${code}` || p.lien.startsWith(`/da/saisie/${code}?`))
  );
  if (points.length === 0) return null;
  const aConfirmer = points.every((p) => p.id.startsWith("m-reprise|"));
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${aConfirmer ? "bg-amber-100 text-amber-900" : "bg-red-600 text-white"}`}
      title={points.map((p) => p.quoi).join("\n")}
    >
      {aConfirmer ? "à confirmer" : `⚠ à corriger`}
    </span>
  );
}

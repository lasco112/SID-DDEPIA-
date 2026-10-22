"use client";

/**
 * LA BARRE « REVENIR AU TRIMESTRE » (décision du Délégué, 22 octobre 2026) :
 * en HAUT de l'écran du mois, à l'arrivée, et en BAS, toujours visible quand
 * la correction est finie — le meilleur chemin pour ne pas s'embrouiller.
 * Posée dans le cadre commun de l'application : le module mensuel n'est pas
 * touché (consigne du Délégué). Elle ne s'affiche que si l'on vient d'une case
 * du trimestre (lib/retourTrimestre.ts).
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { lireRetour, oublierRetour, type RetourTrimestre as Retour } from "@/lib/retourTrimestre";

export default function RetourTrimestre({ position }: { position: "haut" | "bas" }) {
  const chemin = usePathname();
  const [retour, setRetour] = useState<Retour | null>(null);
  useEffect(() => {
    setRetour(chemin?.startsWith("/trimestre/saisie") ? null : lireRetour());
  }, [chemin]);
  if (!retour) return null;

  const revenir = () => {
    window.location.href = retour.url;
  };
  const libelle = `Revenir au trimestre : ${retour.libelle}`;

  if (position === "haut") {
    return (
      <div data-visite="retour-trimestre" className="flex flex-wrap items-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-950">
        <button type="button" onClick={revenir} className="min-h-[44px] flex-1 rounded-btn bg-amber-700 px-3 text-left font-semibold text-white">
          ← {libelle}
        </button>
        <button type="button" onClick={() => { oublierRetour(); setRetour(null); }} className="min-h-[44px] px-2 text-xs underline">
          Rester ici
        </button>
      </div>
    );
  }
  return (
    <>
      {/* La place de la barre : elle ne cache jamais le dernier bouton de l'écran du mois. */}
      <div aria-hidden className="h-20" />
      <div className="fixed inset-x-0 bottom-0 z-[150] border-t border-amber-300 bg-amber-100 px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={revenir} className="mx-auto block min-h-[48px] w-full max-w-3xl rounded-btn bg-amber-700 px-3 text-left text-sm font-semibold text-white">
          ← Correction faite ? {libelle}
        </button>
      </div>
    </>
  );
}

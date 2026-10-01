"use client";

/**
 * Les noms d'un refus de production (« Fokoué n'a pas transmis », « SSV n'a
 * pas validé »), chacun cliquable : la ligne correspondante de la Supervision
 * est encadrée en rouge et amenée à l'écran (phase 2 de « À corriger »,
 * demande du Délégué, 1er octobre 2026). Affichage seulement.
 */
import { avecCible, jeton } from "@/lib/surlignage";

export default function LiensBlocage({ daManquants = [], sectionsNonValidees = [] }: { daManquants?: string[]; sectionsNonValidees?: string[] }) {
  if (daManquants.length === 0 && sectionsNonValidees.length === 0) return null;
  // Même page : on change seulement l'adresse ; SurlignageCible encadre.
  const montrer = (jetons: string[]) => window.history.replaceState(null, "", avecCible(window.location.pathname, jetons));
  const bouton = (libelle: string, j: string) => (
    <button
      key={j}
      type="button"
      onClick={() => montrer([j])}
      className="rounded-full border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-50"
    >
      {libelle} →
    </button>
  );
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
      {daManquants.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-900">Pas encore transmis :</p>
          <div className="mt-1 flex flex-wrap gap-1.5">{daManquants.map((a) => bouton(a, jeton("arr", a)))}</div>
        </div>
      )}
      {sectionsNonValidees.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-900">Validation manquante :</p>
          <div className="mt-1 flex flex-wrap gap-1.5">{sectionsNonValidees.map((s) => bouton(s, jeton("section", s)))}</div>
        </div>
      )}
    </div>
  );
}

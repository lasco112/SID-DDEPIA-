"use client";

/**
 * La visite guidée d'un écran (voir lib/visites.ts) : un voile sombre, le
 * bouton expliqué mis en lumière, une bulle ; on touche l'écran pour passer à
 * la suivante. « Passer la visite » arrête tout.
 *
 * À placer dans un écran QUAND son contenu est affiché (`pret`), sinon les
 * boutons à expliquer ne sont pas encore là. Une seule visite à la fois : les
 * autres attendent leur tour.
 *
 * Affichage seulement.
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUtilisateur } from "@/components/UtilisateurContexte";
import { VISITES } from "@/lib/visitesEcrans";
import {
  EVENEMENT_REVOIR_VISITE, elementDeVisite, marquerVue, versionVue, visitesCoupees, type EtapeVisite,
} from "@/lib/visites";

/** L'écran dont la visite est en cours : les autres attendent. */
let visiteEnCours: string | null = null;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Attend que l'écran soit libre : pas d'autre visite, pas de préparation hors ligne en cours. */
async function attendreLeTour(ecran: string, annule: () => boolean): Promise<boolean> {
  for (let i = 0; i < 240; i++) {
    if (annule()) return false;
    const preparation = /Préparation de l.utilisation hors ligne/.test(document.body?.innerText ?? "");
    if (!visiteEnCours && !preparation) {
      visiteEnCours = ecran;
      return true;
    }
    await pause(500);
  }
  return false;
}

interface Etat {
  etapes: (EtapeVisite & { nouveau: boolean })[];
  i: number;
}

export default function VisiteGuidee({ ecran, pret = true }: { ecran: string; pret?: boolean }) {
  const moi = useUtilisateur();
  const [etat, setEtat] = useState<Etat | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const lancer = useCallback(
    async (toutes: boolean, annule: () => boolean) => {
      const def = VISITES[ecran];
      if (!def || !moi || visitesCoupees()) return;
      const vue = versionVue(moi.username, ecran);
      if (!toutes && vue >= def.version) return;
      // Le bandeau, commun à tous les écrans, passe en premier.
      if (ecran !== "bandeau" && !toutes) await pause(1500);
      if (!(await attendreLeTour(ecran, annule))) return;
      // L'écran finit de s'afficher (un tableau se remplit après coup) : on
      // attend que le nombre d'éléments à expliquer cesse d'augmenter.
      let trouves = -1;
      let stable = 0;
      for (let i = 0; i < 30 && stable < 3 && !annule(); i++) {
        await pause(500);
        const n = def.etapes.filter((e) => elementDeVisite(e.cible)).length;
        stable = n === trouves && n > 0 ? stable + 1 : 0;
        trouves = n;
      }
      const etapes = def.etapes
        .filter((e) => toutes || vue === 0 || (e.depuis ?? 1) > vue)
        .filter((e) => elementDeVisite(e.cible))
        .map((e) => ({ ...e, nouveau: !toutes && vue > 0 }));
      // Rien à montrer (liste vide…) : la visite n'est PAS comptée comme vue,
      // elle se fera quand l'écran aura de quoi l'illustrer.
      if (etapes.length === 0 || annule()) {
        visiteEnCours = null;
        return;
      }
      setEtat({ etapes, i: 0 });
    },
    [ecran, moi]
  );

  // À la première ouverture de l'écran.
  useEffect(() => {
    if (!pret) return;
    let annule = false;
    void lancer(false, () => annule);
    return () => {
      annule = true;
      if (visiteEnCours === ecran) visiteEnCours = null;
    };
  }, [pret, lancer, ecran]);

  // « Revoir la visite de cet écran ».
  useEffect(() => {
    if (!pret) return;
    let annule = false;
    const revoir = () => void lancer(true, () => annule);
    window.addEventListener(EVENEMENT_REVOIR_VISITE, revoir);
    return () => {
      annule = true;
      window.removeEventListener(EVENEMENT_REVOIR_VISITE, revoir);
    };
  }, [pret, lancer]);

  const etape = etat ? etat.etapes[etat.i] : null;

  // L'élément expliqué : amené à l'écran, puis mesuré (et remesuré si l'écran bouge).
  useEffect(() => {
    if (!etape) return;
    const el = elementDeVisite(etape.cible);
    if (!el) {
      setEtat((e) => (e ? { ...e, i: e.i + 1 } : e));
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    const mesurer = () => setRect(el.getBoundingClientRect());
    const t = setTimeout(mesurer, 350);
    const t2 = setTimeout(mesurer, 800);
    window.addEventListener("resize", mesurer);
    window.addEventListener("scroll", mesurer, true);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
      window.removeEventListener("resize", mesurer);
      window.removeEventListener("scroll", mesurer, true);
    };
  }, [etape]);

  const terminer = useCallback(() => {
    if (moi) marquerVue(moi.username, ecran, VISITES[ecran]?.version ?? 1);
    visiteEnCours = null;
    setEtat(null);
    setRect(null);
  }, [ecran, moi]);

  // Fin naturelle : toutes les étapes vues.
  useEffect(() => {
    if (etat && etat.i >= etat.etapes.length) terminer();
  }, [etat, terminer]);

  if (!etat || !etape || typeof document === "undefined") return null;

  const suivante = () => {
    setRect(null);
    setEtat((e) => (e ? { ...e, i: e.i + 1 } : e));
  };
  const derniere = etat.i === etat.etapes.length - 1;
  const texte = typeof etape.texte === "function" ? etape.texte(moi?.role ?? "") : etape.texte;

  // La bulle : sous l'élément s'il y a la place, sinon au-dessus.
  const marge = 8;
  const largeur = Math.min(340, window.innerWidth - 24);
  const gauche = rect ? Math.max(12, Math.min(rect.left + rect.width / 2 - largeur / 2, window.innerWidth - largeur - 12)) : 12;
  const enDessous = rect ? rect.bottom + 200 < window.innerHeight || rect.top < 220 : true;
  const style: React.CSSProperties = rect
    ? enDessous
      ? { top: Math.min(rect.bottom + marge + 6, window.innerHeight - 200), left: gauche, width: largeur }
      : { bottom: window.innerHeight - rect.top + marge + 6, left: gauche, width: largeur }
    : { top: "40%", left: gauche, width: largeur };

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] cursor-pointer"
      onClick={suivante}
      role="dialog"
      aria-label={`Visite guidée : ${etape.titre}`}
    >
      {/* Le voile, percé à l'endroit de l'élément expliqué. */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-lg ring-4 ring-amber-300 transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.72)",
          }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-slate-900/70" />
      )}

      <div className="fixed rounded-xl bg-white p-4 text-gray-900 shadow-2xl" style={style}>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <span>
            {etat.i + 1} / {etat.etapes.length}
          </span>
          {etape.nouveau && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-900">Nouveau</span>}
        </p>
        <p className="mt-1 text-base font-bold text-primary-dark">{etape.titre}</p>
        <p className="mt-1 text-sm leading-relaxed">{texte}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-gray-500">
            {derniere ? "Touchez l'écran pour terminer" : "Touchez l'écran pour continuer"}
          </span>
          {!derniere && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                terminer();
              }}
              className="rounded-md px-2 py-1 text-xs font-semibold text-gray-600 underline hover:bg-gray-100"
            >
              Passer la visite
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

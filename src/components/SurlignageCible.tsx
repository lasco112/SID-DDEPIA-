"use client";

/**
 * Encadre l'endroit visé par `?cible=` (voir lib/surlignage.ts) et le fait
 * défiler à l'écran. Les écrans se remplissent après coup (base locale,
 * réseau) : on cherche l'élément quelques secondes avant d'abandonner.
 *
 * Affichage seulement.
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const CLASSE = "sid-cible";
/** Un téléphone au réseau faible peut mettre longtemps à remplir le tableau. */
const DUREE_RECHERCHE_MS = 30_000;
/** Une fois trouvé, on encadre encore ce qui arrive juste après (lignes chargées en second). */
const APRES_TROUVAILLE_MS = 4_000;

function elementsVises(jetons: string[]): HTMLElement[] {
  const trouves: HTMLElement[] = [];
  for (const j of jetons) {
    const el = document.querySelectorAll<HTMLElement>(`[data-cible~="${CSS.escape(j)}"]`);
    el.forEach((e) => trouves.push(e));
  }
  return trouves;
}

export default function SurlignageCible() {
  const pathname = usePathname();
  const derniere = useRef<string>("");

  useEffect(() => {
    let minuterie: ReturnType<typeof setInterval> | null = null;
    let surveillance: ReturnType<typeof setInterval> | null = null;

    const appliquer = () => {
      const recherche = window.location.search;
      if (recherche === derniere.current) return;
      derniere.current = recherche;
      document.querySelectorAll(`.${CLASSE}`).forEach((e) => e.classList.remove(CLASSE));
      if (minuterie) clearInterval(minuterie);

      const brut = new URLSearchParams(recherche).get("cible");
      if (!brut) return;
      const jetons = brut.split(",").filter(Boolean);
      const debut = Date.now();
      let trouveLe = 0;
      minuterie = setInterval(() => {
        const els = elementsVises(jetons);
        els.forEach((e) => e.classList.add(CLASSE));
        if (els.length > 0 && !trouveLe) {
          trouveLe = Date.now();
          // En HAUT de l'écran : le bas est occupé par le guide et la barre du parcours.
          els[0].scrollIntoView({ behavior: "smooth", block: "start" });
          const champ = els[0].matches("input, textarea, select") ? els[0] : els[0].querySelector<HTMLElement>("input:not([disabled]), textarea, select");
          champ?.focus({ preventScroll: true });
        }
        // On continue un peu après la première trouvaille : une case calculée
        // ou une ligne chargée plus tard doit être encadrée elle aussi.
        const fini = trouveLe ? Date.now() - trouveLe > APRES_TROUVAILLE_MS : Date.now() - debut > DUREE_RECHERCHE_MS;
        if (fini && minuterie) clearInterval(minuterie);
      }, 400);
    };

    appliquer();
    // Une navigation vers la même page avec une autre cible ne change pas le chemin.
    surveillance = setInterval(appliquer, 700);
    return () => {
      if (minuterie) clearInterval(minuterie);
      if (surveillance) clearInterval(surveillance);
      derniere.current = "";
    };
  }, [pathname]);

  return null;
}

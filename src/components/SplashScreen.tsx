"use client";

/**
 * SplashScreen.tsx — ouverture « Les données prennent vie » (charte
 * graphique SID DDEPIA §14). Séquence complète (~2,4 s) une seule fois par
 * jour ; les lancements suivants n'affichent qu'un logo bref (~0,8 s).
 * Skip immédiat au clic/toucher — une animation d'ouverture ne doit jamais
 * retenir l'utilisateur.
 */

import { useEffect, useRef, useState } from "react";

const CLE_DERNIERE_OUVERTURE = "sid-ddepia-derniere-ouverture";

export default function SplashScreen() {
  const [mode, setMode] = useState<"complet" | "mini" | "aucun">("aucun");
  const [visible, setVisible] = useState(false);
  const dejaDecide = useRef(false);

  useEffect(() => {
    if (dejaDecide.current) return; // évite le double-déclenchement du Strict Mode en développement
    dejaDecide.current = true;

    const aujourdHui = new Date().toDateString();
    let dernier: string | null = null;
    try {
      dernier = localStorage.getItem(CLE_DERNIERE_OUVERTURE);
    } catch {
      // stockage indisponible (navigation privée…) : on retombe sur le mini-logo
    }

    if (dernier === aujourdHui) {
      setMode("mini");
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 800);
      return () => clearTimeout(t);
    }

    setMode("complet");
    setVisible(true);
    try {
      localStorage.setItem(CLE_DERNIERE_OUVERTURE, aujourdHui);
    } catch {
      // tant pis, la séquence complète réapparaîtra au prochain lancement
    }
    const t = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(t);
  }, []);

  if (!visible || mode === "aucun") return null;

  if (mode === "mini") {
    return (
      <div className="splash-mini" onClick={() => setVisible(false)} role="presentation">
        <div className="flex h-16 w-16 items-center justify-center rounded-card bg-primary text-lg font-bold text-white shadow-card">
          DD
        </div>
      </div>
    );
  }

  return (
    <div className="splash-overlay" onClick={() => setVisible(false)} role="presentation">
      <div className="splash-stage">
        <div className="splash-fiche splash-fiche-mint" />
        <div className="splash-fiche splash-fiche-sky" />
        <div className="splash-fiche splash-fiche-aqua" />
        <div className="splash-db" />
      </div>
      <div className="splash-titre text-2xl font-bold tracking-wide text-ink">SID DDEPIA</div>
      <div className="splash-tagline text-sm font-medium text-ink-muted">Collecter. Centraliser. Décider.</div>
    </div>
  );
}

"use client";

/**
 * SplashScreen.tsx — animation d'ouverture (vidéo fournie par le DD),
 * une seule fois par jour ; les lancements suivants n'affichent qu'un logo
 * bref (~0,8 s). Skip immédiat au clic/toucher — une animation d'ouverture
 * ne doit jamais retenir l'utilisateur, et la vidéo se termine d'elle-même
 * (événement `ended`) sans durée codée en dur.
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
    // Filet de sécurité si la vidéo ne se charge pas (hors ligne la toute
    // première fois, format non supporté...) : ne jamais bloquer l'accès à
    // l'application au-delà de quelques secondes.
    const t = setTimeout(() => setVisible(false), 6000);
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
    <div
      className="fixed inset-0 z-[300] overflow-hidden"
      style={{ background: "var(--gradient-brand)" }}
      onClick={() => setVisible(false)}
      role="presentation"
    >
      {/* object-cover : la vidéo remplit TOUT l'écran quel que soit le format de
          l'appareil (le débord est rogné, jamais de bandes ni de cadre). Le
          dégradé de marque en dessous ne se voit que le temps du chargement. */}
      <video
        autoPlay
        muted
        playsInline
        onEnded={() => setVisible(false)}
        onError={() => setVisible(false)}
        className="h-full w-full object-cover"
      >
        <source src="/videos/animation-entree.mp4" type="video/mp4" />
      </video>
    </div>
  );
}

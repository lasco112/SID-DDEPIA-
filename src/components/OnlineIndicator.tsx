"use client";

import { useEffect, useState } from "react";

/** Indicateur permanent en ligne / hors ligne (CDC §4.2). */
export default function OnlineIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <span
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
        online
          ? "border-statut-soumisBorder bg-statut-soumisBg text-statut-soumisText"
          : "border-statut-retardBorder bg-statut-retardBg text-statut-retardText"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${online ? "bg-statut-soumisDot" : "bg-statut-retardDot"}`} />
      {online ? "En ligne" : "Hors ligne"}
    </span>
  );
}

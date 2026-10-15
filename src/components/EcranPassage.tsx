"use client";

/**
 * L'écran de passage, juste après la connexion : la photo du département de
 * l'agent, le nom de sa délégation, et son nom — moins de deux secondes, puis
 * il s'efface de lui-même (un toucher le ferme aussitôt).
 *
 * Une seule fois par connexion : la page de déconnexion efface la marque, la
 * connexion suivante le remontre. Les visites guidées attendent qu'il soit
 * parti (voir VisiteGuidee.tsx).
 */
import { useEffect, useState } from "react";
import { fondDepartement, MOTIF_NDOP } from "@/lib/fondsDepartement";

export const PREFIXE_MARQUE_PASSAGE = "sid-passage:";

export default function EcranPassage({
  username,
  nom,
  codeDepartement,
  intitule,
  fonction,
}: {
  username: string;
  /** Le nom de la personne, s'il est connu ; sinon l'identifiant. */
  nom?: string | null;
  codeDepartement: string;
  /** « Délégation Départementale de la Bamboutos ». */
  intitule: string;
  fonction: string;
}) {
  const [etat, setEtat] = useState<"cache" | "visible" | "sortie">("cache");
  const fond = fondDepartement(codeDepartement);

  useEffect(() => {
    const cle = PREFIXE_MARQUE_PASSAGE + username;
    try {
      if (sessionStorage.getItem(cle)) return;
      sessionStorage.setItem(cle, "1");
    } catch {
      // Stockage refusé (navigation privée) : l'écran se montre, sans plus.
    }
    setEtat("visible");
  }, [username]);

  // Le départ, à part : si la décision ci-dessus est rejouée (React la rejoue
  // en développement), la marque est déjà posée et elle ne fait plus rien —
  // les minuteries, elles, doivent tourner quoi qu'il arrive, sinon l'écran
  // resterait affiché et retiendrait les visites guidées.
  useEffect(() => {
    if (etat === "cache") return;
    const t = setTimeout(() => setEtat(etat === "visible" ? "sortie" : "cache"), etat === "visible" ? 1800 : 500);
    return () => clearTimeout(t);
  }, [etat]);

  if (etat === "cache") return null;

  return (
    <div
      data-ecran-passage
      role="status"
      onClick={() => setEtat("cache")}
      className={`fixed inset-0 z-[200] cursor-pointer overflow-hidden bg-[#0b3a3f] transition-opacity duration-500 ${
        etat === "sortie" ? "opacity-0" : "opacity-100"
      }`}
    >
      <img src={fond.src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-105 object-cover motion-safe:animate-[passage_2.3s_ease-out_forwards]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b3a3f]/45 via-[#0b3a3f]/25 to-[#0b3a3f]/90" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-6 pb-16 text-center text-white [text-shadow:0_1px_4px_rgba(0,0,0,.6)]">
        <img src="/icon-512.png?v=2" alt="" aria-hidden="true" className="mb-4 h-12 w-12 rounded-[10px] shadow-[0_4px_14px_rgba(0,0,0,.35)]" />
        <p className="text-[12px] font-semibold uppercase tracking-[2px] text-white/80">SID EPIA-O</p>
        <p className="mt-1 text-[22px] font-bold leading-tight sm:text-[28px]">{intitule}</p>
        <p className="mt-2 text-[14px] text-white/90">
          Bienvenue, {nom || username} · {fonction}
        </p>
        <p className="mt-5 text-[11.5px] text-white/65">{fond.legende}</p>
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2"
        style={{ backgroundImage: `url(${MOTIF_NDOP})`, backgroundSize: "auto 80px", backgroundPosition: "center" }}
      />
    </div>
  );
}

/**
 * Fond photographique des pages hors application (connexion, démonstration,
 * déconnexion) : la photo, un voile vert sombre qui garde le texte lisible,
 * et la frise ndop en pied de page. Le lieu (et l'auteur, quand la licence de
 * la photo l'exige) s'écrit en petit au-dessus de la frise.
 */
import { FOND_REGION, type FondPhoto as Fond } from "@/lib/fondsDepartement";
import FriseNdop from "@/components/FriseNdop";

export default function FondPhoto({ fond = FOND_REGION, children }: { fond?: Fond; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b3a3f]">
      {/* Fixée à l'écran : sur une page longue (démonstration, téléphone), la
          photo reste en place derrière les cartes au lieu de s'étirer. */}
      <img src={fond.src} alt="" aria-hidden="true" decoding="async" className="fixed inset-0 h-full w-full object-cover" />
      <div className="fixed inset-0 bg-gradient-to-b from-[#0b3a3f]/55 via-[#0b3a3f]/30 to-[#0b3a3f]/85" />
      <div className="relative flex min-h-screen flex-col pb-[30px]">
        {children}
        <p className="px-4 pb-2 text-right text-[10.5px] leading-snug text-white/55">
          {fond.legende}
          {fond.credit && <span className="block text-white/40">{fond.credit}</span>}
        </p>
      </div>
      <FriseNdop variante="large" className="absolute inset-x-0 bottom-0" />
    </div>
  );
}

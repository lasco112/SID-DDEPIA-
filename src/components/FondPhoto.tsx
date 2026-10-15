/**
 * Fond photographique des pages hors application (connexion, démonstration,
 * déconnexion) : la photo, un voile vert sombre qui garde le texte lisible,
 * et le liseré ndop en pied de page.
 */
import { FOND_REGION, MOTIF_NDOP } from "@/lib/fondsDepartement";

export default function FondPhoto({ src = FOND_REGION.src, children }: { src?: string; children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b3a3f]">
      {/* Fixée à l'écran : sur une page longue (démonstration, téléphone), la
          photo reste en place derrière les cartes au lieu de s'étirer. */}
      <img src={src} alt="" aria-hidden="true" decoding="async" className="fixed inset-0 h-full w-full object-cover" />
      <div className="fixed inset-0 bg-gradient-to-b from-[#0b3a3f]/55 via-[#0b3a3f]/30 to-[#0b3a3f]/85" />
      <div className="relative flex min-h-screen flex-col pb-2">{children}</div>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-2"
        style={{ backgroundImage: `url(${MOTIF_NDOP})`, backgroundSize: "auto 80px", backgroundPosition: "center" }}
      />
    </div>
  );
}

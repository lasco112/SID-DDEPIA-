/**
 * La frise ndop : une frise géométrique simple INSPIRÉE du tissu de l'Ouest
 * (losanges, coins en triangle), aux couleurs de la charte « Indigo des
 * Hautes Terres » — indigo, or et cuivre. Elle ne prétend reproduire aucun
 * motif cérémoniel, ni porter de signification.
 *
 * Dessinée en SVG : aucun fichier à télécharger, nette à toutes les tailles.
 * Usage RARE, purement décoratif (jamais derrière un formulaire, un chiffre
 * ou un graphique) :
 *  - « fine »  : 8 px, sous l'identité du menu et sous le bandeau ;
 *  - « large » : 18 px, au pied des pages de connexion et de l'écran de passage.
 */

const INDIGO = "#17365D";
const NUIT = "#10253F";
const OR = "#D0AE73";
const CUIVRE = "#A8663F";
const IVOIRE = "#F7F5F0";

export default function FriseNdop({ variante = "fine", className = "" }: { variante?: "fine" | "large"; className?: string }) {
  const id = `ndop-${variante}`;
  if (variante === "fine") {
    return (
      <svg aria-hidden="true" className={`block h-2 w-full shrink-0 ${className}`} preserveAspectRatio="none">
        <defs>
          <pattern id={id} width="16" height="8" patternUnits="userSpaceOnUse">
            <rect width="16" height="8" fill={NUIT} />
            <path d="M4 1 L7 4 L4 7 L1 4Z" fill="none" stroke={OR} strokeWidth="1" />
            <path d="M12 1.5 L14.5 4 L12 6.5 L9.5 4Z" fill={CUIVRE} fillOpacity="0.55" />
          </pattern>
        </defs>
        <rect width="100%" height="8" fill={`url(#${id})`} />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className={`block h-[18px] w-full shrink-0 ${className}`} preserveAspectRatio="none">
      <defs>
        <pattern id={id} width="28" height="18" patternUnits="userSpaceOnUse">
          <rect width="28" height="18" fill={INDIGO} />
          <path d="M14 3 L22 9 L14 15 L6 9 Z" fill="none" stroke={OR} strokeWidth="1.4" />
          <circle cx="14" cy="9" r="1.7" fill={IVOIRE} />
          <path d="M0 0 L5 0 L0 5 Z M28 0 L23 0 L28 5 Z M0 18 L5 18 L0 13 Z M28 18 L23 18 L28 13 Z" fill={CUIVRE} />
        </pattern>
      </defs>
      <rect width="100%" height="18" fill={`url(#${id})`} />
    </svg>
  );
}

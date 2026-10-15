/**
 * La frise ndop : les motifs du tissu emblématique de l'Ouest, redessinés en
 * traits — losange, roue (la lune) et dents de scie — dans les couleurs du
 * SID, ton sur ton, au lieu de la photo du tissu répétée (demande du Délégué,
 * 15 octobre 2026 : « multiplier la photo » ne s'accordait pas au thème).
 *
 * Dessinée en SVG : aucun fichier à télécharger, nette à toutes les tailles.
 *  - « fine »  : 8 px, sous le bandeau de chaque page ;
 *  - « large » : 30 px, au pied des pages de connexion et de l'écran de passage.
 */

const FOND = "#2F6871"; // primary.dark
const TRAIT = "#A8DFE5"; // aqua

export default function FriseNdop({ variante = "fine", className = "" }: { variante?: "fine" | "large"; className?: string }) {
  const id = `ndop-${variante}`;
  if (variante === "fine") {
    return (
      <svg aria-hidden="true" className={`block h-2 w-full shrink-0 ${className}`} preserveAspectRatio="none">
        <defs>
          <pattern id={id} width="16" height="8" patternUnits="userSpaceOnUse">
            <rect width="16" height="8" fill={FOND} />
            <path d="M4 1 L7 4 L4 7 L1 4Z" fill={TRAIT} fillOpacity="0.55" />
            <path d="M9 7 L12 2.5 L15 7Z" fill={TRAIT} fillOpacity="0.28" />
          </pattern>
        </defs>
        <rect width="100%" height="8" fill={`url(#${id})`} />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className={`block h-[30px] w-full shrink-0 ${className}`} preserveAspectRatio="none">
      <defs>
        <pattern id={id} width="64" height="30" patternUnits="userSpaceOnUse">
          <rect width="64" height="30" fill={FOND} />
          {/* Dents de scie, en haut et en bas */}
          <path
            d="M0 0 L4 4 L8 0 L12 4 L16 0 L20 4 L24 0 L28 4 L32 0 L36 4 L40 0 L44 4 L48 0 L52 4 L56 0 L60 4 L64 0Z M0 30 L4 26 L8 30 L12 26 L16 30 L20 26 L24 30 L28 26 L32 30 L36 26 L40 30 L44 26 L48 30 L52 26 L56 30 L60 26 L64 30Z"
            fill={TRAIT}
            fillOpacity="0.35"
          />
          <g fill="none" stroke={TRAIT} strokeOpacity="0.8" strokeWidth="1.2">
            {/* Losange double */}
            <path d="M16 8 L23 15 L16 22 L9 15Z" />
            {/* La roue : un cercle et ses rayons */}
            <circle cx="48" cy="15" r="6" />
            <path d="M48 9 V21 M42 15 H54 M43.8 10.8 L52.2 19.2 M52.2 10.8 L43.8 19.2" strokeOpacity="0.45" />
            {/* Séparateurs */}
            <path d="M31 10 V20 M33 10 V20 M0.5 10 V20 M63.5 10 V20" strokeOpacity="0.45" />
          </g>
          <path d="M16 12 L19 15 L16 18 L13 15Z" fill={TRAIT} fillOpacity="0.85" />
          <circle cx="48" cy="15" r="1.6" fill={TRAIT} />
        </pattern>
      </defs>
      <rect width="100%" height="30" fill={`url(#${id})`} />
    </svg>
  );
}

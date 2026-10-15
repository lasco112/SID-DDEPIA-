/**
 * Les photos qui habillent le SID : la région sur la page de connexion, le
 * département de l'agent sur l'écran de passage qui suit la connexion.
 *
 * Choisies par le Délégué de la Menoua (15 octobre 2026) : des images réelles
 * ou réalistes, simples et évocatrices. Chacune pèse moins de 130 Ko (WebP) ;
 * un agent ne télécharge que celle de la région et celle de son département,
 * une seule fois, puis le service worker les garde pour le hors-ligne.
 *
 * Un département sans photo reçoit celle de la région : il suffit d'ajouter
 * sa ligne ici, et le fichier dans public/fonds/, pour qu'il ait la sienne.
 */

export interface FondPhoto {
  src: string;
  /** Ce que montre la photo, écrit en petit sur l'écran de passage. */
  legende: string;
}

export const FOND_REGION: FondPhoto = {
  src: "/fonds/region.webp",
  legende: "Pâturages des hauts plateaux de l'Ouest",
};

const FONDS_DEPARTEMENTS: Record<string, FondPhoto> = {
  MIF: { src: "/fonds/MIF.webp", legende: "Bafoussam" },
  NOU: { src: "/fonds/NOU.webp", legende: "Palais des rois Bamoun, Foumban" },
};

export function fondDepartement(code: string | null | undefined): FondPhoto {
  return (code && FONDS_DEPARTEMENTS[code]) || FOND_REGION;
}

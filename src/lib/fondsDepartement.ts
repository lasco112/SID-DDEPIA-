/**
 * Les photos qui habillent le SID : la région sur la page de connexion, le
 * département de l'agent sur l'écran de passage qui suit la connexion et sur
 * la page de démonstration.
 *
 * Choisies avec le Délégué de la Menoua (15 octobre 2026) : un lieu
 * emblématique de chaque département, nommé en légende. Chacune pèse moins de
 * 160 Ko (WebP) ; un agent ne télécharge que celles de la région et de son
 * département, puis le service worker les garde pour le hors-ligne.
 *
 * Les photos prises sur Wikimedia Commons portent leur `credit` : leur
 * licence (CC BY-SA) oblige à citer l'auteur là où elles s'affichent.
 *
 * Un département a une ou plusieurs photos ; avec plusieurs, elles alternent
 * d'un jour à l'autre. Un département absent d'ici reçoit celle de la région.
 */

export interface FondPhoto {
  src: string;
  /** Le lieu montré, écrit en petit sous l'écran de passage. */
  legende: string;
  /** Auteur et licence, quand la licence exige de les citer. */
  credit?: string;
}

export const FOND_REGION: FondPhoto = {
  src: "/fonds/region.webp",
  legende: "Pâturages des hauts plateaux de l'Ouest",
};

const FONDS_DEPARTEMENTS: Record<string, FondPhoto[]> = {
  BAM: [{ src: "/fonds/BAM.webp", legende: "Les monts Bamboutos" }],
  HNK: [
    {
      src: "/fonds/HNK.webp",
      legende: "Les chutes de la Mouankeu, Bafang",
      credit: "Photo urskalberer, CC BY-SA 3.0, Wikimedia Commons",
    },
  ],
  HPL: [
    {
      src: "/fonds/HPL.webp",
      legende: "Entrée de la chefferie supérieure de Baham",
      credit: "Photo Leba Linda, Wikimedia Commons",
    },
  ],
  KKH: [{ src: "/fonds/KKH.webp", legende: "Entrée de la chefferie de Bandjoun" }],
  MEN: [
    { src: "/fonds/MEN-musee.webp", legende: "Musée des civilisations, Dschang" },
    { src: "/fonds/MEN-falaise.webp", legende: "La falaise de Dschang" },
  ],
  MIF: [{ src: "/fonds/MIF.webp", legende: "Bafoussam" }],
  NDE: [
    {
      src: "/fonds/NDE.webp",
      legende: "La vallée de Bangangté",
      credit: "Photo Nadnad30, CC BY-SA 4.0, Wikimedia Commons",
    },
  ],
  NOU: [
    {
      src: "/fonds/NOU.webp",
      legende: "Palais des rois Bamoun, Foumban",
      credit: "Photo Amcaja, CC BY-SA 3.0, Wikimedia Commons",
    },
  ],
};

export function fondDepartement(code: string | null | undefined, maintenant: Date = new Date()): FondPhoto {
  const photos = (code && FONDS_DEPARTEMENTS[code]) || [];
  if (photos.length === 0) return FOND_REGION;
  const jour = Math.floor(maintenant.getTime() / 86_400_000);
  return photos[jour % photos.length];
}

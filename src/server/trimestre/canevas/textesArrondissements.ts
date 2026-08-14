/**
 * Textes fixes des six arrondissements.
 *
 * EXTRAITS des rapports trimestriels réels des DAEPIA, par
 * scripts/extraire-textes-arrondissements.mjs. Chaque délégué d'arrondissement
 * retapait jusqu'ici la présentation de son territoire à chaque période.
 *
 * Deux des six fichiers ne portaient pas le nom de leur arrondissement : ils
 * ont été identifiés par le nom qui revient le plus dans leur texte —
 * Nkong-Ni et Santchou.
 */

export interface TextesArrondissement {
  /** Introduction du rapport d'arrondissement. */
  introduction: string | null;
  /** Présentation de la DAEPIA : situation, limites, structures. */
  presentation: string | null;
}

/** nom de l'arrondissement → ses textes fixes */
export const TEXTES_ARRONDISSEMENTS = new Map<string, TextesArrondissement>([
  [
    "Dschang",
    {
      introduction: null,
      presentation: "La Délégation d’Arrondissement de l’Elevage, des Pêches et des Industries Animales de Dschang compte un seul Centre Zootechnique et Vétérinaire : Celui de Dschang.\n\nLes services locaux ont pour ressort territorial la circonscription administrative dont il porte le nom. Etant donné la grande étendue de l’Arrondissement et le besoin de rendre service à tous, nos services couvrent difficilement le territoire, d’où la nécessité de création de nouvelles structures.\n\nLes tableaux ci-dessous présentent les besoins en nouvelles structures et poste de responsabilité.\n\nTableau n° 1 : Etat des besoins en création de nouvelles structures \\b",
    },
  ],
  [
    "Fokoué",
    {
      introduction: "La DAEPIA de FOKOUE situé dans la menoua Sud-Est a un CZV qui couvre cinq groupements.\n\nL’économie de l’Arrondissement repose en grande partie sur les activités agropastorales et le petit commerce.\n\nL’élevage bovin se pratique au sommet des montagnes, la pisciculture aux flancs des collines ; Quant aux autres spécuations telle que la volaille, la porciculture et caprin se pratiquent à faible et moyenne echelle dans toute l’étendue de l’arrondissement.",
      presentation: null,
    },
  ],
  [
    "Fongo-Tongo",
    {
      introduction: "La DAEPIA de FONGO-TONGO couvre deux groupements à savoir le groupement Fossong Ellelem et FONGO-TONGO. Elle comporte un Centre Zootechnique et vétérinaire. La DAEPIA est logée dans le CZV construit en 2021. La nature a offert beaucoup d'opportunités aux élevages de l'arrondissement. Plusieurs espèces sont élevées dans l'arrondissement : bovins, volailles, porcins, caprins , ovins. Pour un développement harmonieux de ces élevages, la nature s'avère gracieusement au regard du réseau hydrographique et du pâturage qu'on y rencontre.\n\nFace à cette générosité offerte par la nature, les conflits agropastoraux sont récurrents car les éleveurs et les agriculteurs se disputent les mêmes espaces pour leurs survies. C'est la raison pour laquelle il y'a diminution des cheptels des gros et petits ruminants.",
      presentation: null,
    },
  ],
  [
    "Nkong-Ni",
    {
      introduction: null,
      presentation: null,
    },
  ],
  [
    "Penka-Michel",
    {
      introduction: null,
      presentation: "MISSIONS\n\nLes missions de la Délégation d'arrondissement de Penka-Michel sont définies à l’article 12 du Décret N°2012/382 du 14 Septembre 2012 du Président de la République, portant organisation du Ministère de l’Elevage, des Pêches et des industries animales, à savoir :\n\nAnimation pastorale et de la vulgarisation des méthodes en matière d'élevage, pêche et des industries animales et halieutiques\n\nInspection sanitaire vétérinaire\n\nProtection sanitaire vétérinaire\n\nSuivi des activités des vétérinaires privés\n\nDistribution du matériel technique et des médicaments\n\nEncadrement technique en matière d'élevage, de pêche et d'aquaculture\n\nSuivi des activités des centres spécialisées\n\nContrôle de la collecte des statistiques au niveau de l'arrondissement\n\nEncadrement et de l'organisation des aquaculteurs\n\nSuivi des activités des organisations professionnelles et interprofessionnelles du secteur\n\nProduction et de la distribution des alevins sélectionnés\n\nCollecte des statistiques en matière d'aquaculture.",
    },
  ],
  [
    "Santchou",
    {
      introduction: "Les productions animales occupent une place de choix dans le secteur économique de notre arrondissement. Les espèces élevées dans notre arrondissement sont les suivants : Les porcins, la volaille, les ovins, et caprins. L’élevage non conventionnel est aussi pratique dans l’arrondissement. Les espèces élevées sont les suivants : les abeilles (apiculture), les lapins, les cochons d’Inde et les escargots\n\nL’élevage bovin est pratique momentanément principalement par les bororos et quelques rare fois par les autochtones et ceci en période de la transhumance.\n\nL’Apiculture occupe la place du choix parmi les élevages suscité et s’est pratique dans les galléries forestières ainsi que dans les ruchers crée par des apiculteurs.\n\nL’élevage des porcs et petits ruminants (ovins et caprins) est pratiqués dans l’ensemble de l’arrondissement. L’élevage des porcs est pratique par presque tous les ménages. Cette activité est très rependue dans l’arrondissement.\n\nLa pêche n’est pas une exception dans l’arrondissement et s’est pratique dans la rivière ainsi que dans les étangs piscicole.",
      presentation: null,
    },
  ],
]);

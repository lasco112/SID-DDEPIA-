/**
 * Textes qui ne changent pas d'un trimestre à l'autre.
 *
 * EXTRAITS du rapport réel « RAPPORT_REEL_T1-2026_DDEPIA-MENOUA.docx » fourni par le Délégué, par
 * scripts/extraire-textes-fixes.mjs. Ils étaient jusqu'ici retapés à chaque
 * période ; le SID les reprend désormais tout seul.
 *
 * DEUX RUBRIQUES DU CANEVAS SONT ABSENTES du rapport réel — pédologie et
 * données démographiques. Elles ne figurent qu'à son sommaire, avec la mention
 * « Erreur ! Signet non défini ». Leur zone reste donc vide, avec sa consigne.
 *
 * À TERME, ces textes ont vocation à être rangés en base pour que le Délégué
 * les modifie sans développeur. Ils sont ici en attendant, versionnés et
 * relisibles.
 */

/** clé de zone de texte → texte validé par le Délégué */
export const TEXTES_FIXES = new Map<string, string>([
  [
    "I.introduction",
    // Première phrase CALCULÉE (décision D6) : elle portait « de Janvier à
    // Mars 2026 » en dur et l'annonçait dans tous les rapports.
    "Le présent rapport {NATURE} d’activités de la DDEPIA/MENOUA couvre la période allant de {MOIS_DEBUT} à {MOIS_FIN} {A}.\n\nCe rapport récapitule l’essentiel des activités conduites sur l’ensemble des 06 Arrondissements de la Menoua pour la période sus indiquée, Il est structuré en 4 parties dont la première est une présentation générale de la DDEPIA/MENOUA dans son organisation administrative, son personnel et ses infrastructures, La deuxième partie fait l’état des productions animales suivant les différentes activités induites par chacune des spéculations, La troisième partie est la situation des productions et importations en matière de pêche, d’aquaculture et des activités connexes, La quatrième partie porte sur le déploiement des interventions en matière de protection sanitaire des cheptels et des consommateurs pour l’ensemble des produits d’origine animale et halieutique,\n\nIl convient de signaler que les activités régaliennes qui ont marqué la vie de la DDEPIA {CETTE_PERIODE} ont majoritairement porté sur :\n\nL’inspection systématique et minutieuse des porcs, volailles et produits annexes à l’entrée des marchés et abattoirs/aires d’abattage ;\n\nContrôle rigoureux des mouvements des porcs, volailles et produits annexes exigence des documents sanitaires conformément à la réglementation en vigueur ;\n\nDésinfection systématique des véhicules affectés au transport des porcs, volailles et produits annexes sanctionnée par la délivrance d’un certificat de désinfection avant embarquement, pendant et après débarquement ;\n\nContrôle de la conformité des acteurs de la filière porcine et avicole pour le transport de porcs et volailles conformément à la réglementation en vigueur.\n\nL’inspection sanitaire et vétérinaire des denrées dans les boutiques ;\n\nL’inspection sanitaire vétérinaire dans les tueries et abattoirs ;\n\nLes soins dans les cliniques suivant des calendriers rotatifs établis par les DAEPIA ;\n\nL’intensification de la sensibilisation des éleveurs des PR par rapport à la vaccination contre la Peste des petits Ruminants ;\n\nLe contenu de ce rapport présenté suivant le canevas arrêté par la hiérarchie ressort entre autres la présentation générale de la DDEPIA, les réalisations et les difficultés rencontrées.",
  ],
  [
    "I.geo.relief",
    "Le Département de la Menoua a été créé vers 1885 par les Allemands, il a pour chef-lieu Dschang. Ce Département est situé dans la région de l’Ouest du Cameroun, plus précisément entre 5°25’ – 5°30’ de latitude Nord et 10° - 10°5’ de longitude Est. Il compte une population de 372 244 habitants pour une superficie de 1 380 km2 soit une densité de 270 habitants au km2. Il est limité au Nord-Est par les Bamboutos, à l’Est par la Mifi et les Hauts-plateaux, au Nord-Ouest par le département du Lebialem, à l’Ouest par le Coupé Manengoumba, au Sud et sud-est par le Moungo et le Haut-Nkam.\n\nLe relief du Département de la Menoua est essentiellement accidenté avec des altitudes variables excédant entre 1300 et 1500m",
  ],
  [
    "I1.missions",
    "Les missions de la Délégation Départementale de la Menoua sont définies à l’article 12 du Décret N°2012/382 du 14 Septembre 2012 du Président de la République, portant organisation du Ministère de l’Elevage, des Pêches et des Industries Animales, à savoir :\n\nCoordonner et animer des activités de l’ensemble des services installées dans du Département ;\n\nCoordonner et mobiliser les ressources et des acteurs du secteur de l’élevage, des pêches et des industries animales et halieutiques ;\n\nGérer les ressources humaines, matérielles et financières ;\n\nMettre à jour la carte épidémiologique ;\n\nExécuter et suivre les projets d’investissements ;\n\nCentraliser, consolider et exploiter des informations et des données statistiques en provenance des Délégations Départementales ;\n\nSuivre la mise en œuvre des programmes prioritaires ;\n\nSuivre la mise en œuvre des activités ayant bénéficié d’une délégation de compétences en matière d’élevage, des pêches et des industries animales et halieutiques ;\n\nSuivre la mise en œuvre des activités de vulgarisation en matière d’élevage, des pêches et des industries animales et halieutiques ;\n\nSuivre la mise en œuvre de la réglementation et des normes en matière d’élevage, des pêches, des industries animales et halieutiques ;\n\nSuivre la mise en œuvre des mesures visant l’amélioration quantitative et qualitative de la production et des rendements dans les secteurs d’élevage et des pêches ;\n\nSuivre la promotion des investissements dans les domaines de l’élevage et de la pêche au niveau Régional, en liaison avec les services déconcentrés du Ministère en charge de l’Economie, de la Planification et de l’Aménagement du Territoire et le Ministère des Mines, de l’Industrie et du Développement Technologique ;\n\nL’inspection sanitaire vétérinaire ;\n\nLa production des rapports périodiques d’activités ;\n\nRelations avec les différents acteurs intervenant dans le secteur de l’élevage, des pêches et des industries animales et halieutiques ;\n\nSuivre et contrôler l’application de la législation et de la réglementation relatives à l’exercice des professions et des activités d’élevage, des pêches et des industries animales et halieutique.",
  ],
  [
    "I1.vision",
    "La vision de la DDEPIA de la Menoua qui découle de celle du MINEPIA est d’accroître quantitativement et qualitativement la production des protéines animales et halieutiques pour satisfaire la demande locale, approvisionner les industries de transformation et dégager des excédents pour l’exportation.\n\nCette vision s’inscrit dans le défi de l’émergence du Cameroun à l’horizon 2035 initiée par le Chef de l’Etat à travers son vaste programme de développement socio-économique ; cette émergence doit être soutenue par un secteur rural fort en général et par un sous-secteur de l’élevage, des pêches et des industries animales de « seconde génération » en particulier. La stratégie sous-sectorielle a donc pour objectif global d’accroître les productions animales et halieutiques afin de contribuer à l’émergence de notre pays en termes de croissance économique, de création d’emplois décents et de renforcement de la sécurité alimentaire.",
  ],
  [
    "I1.organisation",
    "La DDEPIA Menoua située dans la région de l’Ouest Cameroun couvre six Arrondissements que sont Penka-Michel, Nkong-Ni, Dschang, Fokoué, Fongo Tongo et Santchou\n\nLes services à elle rattachés sont :\n\nSix (06) Délégations d’Arrondissement (DA/EPIA) qui sont constituées de Dschang, Penka-Michel, Nkong-Ni, Santchou, Fongo -Tongo et Fokoué,\n\nDix (10) Centres Zootechniques et Vétérinaire,\n\nDeux (02) Postes de contrôle Sanitaire et vétérinaire",
  ],
]);

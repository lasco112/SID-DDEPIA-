/**
 * PREMIÈRE PARTIE du canevas trimestriel — mise en œuvre du budget-programme.
 *
 * Quatre programmes, et pour chacun le même enchaînement : présentation,
 * activités menées, un tableau. Le régional ne donne pas de légende à ces
 * quatre tableaux ; ils en reçoivent une ici, car tout tableau du rapport est
 * numéroté et figure dans la liste des tableaux (décision du Délégué).
 *
 * DÉCISION D4 DU DÉLÉGUÉ : les colonnes sont celles du régional, et les lignes
 * — code, action, activités — sont PRÉ-REMPLIES d'après lui : ce sont les
 * actions du budget-programme du MINEPIA, les mêmes à tous les niveaux. Seule
 * la « description du niveau de réalisation » change d'une période à l'autre ;
 * elle reste à rédiger.
 *
 * Le code d'action n'est porté que par la première ligne de chaque action,
 * comme les cellules fusionnées du régional. Deux codes « 409.08 » et
 * « 409.09 » du régional, au milieu du programme 059, sont des fautes de
 * frappe : il n'existe pas de programme 409. Ils sont rétablis en 059.08 et
 * 059.09. Le régional laisse sans code l'action « Protection des
 * consommateurs » du programme 055 : on ne lui en invente pas.
 */
import type { SectionCanevas, Bloc } from "./types";

const COLONNES_ACTIVITES = ["Code action", "Actions", "Activités à mener", "Description du niveau de réalisation"];

/** Le programme 057 porte en plus l'objectif de chaque action. */
const COLONNES_ACTIVITES_057 = [
  "Code action",
  "Actions",
  "Objectif D’action",
  "Activités menées",
  "Description du niveau de réalisation",
];

const RAPPEL_PRESENTATION = "Rappel de l'objet du programme et des actions retenues pour l'exercice.";

/**
 * Une action du budget-programme et ses activités. La première colonne (le
 * code) n'est écrite qu'une fois ; les suivantes sont données pour chaque
 * activité, la dernière — la réalisation — restant vide.
 */
type Action = { code: string; action: string; activites: string[][] };

function tableauActivites(numero: number, code: string, colonnes: string[], actions: Action[]): Extract<Bloc, { type: "tableau" }> {
  const lignes: string[] = [];
  const prerempli: string[][] = [];
  for (const a of actions) {
    a.activites.forEach((cases, i) => {
      lignes.push(i === 0 ? a.code : "");
      prerempli.push([i === 0 ? a.action : "", ...cases]);
    });
  }
  const titre = `Activités menées au titre du programme ${code}`;
  return { type: "tableau", kind: "libre", numero, titre, entetes: colonnes, lignes, prerempli };
}

function programme(code: string, intitule: string, tableau: Extract<Bloc, { type: "tableau" }>): Bloc[] {
  return [
    { type: "titre", niveau: 2, texte: `PROGRAMME ${code} : ${intitule}` },
    { type: "titre", niveau: 3, texte: "Présentation" },
    { type: "zoneTexte", cle: `BP.${code}.presentation`, consigne: RAPPEL_PRESENTATION },
    { type: "titre", niveau: 3, texte: "Activités menées" },
    tableau,
    {
      type: "zoneTexte",
      cle: `BP.${code}.methode`,
      consigne:
        "La colonne « Description du niveau de réalisation » est à rédiger pour la période. Les quantités sont chiffrées, et non noyées dans le texte.",
    },
  ];
}

const P053 = tableauActivites(104, "053", COLONNES_ACTIVITES, [
  {
    code: "053.01",
    action: "Développement des industries animales",
    activites: [
      ["Abattages contrôlés"],
      ["Mise en place des unités de transformation des produits d'élevage."],
      ["Construction des unités d'abattage"],
      ["Mise en place des autres infrastructures des industries animales"],
    ],
  },
  {
    code: "053.02",
    action: "Développement des élevages à cycle court",
    activites: [
      ["Développement de la filière avicole"],
      ["Développement de l’élevage des hannetons"],
      ["Développement de la filière apicole."],
      ["Développement de la filière porcine."],
      ["Développement de l'élevage des petits ruminants."],
    ],
  },
  {
    code: "053.03",
    action: "Développement des exploitations semi intensive et intensive des bovins et équins",
    activites: [
      ["Développement de la filière bovine : Mise en place des unités de production semi-intensives et intensives bovines."],
      ["Développement de la Filière Lait."],
      ["Développement de l’élevage équin."],
    ],
  },
  {
    code: "053.04",
    action: "Développement de l’alimentation animale",
    activites: [
      ["Mise à niveau des structures de production d'aliments pour bétail."],
      ["Développement de la production fourragère."],
      ["Valorisation des résidus et les sous- produits agricoles."],
    ],
  },
  {
    code: "053.05",
    action: "Développement des infrastructures d’élevage et de l’hydraulique pastorale",
    activites: [["Mise en place des infrastructures d’hydraulique pastorale."], ["Mise en place des infrastructures d'élevage."]],
  },
  {
    code: "053.06",
    action: "Vulgarisation et Appui aux OP",
    activites: [["Vulgarisation."], ["Appui aux OP"]],
  },
  {
    code: "",
    action: "Autres activités du programme 053",
    activites: [
      ["Mise à jour du fichier des structures homologuées"],
      ["Analyse technico-financière des dossiers de demande d’homologation"],
      ["Organisation du mini-comice"],
    ],
  },
]);

const P055 = tableauActivites(105, "055", COLONNES_ACTIVITES, [
  {
    code: "055.01",
    action: "Contrôle des maladies animales",
    activites: [["Surveillance de maladies animales."], ["Prévention et lutte contre les maladies animales."]],
  },
  {
    code: "",
    action: "Protection des consommateurs et lutte contre les zoonoses",
    activites: [
      ["Analyse des denrées alimentaires."],
      ["Inspection Sanitaire Vétérinaire."],
      ["Prévention et lutte contre les zoonoses."],
    ],
  },
  {
    code: "055.03",
    action: "Amélioration de la qualité des médicaments vétérinaires et produits à usage vétérinaire",
    activites: [["Homologation des médicaments vétérinaires et des produits à usage vétérinaires."]],
  },
]);

/*
 * Le programme 057 a une colonne de plus, l'objectif de l'action, fusionné sur
 * plusieurs activités dans le régional : il n'est écrit qu'à sa première
 * activité.
 */
const P057 = tableauActivites(106, "057", COLONNES_ACTIVITES_057, [
  {
    code: "057.01",
    action: "Développement de l’Aquaculture commerciale",
    activites: [
      [
        "Accroitre la quantité de poissons produits",
        "Identifier et accompagner les opérateurs privés à investir dans les différents maillons de la chaine des valeurs aquacoles",
      ],
      ["", "Poursuivre la structuration des acteurs de la filière"],
      [
        "Renforcement des capacités des acteurs de la chaine des valeurs aquacoles",
        "Les techniques de formulation et de rationnement de l’aliment des poissons à base des ingrédients locaux",
      ],
      ["", "Les techniques d’installation des équipements de production des poissons hors sol"],
      ["", "La valorisation des techniques de transformation des poissons d’élevage"],
      [
        "Homologation des exploitations et des Industries Halieutiques",
        "Traiter et transmettre les dossiers d’homologation des exploitations aquacoles",
      ],
      ["Statistiques d’aquaculture", "Transmission régulière des données statistiques d’aquaculture"],
    ],
  },
  {
    code: "057.02",
    action: "Amélioration de la Performance et l’utilisation durable des pêches de capture",
    activites: [
      [
        "Améliorer l’exploitation durable des ressources halieutiques dans les retenues d’eaux",
        "Promotion de la pêche artisanale continentale impliquant les jeunes",
      ],
      ["", "La promotion de la gestion durable des pêcheries et l’application effective du repos biologique"],
      ["", "Collecte des statistiques de pêche"],
    ],
  },
]);

const P059 = tableauActivites(107, "059", COLONNES_ACTIVITES, [
  {
    code: "059.01",
    action: "Coordination et suivi des activités des services de la {STRUCTURE}",
    activites: [["Production du rapport d’activités"], ["Tenue des réunions."]],
  },
  {
    code: "059.02",
    action: "Etudes stratégiques et planification au MINEPIA",
    activites: [
      ["Coordination des études du sous-secteur EPIA."],
      ["Actualisation des outils de planification et de programmation."],
      ["Promotion des activités du sous-secteur EPIA auprès des investisseurs publics et privées."],
      ["Suivi des Conventions et Accords de Coopérations et de partenariat avec les organismes gouvernementaux et non gouvernementaux."],
      ["Appui à la recherche de financement et d'expertises technique."],
    ],
  },
  {
    code: "059.03",
    action: "Gestion financière et budgétaire à la {STRUCTURE}",
    activites: [
      ["Suivi de l'exécution du budget."],
      ["Exécution du budget d’investissement public. Suivi de la collecte et du reversement des recettes vétérinaires"],
    ],
  },
  {
    code: "059.04",
    action: "Développement du système d'information statistique à la {STRUCTURE}",
    activites: [
      ["Production des statistiques mensuelles"],
      ["Production de l’annuaire statistique du sous-secteur EPIA"],
      ["Production et diffusion des données statistiques de l’Elevage, des Pêches et des Industries Animales"],
    ],
  },
  {
    code: "059.05",
    action: "Amélioration du cadre de travail au MINEPIA",
    activites: [
      ["Gestion du patrimoine."],
      ["Construction des bâtiments."],
      ["Mise en œuvre du plan de formation du personnel du MINEPIA."],
      ["Centralisation et mise à jour permanente du fichier du personnel"],
      ["Suivi de la gestion des ressources transférées aux CTD"],
      ["Prévention et lutte contre la corruption"],
    ],
  },
  {
    code: "059.06",
    action: "Développement des Ressources Humaines à la {STRUCTURE}",
    activites: [["Prise en charge financière des avancements. Commission Paritaire d’avancement. Animation de la vie associative"]],
  },
  {
    code: "059.08",
    action: "Contrôle et Audit Interne à la {STRUCTURE}",
    activites: [["Contrôle Interne et Evaluation du niveau de fonctionnement et du Rendement des Services"]],
  },
  {
    code: "059.09",
    action: "Conseil juridique au MINEPIA",
    activites: [
      ["Défense des intérêts de l’Etat en Justice."],
      ["Vulgarisation de la culture juridique au MINEPIA."],
      ["Revue quotidienne de la presse."],
    ],
  },
  {
    code: "059.10",
    action: "Communication et relation Publique à la {STRUCTURE}",
    activites: [[""]],
  },
  {
    code: "059.11",
    action: "Gestion des ressources documentaires au MINEPIA",
    activites: [["Archivage physique."], ["Archivage numérique."], ["Construction d’un bâtiment."]],
  },
]);

export const SECTION_BUDGET: SectionCanevas = {
  cle: "BUDGET",
  titre: "Première partie — Mise en œuvre du budget-programme",
  blocs: [
    { type: "titre", niveau: 1, texte: "PREMIÈRE PARTIE : MISE EN ŒUVRE DU BUDGET-PROGRAMME" },
    ...programme("053", "DÉVELOPPEMENT DES PRODUCTIONS ET DES INDUSTRIES ANIMALES", P053),
    ...programme("055", "AMÉLIORATION DE LA COUVERTURE SANITAIRE DES CHEPTELS ET LUTTE CONTRE LES ZOONOSES", P055),
    ...programme("057", "DÉVELOPPEMENT DES PRODUCTIONS HALIEUTIQUES", P057),
    ...programme("059", "AMÉLIORATION DU CADRE INSTITUTIONNEL", P059),
  ],
};

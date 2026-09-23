/**
 * Section I du canevas trimestriel — de l'INTRODUCTION à I-5.
 *
 * Transcription littérale des tableaux #3 à #16 de
 * docs/CANEVAS_TRIMESTRIEL.md. Les libellés sont recopiés au caractère près,
 * apostrophes typographiques comprises : « Centre d’alevinage » et « Station
 * d'Elevage » ne s'écrivent pas avec le même signe dans le document officiel,
 * et le rapport doit lui être identique.
 *
 * AUCUN de ces treize tableaux n'est alimenté par le SID : ils relèvent du BAC,
 * qui ne dispose d'aucun tableau de collecte (voir docs/COUVERTURE.md). Ils sont
 * donc rendus VIDES, comme la fiche papier que le Délégué remplit à la main.
 * C'est volontaire : le canevas doit être complet, même là où la donnée n'est
 * pas encore collectée.
 */
import type { SectionCanevas } from "./types";

export const SECTION_I: SectionCanevas = {
  cle: "I",
  titre: "Section I — Présentation, ressources et moyens",
  blocs: [
    { type: "titre", niveau: 1, texte: "INTRODUCTION" },
    {
      type: "zoneTexte",
      cle: "I.introduction",
      consigne:
        "Rappeler le cadre réglementaire du rapport, la période couverte, le périmètre géographique et les principales orientations du trimestre.",
    },

    { type: "titre", niveau: 1, texte: "I. PRÉSENTATION GÉOGRAPHIQUE DU DÉPARTEMENT DE LA MENOUA" },
    { type: "titre", niveau: 3, texte: "a) Situation et relief" },
    {
      type: "zoneTexte",
      cle: "I.geo.relief",
      consigne: "Donnée de référence, reprise du référentiel institutionnel, non ressaisie chaque trimestre.",
    },
    { type: "titre", niveau: 3, texte: "b) Pédologie, climat, hydrographie et végétation" },
    { type: "zoneTexte", cle: "I.geo.pedologie", consigne: "Donnée de référence." },
    { type: "titre", niveau: 3, texte: "c) Données démographiques et économiques" },
    { type: "zoneTexte", cle: "I.geo.demographie", consigne: "Donnée de référence, actualisée annuellement." },

    { type: "titre", niveau: 1, texte: "I-1. PRÉSENTATION DE LA DDEPIA-MENOUA" },
    { type: "titre", niveau: 3, texte: "a) Missions" },
    { type: "zoneTexte", cle: "I1.missions", consigne: "Donnée de référence." },
    { type: "titre", niveau: 3, texte: "b) Vision" },
    { type: "zoneTexte", cle: "I1.vision", consigne: "Donnée de référence." },
    { type: "titre", niveau: 3, texte: "c) Organisation administrative" },
    {
      type: "zoneTexte",
      cle: "I1.organisation",
      consigne:
        "Une DDEPIA, six DAEPIA (Dschang, Fokoué, Fongo-Tongo, Nkong-Ni, Penka-Michel, Santchou) et onze CZV.",
    },
    {
      // Tableau des structures, sans légende dans le régional, où il liste pour
      // chaque département ses DAEPIA, ses CZV et ses postes de contrôle. Ramené
      // au département : une ligne par arrondissement.
      type: "tableau",
      kind: "libre",
      numero: null,
      titre: "",
      entetes: ["Arrondissement", "DAEPIA", "CZV", "CCP/SA"],
      lignes: ["{ARRONDISSEMENTS}", "TOTAL"],
    },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 1,
      titre: "Etat des besoins en création de nouvelles structures",
      enteteLibelle: "STRUCTURES",
      lignes: [
        "CZV",
        "Centre de Contrôle de Pêche",
        "Centre d’alevinage",
        "DAEPIA",
        "Section d’enquêtes et statistique",
        "Check points",
        "Tueries",
        "Abattoirs",
        "Bain détiqueur",
        "Station Pilote d’Aquaculture communale",
        "TOTAL",
      ],
    },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 2,
      titre: "Responsables à désigner dans certains postes de responsabilités",
      enteteLibelle: "Structures",
      lignes: ["CZV", "DAEPIA", "Centre de Contrôle de Pêche", "Station d'Elevage", "CSDPAIH", "DDEPIA", "TOTAL"],
    },

    { type: "titre", niveau: 1, texte: "I-2. LES RESSOURCES HUMAINES" },
    { type: "titre", niveau: 2, texte: "I-2-1. Situation du personnel" },
    {
      type: "tableau",
      kind: "libre",
      numero: 3,
      titre: "Répartition du personnel par grade et par arrondissement",
      // Aligné sur le régional : les GRADES en lignes, les structures en
      // colonnes — le siège, puis chaque territoire. La colonne « DDEPIA » est
      // celle du siège départemental ; elle sort du rapport d'un arrondissement.
      // Deux fautes de frappe du régional sont corrigées : « Technicien
      // Supérieurs » et « aquacuture ».
      entetes: ["Grade", "DDEPIA", "{ARRONDISSEMENTS}", "TOTAL {P}", "TOTAL {P-1}"],
      lignes: [
        "Docteur Vétérinaire",
        "Technicien Supérieur d’élevage",
        "Infirmier Vétérinaire principal",
        "Infirmier Vétérinaire",
        "Infirmier vétérinaire adjoint",
        "Ingénieur agronome",
        "Ingénieur des Industries animales",
        "Ingénieur principal des travaux des industries animales",
        "Ingénieur des travaux des industries animales",
        "Technicien principal des industries animales",
        "Technicien des industries animales",
        "Technicien d’aquaculture",
        "Agent technique des industries animales",
        "Cadre contrac. Admi.",
        "Agent contractuel",
        "Agent de l’Etat",
        "Secrétaire",
        "TOTAL",
      ],
    },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 4,
      titre: "Synthèse des besoins en personnel par grade et par arrondissement",
      enteteLibelle: "Désignation",
      lignes: [
        "Docteur Vétérinaire",
        "Ingénieur des industries animales",
        "Ingénieur Principal des Industries Animales",
        "Ingénieur des travaux des industries anim.",
        "Ingénieur agronome",
        "Technicien principal des industries animales",
        "Technicien Adjoint des industries animales",
        "Secrétaire d'administration principal",
        "Cadre contractuel d'administration",
        "Infirmier Vétérinaire",
        "Infirmier Vétérinaire principal",
        "Technicien des industries animales",
        "Technicien de pêche",
        "Technicien d’aquaculture",
        "Technicien Principal d’Aquaculture",
        "Technicien d’élevage",
        "Technicien Supérieur d’élevage",
        "Infirmier vétérinaire adjoint",
        "Gardien",
        "Agent technique des Industries animales",
        "Agent technique d’aquaculture",
        "Cont. Adm.",
        "Agent de l’Etat",
        "Secrétaires",
        "TOTAL",
      ],
    },

    { type: "titre", niveau: 2, texte: "I-2-2. Mouvements du personnel" },
    {
      type: "zoneTexte",
      cle: "I2.mouvements",
      consigne: "Mouvements survenus au cours du trimestre, avec leurs dates.",
    },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 5,
      titre: "Mobilité du personnel",
      enteteLibelle: "NATURE",
      lignes: [
        "Abandon",
        "Affectation à l'intérieur de la même structure",
        "Affectation à partir d'une autre structure du MINEPIA",
        "Affectation vers une autre structure du MINEPIA",
        "Arrivées",
        "Cessation de fonctions",
        "Décès",
        "Départ en retraite effectif",
        "Départ en retraite imminent (année {A})",
        "Départs",
        "Formation/Recyclage",
        "Nominations",
        "Recrutements",
        "TOTAL",
      ],
    },

    { type: "titre", niveau: 2, texte: "I-2-3. Gestion des carrières" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 6,
      titre: "Rapport disciplinaire",
      enteteLibelle: "NATURE",
      lignes: [
        "Reclassement",
        "Promotion",
        "Félicitations",
        "Avertissement Verbal",
        // Rétablie d'après le canevas régional, qui fait foi : elle avait
        // disparu de l'adaptation départementale.
        "Demande D'Explication",
        "Lettre D'Observation",
        "Suspension de Salaire",
        "Avancement",
        "TOTAL",
      ],
    },

    { type: "titre", niveau: 1, texte: "I-3. LES INFRASTRUCTURES ET LA LOGISTIQUE" },
    { type: "titre", niveau: 2, texte: "I-3-1. Situation des infrastructures" },
    {
      type: "tableau",
      kind: "libre",
      numero: 7,
      // Le régional porte une colonne « DEFICIT » après le total : elle avait
      // disparu de l'adaptation départementale. Ce tableau devient donc
      // « libre » pour pouvoir la rétablir après les colonnes de total.
      titre: "Situation des infrastructures",
      entetes: ["Désignation", "{ARRONDISSEMENTS}", "TOTAL {P}", "TOTAL {P-1}", "DEFICIT"],
      lignes: [
        "Propriété de l'Etat",
        "Abattoir",
        "Aire d'abattage",
        "Bain détiqueur",
        "Barrage de retenue d'eau",
        "Bief",
        "Case de passage",
        "Centre d'Alevinage",
        "Centre de Pêche",
        "CNFZV",
        "CZV",
        "DAEPIA",
        "DDEPIA",
        "Ecurie",
        "Forage",
        "Fumoir",
        "Halle de vente de poissons",
        "Laboratoire Régionale",
        "Logements d'astreinte",
        "Marché à bétail",
        "Mare",
        "Parc de transit et de quarantaine",
        "Parc vaccinogène",
        "Centre de Contrôle de Pêche",
        "Puits",
        "Station Aquacole",
        "Station d'Impulsion et de Modern. de l'Elevage",
        "Tuerie",
        "Bâtiments en location",
        "Centre d'Alevinage",
        "TOTAL",
      ],
    },

    { type: "titre", niveau: 2, texte: "I-3-2. Situation du matériel de transport" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 8,
      titre: "Situation du matériel de transport",
      enteteLibelle: "TYPE",
      lignes: [
        "Station Wagon 4WD",
        "Pick-up double cabine 4WD",
        "Berline (9 CV)",
        "Moto",
        "Pirogue à moteur",
        "Station Wagon 4WD",
        "Pick-up double cabine 4WD",
        "Pick-up simple cabine",
        "SUZIKI (4x4)",
        "Berline",
        "Moto",
        "Pirogue à moteur",
        "TOTAL",
      ],
    },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 9,
      titre: "Besoins en matériel de transport",
      enteteLibelle: "TYPE",
      lignes: ["SUZIKI (4x4)", "PICK-UP DOUBLE CABINE 4WD", "MOTOS", "PIROGUES A MOTEUR", "TOTAL"],
    },

    { type: "titre", niveau: 2, texte: "I-3-3. Situation des équipements" },
    {
      type: "tableau",
      kind: "arrondissements",
      numero: 10,
      titre: "La situation des équipements",
      enteteLibelle: "Désignation",
      lignes: [
        "Congélateurs",
        "CT phone Internet",
        "Ecran pour vidéoprojecteur",
        "Fax",
        "GPS",
        "Ecran plasma (téléviseur)",
        "Groupes électrogènes",
        "Imprimantes",
        "Gillet de sauvetage",
        "Ordinateurs de bureau",
        "scanner",
        "Ordinateurs portables",
        "Photocopieurs",
        "Réfrigérateurs",
        "Téléphone",
        "Vidéoprojecteur",
        "Machines à écrire",
        "Téléphone portable",
        "TOTAL",
      ],
    },

    { type: "titre", niveau: 1, texte: "I-4. CRÉDITS ET RECETTES" },
    {
      type: "tableau",
      kind: "libre",
      numero: 11,
      titre: "Répartition de masse du budget",
      entetes: ["RUBRIQUES", "MONTANT"],
      lignes: [
        "DEPENSES C2D",
        "DELEGATIONS AUTOMATIQUES DANS LA DECENTRALISATION",
        "DEPENSES EN MARCHES PUBLICS DES SERVICES CENTRAUX",
        "DEPENSES SOUS FORMES D’APPUIS AUX EPA ET AUX OP",
        "TOTAL",
      ],
    },
    {
      type: "tableau",
      kind: "libre",
      numero: 12,
      titre: "Synthèse des crédits par arrondissement",
      entetes: ["Arrondissement", "Fonctionnement", "Total", "TOTAL {P}", "TOTAL {P-1}"],
      // {ARRONDISSEMENTS} plutôt que les six noms : le jour où le SID servira
      // un autre département, la liste viendra de la base.
      lignes: ["{ARRONDISSEMENTS}", "TOTAL {P}", "TOTAL {P-1}", "ÉCART"],
    },
    {
      // Pendant du tableau n° 12 pour l'investissement. Le régional le titre en
      // texte simple, sans numéro : il reçoit ici une légende, pour entrer dans
      // la liste des tableaux comme son pendant.
      type: "tableau",
      kind: "libre",
      numero: null,
      titre: "Synthèse des crédits d’investissement par arrondissement",
      entetes: ["Arrondissement", "Investissement", "Total", "TOTAL {P}", "TOTAL {P-1}"],
      lignes: ["{ARRONDISSEMENTS}", "TOTAL {P}", "TOTAL {P-1}", "ÉCART"],
    },

    { type: "titre", niveau: 2, texte: "I-4-1. État des recettes" },
    {
      type: "zoneTexte",
      cle: "I4.recettes.preambule",
      consigne:
        "Le canevas régional impose les mois en lignes et les structures en colonnes. Pour le trimestre : trois lignes de mois et une ligne de total.",
    },
    {
      type: "tableau",
      kind: "libre",
      numero: 13,
      titre: "Synthèse des recettes par régie et par mois",
      entetes: ["MOIS", "DDEPIA", "{ARRONDISSEMENTS}", "TOTAL"],
      lignes: ["{M1}", "{M2}", "{M3}", "TOTAL {P}", "TOTAL {P-1}", "ÉCART"],
    },

    { type: "titre", niveau: 3, texte: "Performances par structure" },
    {
      type: "zoneTexte",
      cle: "I4.performances",
      consigne: "Analyse des réalisations par régie au regard des objectifs assignés.",
    },
    { type: "titre", niveau: 3, texte: "Difficultés rencontrées" },
    { type: "zoneTexte", cle: "I4.difficultes", consigne: "Rubrique imposée par le canevas régional." },
    { type: "titre", niveau: 3, texte: "Perspectives" },
    { type: "zoneTexte", cle: "I4.perspectives", consigne: "Rubrique imposée par le canevas régional." },

    {
      type: "titre",
      niveau: 1,
      texte: "I-5. PROJETS, PROGRAMMES, ORGANISMES SOUS TUTELLE DU MINEPIA ET PARTENAIRES AU DÉVELOPPEMENT",
    },
    // « I.3 » dans le régional, qui la place après I-4 : numérotée I-5 ici.
    // La station de Kounden (I.3.3 du régional), structure régionale, n'a pas
    // sa place dans un rapport départemental (décision D1).
    { type: "titre", niveau: 2, texte: "I-5-1. C2D-PCP-AFOP / SECAL" },
    {
      type: "zoneTexte",
      cle: "I5.afop",
      consigne: "Activités réalisées, résultats obtenus, difficultés, leçons tirées.",
    },
    { type: "titre", niveau: 2, texte: "I-5-2. PCP-ACEFA" },
    {
      type: "zoneTexte",
      cle: "I5.acefa",
      consigne: "Activités par composante, résultats, difficultés et perspectives.",
    },
    {
      type: "titre",
      niveau: 2,
      texte: "I-5-3. PROJET DE DÉVELOPPEMENT DES CHAÎNES DE VALEUR DE L’ÉLEVAGE ET DE LA PISCICULTURE (PDCVEP)",
    },
    {
      type: "zoneTexte",
      cle: "I5.pdcvep",
      consigne: "État d’avancement des principales activités du projet dans le département, par composante.",
    },
    // Les rubriques B, C et D sont celles du compte rendu du PDCVEP dans le
    // régional : elles suivent donc le projet, au niveau inférieur.
    { type: "titre", niveau: 4, texte: "B. Autres activités et commentaires" },
    { type: "zoneTexte", cle: "I5.autres", consigne: "Rubrique B du canevas régional." },
    { type: "titre", niveau: 4, texte: "C. Résumé des contraintes stratégiques et solutions proposées (maximum 03)" },
    {
      type: "zoneTexte",
      cle: "I5.contraintes.preambule",
      consigne: "Rubrique C du canevas régional. Trois contraintes au maximum.",
    },
    {
      type: "tableau",
      kind: "libre",
      numero: null,
      titre: "Contraintes stratégiques et solutions proposées",
      entetes: ["N°", "Contrainte stratégique", "Solution proposée"],
      lignes: ["1", "2", "3"],
    },
    { type: "titre", niveau: 4, texte: "D. Autres points d’attention d’importance stratégique (s’il en existe)" },
    {
      type: "zoneTexte",
      cle: "I5.attention",
      consigne: "Rubrique D du canevas régional, s'il en existe.",
    },
  ],
};

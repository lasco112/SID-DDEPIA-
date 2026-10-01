/**
 * Le contenu des visites guidées, écran par écran (voir lib/visites.ts).
 *
 * Écrire une bulle : une ou deux phrases, ce que fait le bouton et QUAND s'en
 * servir. Une étape dont l'élément n'est pas à l'écran (bouton absent pour ce
 * rôle, tableau vide…) est simplement sautée.
 *
 * Ajouter une étape à un écran déjà en service : augmenter `version` et
 * donner à l'étape `depuis: <nouvelle version>` — seule elle sera montrée à
 * ceux qui ont déjà vu la visite.
 */
import type { DefinitionVisite } from "./visites";

const estAgent = (role: string) => role === "AGENT_SAISIE";

const ENVOYER = (role: string) =>
  estAgent(role)
    ? "Envoie vos saisies à votre Délégué d'Arrondissement. C'est lui qui transmettra le rapport au DD."
    : "Quand tout est rempli : envoie vos saisies ET transmet le rapport au DD. Ensuite il n'est plus modifiable, sauf si le DD vous le renvoie.";

export const VISITES: Record<string, DefinitionVisite> = {
  // ------------------------------------------------------------ bandeau commun
  bandeau: {
    version: 1,
    etapes: [
      { cible: "menu", titre: "Le menu", texte: "Ouvre la liste de tout ce que vous pouvez faire : rapport mensuel, rapport trimestriel, et le reste." },
      { cible: "periode", titre: "Le mois de travail", texte: "Le mois sur lequel vous travaillez. Changez-le ici pour saisir ou relire un autre mois." },
      { cible: "cloche", titre: "Les notifications", texte: "Les messages du SID et du DD : rapport renvoyé, validation, rappel… Un chiffre rouge = message non lu." },
      { cible: "en-ligne", titre: "Réseau", texte: "Vert : vous avez du réseau, tout part seul vers le serveur. Sans réseau, tout est gardé sur le téléphone et partira plus tard." },
      { cible: "deconnexion", titre: "Se déconnecter", texte: "À utiliser sur un téléphone partagé, pour que le suivant n'entre pas dans votre compte." },
    ],
  },

  // ------------------------------------------------------------ À corriger
  "a-corriger": {
    version: 1,
    etapes: [
      {
        cible: "compteur-corriger",
        titre: "Le compteur « à corriger »",
        texte: "Présent en haut de tous les écrans : combien de points sont à corriger. Rouge = quelque chose bloque l'envoi d'un rapport ; orange = à vérifier. Touchez-le pour revenir ici.",
      },
      { cible: "filtres-corriger", titre: "Trier", texte: "Voyez tout, ou seulement le mensuel, ou seulement le trimestriel." },
      { cible: "tout-corriger", titre: "Tout corriger dans l'ordre", texte: "Le plus simple : le SID vous emmène au premier point, puis au suivant, sans rien chercher." },
      { cible: "point-corriger", titre: "Un point", texte: "Chaque point dit OÙ est le problème, CE QUI ne va pas et QUE FAIRE. Bande rouge : bloquant. Bande orange : à vérifier." },
      { cible: "comment-faire", titre: "Comment faire, pas à pas", texte: "Pas sûr de vous ? Touchez ici : la raison du problème, puis les gestes un par un, avec le nom des boutons." },
      { cible: "aller-corriger", titre: "Aller corriger", texte: "Ouvre l'écran exact — le bon mois, le bon tableau — avec l'endroit fautif encadré en rouge." },
      {
        cible: "demander-dd",
        titre: "Demander au DD",
        texte: "Quand seul le DD peut débloquer (rapport déjà transmis, mois verrouillé), ce bouton le prévient à votre place, avec le mois et le tableau.",
      },
    ],
  },

  // La barre du bas, pendant qu'on corrige.
  parcours: {
    version: 1,
    etapes: [
      { cible: "parcours-texte", titre: "La barre de correction", texte: "Elle vous suit pendant la correction : où vous en êtes (point 2 sur 5) et ce qui ne va pas." },
      { cible: "parcours-suivant", titre: "Point suivant", texte: "Passe au point suivant. Quand le point en cours est corrigé, la barre l'annonce et ce bouton devient vert." },
      { cible: "parcours-precedent", titre: "Point précédent", texte: "Revient au point d'avant." },
      { cible: "parcours-aide", titre: "Comment faire ?", texte: "Ouvre l'explication pas à pas du point en cours. Touchez encore pour la refermer." },
      { cible: "parcours-liste", titre: "La liste", texte: "Revient à la liste de tous les points à corriger." },
      { cible: "parcours-fermer", titre: "Fermer", texte: "Ferme la barre. Le compteur rouge, en haut, vous ramène à la liste quand vous voulez." },
    ],
  },

  // ------------------------------------------------------------ Mensuel
  "mensuel-liste": {
    version: 1,
    etapes: [
      { cible: "statut-rapport", titre: "L'état du rapport", texte: "Où en est votre rapport du mois : en saisie, soumis (transmis au DD), ou renvoyé pour correction — avec le motif." },
      { cible: "envoyer", titre: "Envoyer", texte: ENVOYER },
      { cible: "attente", titre: "En attente", texte: "Combien de saisies sont encore sur le téléphone. Avec du réseau, elles partent toutes seules." },
      {
        cible: "sauvegarde",
        titre: "Sauvegarde du téléphone",
        texte: "Crée une copie de toutes vos saisies. À envoyer au DD si le téléphone pose problème : rien n'est perdu.",
      },
      {
        cible: "liste-tableaux",
        titre: "Les 28 tableaux",
        texte: "Rangés par section. Touchez un tableau pour le remplir. Une pastille rouge « à corriger » ou jaune « à confirmer » signale un tableau à revoir.",
      },
    ],
  },
  "mensuel-tableau": {
    version: 1,
    etapes: [
      { cible: "retour-liste", titre: "Tous les tableaux", texte: "Revient à la liste des 28 tableaux." },
      {
        cible: "valeur",
        titre: "Saisir un chiffre",
        texte: "Tapez le chiffre du mois. Il est gardé aussitôt sur le téléphone, puis part au serveur dès qu'il y a du réseau. Zéro se tape 0 : ce n'est pas la même chose qu'une case vide.",
      },
      {
        cible: "nd",
        titre: "N/D : chiffre non disponible",
        texte: "Vous n'avez pas le chiffre ? Cochez N/D et écrivez pourquoi : le motif est obligatoire.",
      },
      {
        cible: "statut-case",
        titre: "L'état de chaque case",
        texte: "Enregistrée sur l'appareil → en attente → synchronisée (arrivée au serveur). « Erreur » : la case n'est pas partie ; le compteur rouge en haut dit pourquoi.",
      },
      { cible: "ajouter-ligne", titre: "Ajouter un événement", texte: "Une vaccination, un foyer, une saisie… : une ligne par événement. Touchez « + Ajouter un événement », puis remplissez la ligne." },
      {
        cible: "confirmer",
        titre: "Confirmer ce tableau",
        texte: "Des chiffres repris du mois précédent (en gris) ? Vérifiez-les, corrigez ce qui a changé, puis confirmez ici : sinon le rapport ne peut pas partir.",
      },
      { cible: "tableau-suivant", titre: "Tableau suivant", texte: "Passe au tableau suivant, sans revenir à la liste." },
      { cible: "envoyer", titre: "Envoyer", texte: ENVOYER },
    ],
  },

  // ------------------------------------------------------------ Trimestriel
  "trimestre-saisie-liste": {
    version: 1,
    etapes: [
      {
        cible: "fil-etapes",
        titre: "Les étapes du rapport trimestriel",
        texte: "Le rapport se fait en plusieurs étapes, dans l'ordre. Le rond foncé est l'étape où vous êtes ; touchez un numéro pour y aller.",
      },
      { cible: "reprendre", titre: "Reprendre", texte: "Rouvre le dernier tableau sur lequel vous avez travaillé, même après avoir fermé l'application." },
      { cible: "prochain", titre: "Prochain tableau à compléter", texte: "Vous emmène au prochain tableau qui n'est pas encore fini." },
      { cible: "filtres-trimestre", titre: "Tous ou à compléter", texte: "« À compléter » cache les tableaux déjà finis : il ne reste que le travail à faire." },
      {
        cible: "section-trimestre",
        titre: "Une section",
        texte: "Touchez le titre pour ouvrir ou fermer la section. Le chiffre dit combien de tableaux sont complets.",
      },
      { cible: "etape-suivante", titre: "Étape suivante", texte: "Quand les tableaux sont faits, passez à l'étape suivante." },
    ],
  },
  "trimestre-saisie-tableau": {
    version: 1,
    etapes: [
      {
        cible: "case-saisie",
        titre: "Case blanche : à saisir",
        texte: "Tapez le chiffre, puis touchez ailleurs : la case s'enregistre seule. Les totaux se recalculent aussitôt.",
      },
      { cible: "case-grise", titre: "Case grise : calculée", texte: "Calculée par le SID, à partir de vos rapports mensuels ou comme total. Elle ne se saisit pas." },
      {
        cible: "case-an-passe",
        titre: "Le chiffre de l'an passé",
        texte: "La case « TOTAL » de l'année dernière : le SID ne l'a pas encore, c'est à vous de la donner, à partir de vos rapports de l'époque. Sans elle, pas de comparaison sur un an.",
      },
      { cible: "tableau-suivant-trimestre", titre: "Tableau suivant", texte: "Passe au tableau suivant, sans revenir à la liste." },
      { cible: "retour-liste-trimestre", titre: "Tous les tableaux", texte: "Revient à la liste des tableaux du trimestre." },
    ],
  },
  "analyses-liste": {
    version: 1,
    etapes: [
      {
        cible: "anpasse-compteur",
        titre: "Le chiffre de l'an passé",
        texte: "Ces tableaux n'ont pas le chiffre de l'année dernière : sans lui, l'analyse ne peut pas dire si l'activité a augmenté ou baissé. Touchez « Les saisir un par un ».",
      },
      { cible: "commencer-relecture", titre: "Commencer la relecture", texte: "Ouvre la première analyse à relire. Vous passerez ensuite de l'une à l'autre." },
      {
        cible: "analyse-item",
        titre: "Une analyse",
        texte: "Le texte que le SID écrit sous chaque tableau, à partir des chiffres. « À valider » : à relire ; « Chiffres modifiés » : à relire de nouveau.",
      },
    ],
  },
  "analyses-detail": {
    version: 1,
    etapes: [
      { cible: "texte-analyse", titre: "Le texte proposé", texte: "Écrit par le SID à partir des chiffres du tableau. C'est ce qui figurera dans le rapport." },
      { cible: "voir-calcul", titre: "Voir le calcul", texte: "Montre d'où vient chaque chiffre de la phrase, pour vérifier." },
      { cible: "anpasse-case", titre: "Le chiffre de l'an passé", texte: "Tapez ici le total de l'année dernière, puis « Enregistrer » : l'analyse est recalculée avec la comparaison." },
      { cible: "explication", titre: "Explication", texte: "Facultatif : la cause d'une hausse ou d'une baisse, que les chiffres ne disent pas. Elle s'ajoute à la fin du texte." },
      { cible: "valider-analyse", titre: "Valider et passer au suivant", texte: "Le texte est juste : validez, et le SID ouvre l'analyse suivante." },
      { cible: "corriger-texte", titre: "Corriger le texte", texte: "Pour changer une tournure. Les chiffres, eux, viennent du tableau." },
    ],
  },

  // ------------------------------------------------------------ Accueil
  accueil: {
    version: 1,
    etapes: [
      { cible: "carte-rapport", titre: "Vos rapports du moment", texte: "Une carte par rapport en cours : le mensuel, le trimestriel… La carte marquée « À faire maintenant » passe en premier." },
      { cible: "etat-rapport", titre: "Où vous en êtes", texte: "L'état du rapport en une phrase : ce qui est fait, ce qui reste, la date limite." },
      { cible: "bouton-carte", titre: "Le bouton principal", texte: "Vous emmène directement là où il faut travailler." },
      { cible: "etapes-carte", titre: "Les étapes", texte: "Le rapport trimestriel se fait en étapes numérotées, dans l'ordre. Touchez une étape pour l'ouvrir." },
      { cible: "notifications-accueil", titre: "Les dernières notifications", texte: "Les messages récents : rapport renvoyé, validation, rappel de date limite…" },
    ],
  },

  // ------------------------------------------------------------ Trimestre, étapes 3 à 5
  rubriques: {
    version: 1,
    etapes: [
      { cible: "periode-rubriques", titre: "Le trimestre", texte: "Le trimestre dont vous rédigez les textes. « changer de période » pour en choisir un autre." },
      { cible: "filtres-rubriques", titre: "Toutes ou à rédiger", texte: "« À rédiger » ne montre que les rubriques encore vides. La barre au-dessus montre l'avancement." },
      { cible: "section-rubriques", titre: "Une section", texte: "Touchez le titre pour ouvrir ou fermer la section. À droite : combien de rubriques restent à rédiger." },
      { cible: "rubrique-item", titre: "Une rubrique", texte: "Touchez une rubrique pour l'écrire. Le point de couleur dit son état : à rédiger, rédigée, texte modèle, automatique." },
    ],
  },
  "rubrique-ouverte": {
    version: 1,
    etapes: [
      { cible: "consigne", titre: "La consigne", texte: "Ce qu'on attend dans cette rubrique." },
      { cible: "voir-tableau-rubrique", titre: "Voir le tableau", texte: "Ouvre le tableau dont parle la rubrique, pour écrire avec les chiffres sous les yeux." },
      { cible: "texte-modele", titre: "Reprendre le texte modèle", texte: "Met dans la case un texte type, à adapter." },
      { cible: "texte-precedent", titre: "Reprendre le texte du trimestre précédent", texte: "Recopie ce que vous aviez écrit le trimestre dernier, à mettre à jour." },
      { cible: "texte-automatique", titre: "Texte automatique", texte: "Le SID a rédigé cette rubrique à partir des chiffres ; elle suit les chiffres toute seule. « Modifier ce texte » pour l'écrire vous-même." },
      { cible: "rubrique-texte", titre: "Votre texte", texte: "Écrivez ici. Le texte s'enregistre quand vous quittez la case. Laissée vide, la rubrique porte « Néant. » dans le rapport." },
      { cible: "rubrique-suivante", titre: "Enregistrer et rubrique suivante", texte: "Enregistre, puis ouvre la rubrique suivante à rédiger." },
    ],
  },
  circuit: {
    version: 1,
    etapes: [
      { cible: "circuit-etapes", titre: "Le circuit du rapport", texte: "Qui fait quoi, dans l'ordre : les arrondissements transmettent, les chefs valident leur domaine, puis le DD produit le rapport." },
      { cible: "circuit-sien", titre: "Votre rapport", texte: "L'état du rapport de votre arrondissement : en préparation, transmis, ou renvoyé — avec le motif." },
      {
        cible: "circuit-transmettre",
        titre: "Transmettre au Délégué départemental",
        texte: "Quand tableaux, analyses et textes sont prêts : transmet le rapport au DD. Il n'est plus modifiable ensuite, sauf renvoi.",
      },
      { cible: "circuit-arrondissements", titre: "Les six arrondissements", texte: "Où en est chaque arrondissement : transmis ou non, et quand." },
      { cible: "circuit-renvoyer", titre: "Renvoyer pour correction", texte: "Rouvre le rapport d'un arrondissement, avec un motif : le DA est prévenu." },
      { cible: "circuit-relais", titre: "En tant que DD", texte: "Si un DA ou un chef ne peut pas le faire, le DD transmet ou valide à sa place, avec un motif. C'est noté « par le DD »." },
      { cible: "circuit-sections", titre: "Les quatre domaines", texte: "Chaque chef de section valide son domaine (analyses et textes) quand les six arrondissements ont transmis." },
      { cible: "circuit-valider", titre: "Valider ma section", texte: "Valide votre domaine du rapport trimestriel. Ses analyses et textes ne seront plus modifiables." },
    ],
  },
  "rapport-da": {
    version: 1,
    etapes: [
      { cible: "choix-rapport", titre: "Quel rapport ?", texte: "Trimestriel, semestriel ou annuel, puis la période. Le semestriel et l'annuel se calculent seuls à partir de vos trimestres." },
      { cible: "mois-periode", titre: "Les mois de la période", texte: "Chaque mois doit être transmis. Un mois manquant : seul un brouillon peut être produit." },
      { cible: "generer-brouillon", titre: "Générer un brouillon", texte: "Produit le document à tout moment, pour le relire avant de transmettre." },
      { cible: "generer-definitif", titre: "Générer mon rapport", texte: "Le document définitif, une fois le rapport transmis au DD (étape 5)." },
    ],
  },
  "rapport-dd": {
    version: 1,
    etapes: [
      { cible: "choix-rapport", titre: "Quel rapport ?", texte: "Trimestriel, semestriel ou annuel, puis la période." },
      { cible: "mois-periode", titre: "Les mois de la période", texte: "Combien d'arrondissements ont transmis chaque mois. « Voir qui n'a pas transmis » ouvre la Supervision de ce mois." },
      { cible: "faits-notables", titre: "Ce que le rapport dira", texte: "Les évolutions les plus marquantes, chacune avec son calcul." },
      { cible: "generer-brouillon", titre: "Générer un brouillon", texte: "Un aperçu à tout moment, marqué provisoire." },
      { cible: "generer-definitif", titre: "Générer le rapport trimestriel", texte: "Le document définitif, quand les mois sont complets et le circuit achevé." },
      { cible: "finaliser-dd", titre: "Finaliser en tant que DD", texte: "Si un DA ou un chef fait défaut : vous finalisez à sa place, motif à l'appui, puis le rapport définitif est produit." },
    ],
  },

  // ------------------------------------------------------------ Outils
  "admin-comptes": {
    version: 1,
    etapes: [
      { cible: "nouveau-compte", titre: "Nouveau compte", texte: "Crée un compte : nom, rôle, arrondissement ou section. Notez l'identifiant et le mot de passe temporaire affichés : ils ne s'affichent qu'une fois." },
      { cible: "recherche-comptes", titre: "Rechercher", texte: "Retrouvez un compte par son nom, son identifiant, son rôle ou son rattachement." },
      {
        cible: "actions-compte",
        titre: "Gérer un compte",
        texte: "Autoriser ou désactiver, réinitialiser le mot de passe, révoquer l'appareil (téléphone perdu), supprimer.",
      },
    ],
  },
  "dd-periodes": {
    version: 1,
    etapes: [
      { cible: "mois-suivant", titre: "Le mois suivant", texte: "Ouvrez le mois suivant ici : tant qu'il n'est pas ouvert, les arrondissements ne peuvent rien y saisir." },
      { cible: "autre-mois", titre: "Créer un autre mois", texte: "Pour un mois passé à reconstituer, par exemple." },
      { cible: "actions-periode", titre: "Les actions d'un mois", texte: "« Travailler sur ce mois » change votre mois de travail ; « Fermer la saisie » / « Rouvrir la saisie » bloque ou rouvre la saisie des arrondissements." },
    ],
  },
  "dd-donnees": {
    version: 1,
    etapes: [
      { cible: "choix-arrondissement", titre: "Quel arrondissement ?", texte: "La vue départementale montre les six côte à côte ; touchez un nom pour n'en voir qu'un." },
      { cible: "choix-tableau-dd", titre: "Quel tableau ?", texte: "Choisissez un des 28 tableaux du mois." },
      { cible: "valeur-corrigeable", titre: "Corriger une valeur", texte: "Touchez un chiffre pour le corriger. Le motif est obligatoire et la modification reste dans l'historique." },
    ],
  },
  etablissements: {
    version: 1,
    etapes: [
      { cible: "types-etablissement", titre: "Le type d'établissement", texte: "Choisissez la liste à gérer : fermes, marchés, abattoirs…" },
      { cible: "ajouter-etablissement", titre: "Ajouter", texte: "Nom et localité sont obligatoires. Le nouvel établissement apparaît aussitôt dans les tableaux de saisie." },
      { cible: "modifier-etablissement", titre: "Corriger", texte: "Touchez un nom ou une localité pour le corriger ; c'est enregistré quand vous quittez la case." },
      { cible: "actif-etablissement", titre: "Actif / inactif", texte: "Un établissement fermé se désactive : il disparaît de la saisie mais son historique est gardé." },
    ],
  },
  "da-assignations": {
    version: 1,
    etapes: [
      { cible: "attribuer-section", titre: "Toute une section", texte: "Confie d'un coup tous les tableaux d'une section à un agent." },
      { cible: "attribuer-tableau", titre: "Un tableau", texte: "Ou tableau par tableau. C'est indicatif : chacun peut toujours tout saisir." },
    ],
  },
  "da-supervision-agents": {
    version: 1,
    etapes: [{ cible: "agent", titre: "Un agent", texte: "Combien de données il a saisies ce mois-ci, et quand. Touchez pour voir le détail, case par case." }],
  },
  synchronisation: {
    version: 1,
    etapes: [
      { cible: "etat-synchro", titre: "L'état du téléphone", texte: "Ce qui est sur ce téléphone : saisies en attente, en erreur, dernier envoi réussi." },
      { cible: "synchroniser", titre: "Synchroniser maintenant", texte: "Envoie tout de suite ce qui attend. Cela met vos données à l'abri, sans transmettre le rapport." },
    ],
  },
  securite: {
    version: 1,
    etapes: [{ cible: "code-pin", titre: "Le code PIN", texte: "Sur un téléphone partagé, un code PIN protège vos données : il est demandé à l'ouverture de l'application." }],
  },
  "section-synthese": {
    version: 1,
    etapes: [
      { cible: "synthese-texte", titre: "La synthèse de votre section", texte: "Faits marquants, difficultés, recommandations du mois. Le DD la valide avant qu'elle entre au rapport." },
      { cible: "synthese-enregistrer", titre: "Enregistrer la synthèse", texte: "Enregistre le texte. Vous pouvez y revenir tant que le DD ne l'a pas validé." },
    ],
  },
  "dd-thematique": {
    version: 1,
    etapes: [
      { cible: "filtre-espece", titre: "Choisir le sujet", texte: "Espèce, domaine, arrondissement : touchez pour choisir. Rien de choisi = tout." },
      { cible: "filtre-periode", titre: "Choisir les mois", texte: "Au moins un mois." },
      { cible: "generer-thematique", titre: "Produire le rapport", texte: "En Excel, en Word ou en PDF." },
    ],
  },
  "dd-referentiels": {
    version: 1,
    etapes: [{ cible: "decider-referentiel", titre: "Valider ou rejeter", texte: "Un agent a proposé un nouvel élément (une maladie, un vaccin…). Validé, il apparaît dans les listes de saisie." }],
  },
  "technique-sante": {
    version: 1,
    etapes: [
      { cible: "sante-base", titre: "La base de données", texte: "Vert : la base répond." },
      { cible: "sante-sauvegarde", titre: "La dernière sauvegarde", texte: "Quand a eu lieu la dernière sauvegarde de la base." },
      { cible: "sante-actualiser", titre: "Actualiser", texte: "Relit l'état du système." },
    ],
  },
  "technique-sauvegarde": {
    version: 1,
    etapes: [
      { cible: "declencher-sauvegarde", titre: "Sauvegarder maintenant", texte: "Lance une sauvegarde de la base, en plus de celle de chaque nuit." },
      { cible: "liste-sauvegardes", titre: "Les sauvegardes", texte: "Les sauvegardes existantes, avec leur date." },
    ],
  },
  "technique-referentiels": {
    version: 1,
    etapes: [
      { cible: "categories-referentiel", titre: "La liste", texte: "Choisissez la liste à gérer : maladies, vaccins, espèces…" },
      { cible: "ajouter-referentiel", titre: "Ajouter un item", texte: "Le code ne doit plus changer ensuite ; le libellé, lui, se corrige." },
    ],
  },
  "aide-questions": {
    version: 1,
    etapes: [{ cible: "marquer-traite", titre: "Marquer comme traité", texte: "Une fois la réponse donnée à la personne, rangez la question." }],
  },
  "journal-activite": {
    version: 1,
    etapes: [{ cible: "filtre-journal", titre: "Le journal", texte: "Qui a fait quoi, et quand. Filtrez par action pour retrouver un envoi, une correction, une validation…" }],
  },

  // ------------------------------------------------------------ DD et chefs
  "dd-supervision": {
    version: 1,
    etapes: [
      {
        cible: "generer-dd",
        titre: "Produire les documents du mois",
        texte: "L'aperçu se produit à tout moment, pour voir ce qui manque. Le rapport définitif attend les six arrondissements et les quatre sections.",
      },
      {
        cible: "validations-dd",
        titre: "Ce qui bloque",
        texte: "Qui n'a pas transmis, quelle section n'a pas validé. Un chef défaillant : « Valider en tant que DD ».",
      },
      {
        cible: "etat-arrondissements",
        titre: "Les six arrondissements",
        texte: "Pour chacun : l'état du rapport, son remplissage, ses données, et le rapport qu'il a transmis.",
      },
      {
        cible: "renvoyer-da",
        titre: "Renvoyer au DA pour correction",
        texte: "Rouvre un rapport déjà transmis : le DA est prévenu avec votre motif, et ses corrections partent toutes seules. Une demande du DA s'affiche juste au-dessus.",
      },
      { cible: "cloture-dd", titre: "Clôturer la période", texte: "Fige les chiffres du mois, une fois le rapport définitif produit. Réouverture possible, avec un motif." },
    ],
  },
  "section-controle": {
    version: 1,
    etapes: [
      { cible: "liste-section", titre: "Les tableaux de votre section", texte: "Choisissez un tableau : vous voyez les chiffres des six arrondissements côte à côte." },
      {
        cible: "valider-section",
        titre: "Valider ma section",
        texte: "Quand tout est contrôlé : vous validez votre section pour le mois. Le rapport du département l'attend.",
      },
    ],
  },
};

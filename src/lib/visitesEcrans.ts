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

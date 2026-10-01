/**
 * Les guides de correction : POURQUOI le SID signale ce point, et COMMENT le
 * régler, pas à pas, avec le nom exact des boutons (demande du Délégué,
 * 1er octobre 2026 : « nous sommes encore en phase d'apprentissage et
 * d'imprégnation — quand on lui dit qu'il n'a pas validé les données reprises,
 * qu'il sache clairement ce qu'il a à faire »).
 *
 * Règles d'écriture : des phrases courtes, à l'impératif ; le nom du bouton
 * entre « » tel qu'il est écrit à l'écran ; où il se trouve (en haut, en bas,
 * dans l'encadré jaune). Un bouton renommé à l'écran doit l'être ici aussi.
 */

export type NaturePoint =
  | "refus_soumis"
  | "refus_verrou"
  | "refus_cloture"
  | "refus_motif"
  | "refus_ligne"
  | "refus_reseau"
  | "reprise"
  | "renvoi_mensuel"
  | "retard_da"
  | "validation_chef"
  | "production_dd"
  | "demande_dd"
  | "grille_categories"
  | "grille_lettres"
  | "grille_bac"
  | "grille_autre"
  | "analyse"
  | "file_trimestre"
  | "renvoi_trimestre";

export interface Guide {
  /** Pourquoi le SID le signale — en mots simples. */
  pourquoi: string;
  /** Les gestes, dans l'ordre. */
  etapes: string[];
}

/** Ce qui change selon la personne : à qui elle envoie, et si elle peut transmettre. */
export interface ContexteGuide {
  role: string;
}

const envoyer = (c: ContexteGuide) =>
  c.role === "AGENT_SAISIE" ? "« Envoyer au Délégué d'Arrondissement »" : "« Envoyer au Délégué Départemental »";

export function guideDe(nature: NaturePoint, c: ContexteGuide): Guide {
  switch (nature) {
    case "reprise":
      return {
        pourquoi:
          "Au début de chaque mois, le SID recopie les chiffres du mois précédent pour vous faire gagner du temps. Ces chiffres sont " +
          "écrits en GRIS : ce ne sont PAS encore ceux de ce mois. Tant que vous ne les avez pas vérifiés et confirmés, le rapport ne " +
          "peut pas partir — sinon on déclarerait au DD les chiffres du mois dernier comme s'ils étaient ceux de ce mois.",
        etapes: [
          "Dans le tableau qui s'ouvre, repérez les cases grises (encadrées en rouge) : il est écrit à côté « repris du mois précédent ».",
          "Pour chaque case grise, demandez-vous : ce chiffre a-t-il changé ce mois-ci ?",
          "S'il a changé, effacez-le et tapez le bon chiffre : la case redevient normale.",
          "S'il est toujours juste (un effectif qui n'a pas bougé, par exemple), n'y touchez pas.",
          "Descendez sous le tableau : dans l'encadré jaune (« … valeurs sont reprises du mois précédent… »), cliquez le bouton « Confirmer ce tableau ». Il faut du réseau.",
          "Le message « Tableau confirmé » apparaît : ce tableau est réglé. Cliquez « Suivant » (la flèche, dans la barre du bas) pour passer au tableau suivant.",
          "Vous ne voyez ni case grise ni encadré jaune ? Rechargez la page avec du réseau. Si rien n'apparaît encore, prévenez le DD avec une capture d'écran.",
          c.role === "AGENT_SAISIE"
            ? "Quand tous les tableaux sont confirmés, prévenez votre DA : c'est lui qui transmet le rapport."
            : `Quand tous les tableaux sont confirmés, cliquez ${envoyer(c)} en haut de l'écran.`,
        ],
      };
    case "refus_soumis":
      return {
        pourquoi:
          "Quand un rapport est transmis au DD, il est verrouillé : plus rien n'y entre, pour que le DD travaille sur des chiffres qui " +
          "ne bougent plus. Votre correction a été faite APRÈS la transmission : elle est restée sur ce téléphone. Rien n'est perdu — " +
          "elle attend que le DD vous rouvre le rapport.",
        etapes: [
          "Regardez la ligne encadrée en rouge : c'est la correction qui attend sur le téléphone. Vérifiez qu'elle est juste.",
          "Cliquez « Demander au DD de me renvoyer ce rapport » (ici, ou dans la liste « À corriger »). Le DD reçoit votre demande avec le mois et le tableau.",
          "Attendez sa réponse : une notification « Votre rapport vous a été renvoyé » arrive dans la cloche, en haut de l'écran.",
          "Ouvrez l'application avec du réseau : votre correction part toute seule, sans rien retaper.",
          c.role === "AGENT_SAISIE"
            ? "Prévenez votre DA : il doit transmettre à nouveau le rapport."
            : `Cliquez ${envoyer(c)} pour transmettre à nouveau le rapport corrigé.`,
        ],
      };
    case "refus_verrou":
      return {
        pourquoi:
          "Après la date limite, le mois est verrouillé pour que le DD puisse produire le rapport du département. Vos saisies sont " +
          "restées sur ce téléphone : rien n'est perdu, mais seul le DD peut rouvrir le mois pour vous.",
        etapes: [
          "Vérifiez la ligne encadrée en rouge : c'est la saisie qui attend.",
          "Cliquez « Demander au DD un déverrouillage ». Le DD reçoit votre demande.",
          "Quand le DD a déverrouillé, ouvrez l'application avec du réseau : vos saisies partent toutes seules.",
          c.role === "AGENT_SAISIE" ? "Prévenez votre DA pour qu'il transmette le rapport." : `Puis cliquez ${envoyer(c)}.`,
        ],
      };
    case "refus_cloture":
      return {
        pourquoi:
          "Le mois est clôturé : ses chiffres sont définitivement figés, le rapport du département est produit. Seul le DD peut le rouvrir, " +
          "et il ne le fait que pour une raison sérieuse.",
        etapes: [
          "Vérifiez que la correction encadrée en rouge est vraiment nécessaire.",
          "Cliquez « Demander au DD de rouvrir ce mois » : il reçoit votre demande.",
          "S'il rouvre le mois, vos saisies partent toutes seules dès que vous avez du réseau.",
        ],
      };
    case "refus_motif":
      return {
        pourquoi:
          "Vous avez coché « N/D » (non disponible) sans dire pourquoi. Le SID distingue un vrai zéro d'un chiffre qu'on n'a pas pu " +
          "obtenir : pour ce second cas, le DD doit savoir la raison.",
        etapes: [
          "Sur la case encadrée en rouge, la petite case « N/D » est cochée.",
          "Juste en dessous, dans le champ « Motif obligatoire », écrivez la raison (exemples : « marché fermé ce mois », « pas de visite du poste »).",
          "Si en fait vous avez le chiffre : décochez « N/D » et tapez le chiffre dans la case. Zéro se tape 0.",
          "La correction repart toute seule ; le point disparaît de la liste quelques instants après.",
        ],
      };
    case "refus_ligne":
      return {
        pourquoi: "Le serveur a refusé cette case précise (le motif est écrit ci-dessus). Les autres cases sont bien parties.",
        etapes: [
          "Regardez la case encadrée en rouge et lisez le motif du refus.",
          "Corrigez-la (ou effacez-la si elle n'a pas lieu d'être).",
          "Elle repart toute seule dès qu'il y a du réseau ; le point disparaît de la liste quand le serveur l'a acceptée.",
          "Si le refus revient toujours, signalez-le au DD avec une capture d'écran.",
        ],
      };
    case "refus_reseau":
      return {
        pourquoi: "Le serveur n'a pas répondu (réseau faible ou coupure). Vos saisies sont en sécurité sur le téléphone.",
        etapes: [
          "Ne retapez rien : tout est gardé sur le téléphone.",
          "Mettez-vous là où le réseau est bon et laissez l'application ouverte une ou deux minutes.",
          "Les saisies partent toutes seules ; le point disparaît de la liste.",
        ],
      };
    case "renvoi_mensuel":
      return {
        pourquoi:
          "Le DD (ou un chef de section) a relu votre rapport et vous le renvoie pour une correction : il est rouvert pour vous. " +
          "Le motif ci-dessus dit ce qu'il faut revoir.",
        etapes: [
          "Lisez bien le motif du renvoi, écrit ci-dessus.",
          "Ouvrez le ou les tableaux concernés dans la liste des 28 tableaux, et corrigez.",
          "Vos corrections partent toutes seules vers le serveur.",
          c.role === "AGENT_SAISIE" ? "Prévenez votre DA : c'est lui qui transmet de nouveau." : `Cliquez ${envoyer(c)} pour transmettre à nouveau.`,
        ],
      };
    case "retard_da":
      return {
        pourquoi:
          "La date limite est passée : le rapport du département ne peut pas être produit tant que le vôtre n'est pas transmis.",
        etapes: [
          "Ouvrez la liste des tableaux et terminez ce qui manque (les pastilles « à corriger » ou « à confirmer » montrent les tableaux à revoir).",
          "Si le mois est verrouillé, cliquez d'abord « Demander au DD un déverrouillage », et attendez sa réponse dans la cloche.",
          `Cliquez ${envoyer(c)} en haut de la liste des tableaux.`,
        ],
      };
    case "validation_chef":
      return {
        pourquoi:
          "Les six arrondissements ont transmis. Le rapport du département attend que chaque chef de section ait contrôlé et validé son domaine.",
        etapes: [
          "Dans le Contrôle sectoriel, choisissez un à un les tableaux de votre section et parcourez les chiffres des six arrondissements.",
          "Un chiffre faux ? Cliquez dessus pour le corriger : le motif est obligatoire, la trace est gardée.",
          "Quand tout est vu, cliquez « Valider ma section pour cette période » (encadré en rouge, en haut à droite).",
        ],
      };
    case "production_dd":
      return {
        pourquoi:
          "La date limite est passée, mais le rapport du département ne peut pas encore être produit : il manque des transmissions ou des validations.",
        etapes: [
          "Dans la Supervision, les lignes encadrées en rouge sont celles qui bloquent.",
          "Arrondissement en retard : relancez le DA. Si le mois est verrouillé, le bouton « Déverrouiller exceptionnellement » apparaît sur sa ligne (colonne « Action ») et lui permet de transmettre ; « Repousser l'échéance (tous les arrondissements) », plus haut, décale la date pour tous.",
          "Section non validée : relancez le chef, ou, dans « Validations du rapport départemental », cliquez « Valider en tant que DD » sous le nom de la section (motif conseillé).",
          "Quand tout est vert, cliquez « Générer le rapport définitif (.docx) ».",
        ],
      };
    case "demande_dd":
      return {
        pourquoi:
          "Un DA a fait une correction après avoir transmis son rapport : elle est bloquée sur son téléphone tant que vous ne lui rouvrez pas le rapport.",
        etapes: [
          "Sur la ligne encadrée en rouge, lisez la demande : le mois et les tableaux concernés.",
          "Cliquez « Renvoyer au DA pour correction ». Le motif est déjà proposé ; complétez-le si besoin.",
          "Cliquez « Renvoyer » : le DA est prévenu, et ses corrections partent toutes seules.",
          "Le DA transmettra de nouveau son rapport ; vous recevrez la notification habituelle.",
        ],
      };
    case "grille_categories":
      return {
        pourquoi:
          "Le TOTAL gris vient de vos rapports mensuels (calculé par le SID). Les catégories que vous saisissez au trimestre (taurillons, génisses…) " +
          "doivent faire, une fois additionnées, ce même total. Sinon, l'un des deux chiffres est faux.",
        etapes: [
          "Sur la ligne encadrée en rouge, additionnez les catégories que vous avez saisies.",
          "Comparez avec la case grise « TOTAL » de la même ligne : c'est le chiffre de vos rapports mensuels.",
          "Si c'est une catégorie qui est fausse : corrigez-la. Le message disparaît dès que la somme tombe juste.",
          "Si c'est le rapport mensuel qui est faux : notez le mois concerné et demandez au DD de vous le renvoyer pour le corriger.",
        ],
      };
    case "grille_lettres":
      return {
        pourquoi: "Cette case attend un nombre, mais elle contient des lettres. Elle ne compte dans aucun total tant qu'elle n'est pas corrigée.",
        etapes: [
          "Cliquez dans la case encadrée en rouge.",
          "Effacez le texte et tapez seulement des chiffres (virgule pour les décimales, pas d'unité : « 12 », pas « 12 têtes »).",
          "Cliquez en dehors de la case : elle s'enregistre et le message disparaît.",
        ],
      };
    case "grille_bac":
      return {
        pourquoi:
          "Le même chiffre est écrit à deux endroits du rapport : dans ce tableau et dans le tableau « Situation des infrastructures » du BAC. " +
          "Les deux ne disent pas la même chose : un seul est juste.",
        etapes: [
          "Lisez le message : il donne les deux chiffres.",
          "Vérifiez sur le terrain (ou avec le chef BAC) lequel est juste.",
          "Corrigez le chiffre faux, dans ce tableau ou demandez au chef BAC de corriger le sien.",
        ],
      };
    case "grille_autre":
      return {
        pourquoi: "Le SID a repéré une incohérence dans ce tableau.",
        etapes: ["Lisez le message ci-dessus.", "Vérifiez la ligne encadrée en rouge et corrigez le chiffre faux."],
      };
    case "analyse":
      return {
        pourquoi:
          "Vous aviez validé le texte écrit sous ce tableau. Depuis, des chiffres du tableau ont changé : le SID a réécrit le texte avec les " +
          "nouveaux chiffres, et vous demande de le relire avant qu'il parte dans le rapport.",
        etapes: [
          "Lisez le nouveau texte dans « Texte qui figurera sous le tableau ».",
          "S'il est juste, cliquez « Valider et passer au suivant ».",
          "S'il faut le changer, cliquez « Corriger le texte », modifiez, puis « Valider et passer au suivant ».",
          "Pour expliquer une hausse ou une baisse, écrivez la cause dans « Explication (facultatif) » avant de valider.",
        ],
      };
    case "file_trimestre":
      return {
        pourquoi:
          "Une modification faite sans réseau a été refusée par le serveur quand elle est partie — souvent parce que le rapport a été transmis ou la section validée entre-temps.",
        etapes: [
          "Lisez le motif du refus, écrit ci-dessus.",
          "Ouvrez l'écran : si la modification est encore permise, refaites-la.",
          "Sinon, demandez au DD de vous renvoyer le rapport trimestriel.",
          "Pour retirer le message : en haut de l'écran, cliquez « … refusée(s) par le serveur — voir », puis « J'ai compris, retirer ».",
        ],
      };
    case "renvoi_trimestre":
      return {
        pourquoi: "Le DD vous renvoie le rapport trimestriel pour une correction : il est rouvert pour vous. Le motif dit quoi revoir.",
        etapes: [
          "Lisez le motif du renvoi, écrit ci-dessus.",
          "Corrigez dans les étapes concernées (tableaux, analyses ou textes).",
          c.role === "AGENT_SAISIE"
            ? "Prévenez votre DA : c'est lui qui transmet de nouveau le rapport."
            : "Ouvrez l'étape « Transmettre mon rapport au DD » (menu Rapport trimestriel) et transmettez à nouveau.",
        ],
      };
  }
}

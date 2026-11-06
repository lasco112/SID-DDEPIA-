/**
 * Les NOUVEAUTÉS de chaque mise à jour (ordre du Délégué, 4 novembre 2026) :
 * à chaque livraison, les utilisateurs concernés voient une fois ce qui change
 * pour eux, avec une vraie capture de l'écran, ce qu'ils font et ce qu'ils
 * obtiennent. Revoir à tout moment : menu → « Nouveautés » (/nouveautes).
 *
 * Une édition par mise à jour, la plus récente EN TÊTE. Les captures sont
 * prises sur la démonstration (public/nouveautes/<édition>/), jamais sur des
 * données réelles. Les libellés cités sont ceux de l'écran, vérifiés.
 */

export type RoleNouveaute = "DD" | "DA" | "AGENT_SAISIE" | "CHEF_BAC" | "CHEF_PSA" | "CHEF_SSV" | "CHEF_SPAIH";

export interface EtapeNouveaute {
  /** /nouveautes/2026-11/xxx.jpg */
  image: string;
  /** Ce que la personne fait. */
  faire: string;
  /** Ce qu'elle obtient. */
  obtenir: string;
}

export interface Nouveaute {
  id: string;
  titre: string;
  /** Les rôles concernés ; vide = tout le monde. */
  roles: RoleNouveaute[];
  /** Réservé à l'administrateur du système. */
  adminSeulement?: boolean;
  etapes: EtapeNouveaute[];
}

export interface Edition {
  /** Identifiant stable : « 2026-11-04 ». */
  id: string;
  titre: string;
  nouveautes: Nouveaute[];
}

const TOUS: RoleNouveaute[] = [];
const ICI = "/nouveautes/2026-11-04";

const CHEFS_ET_DD: RoleNouveaute[] = ["CHEF_BAC", "CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH", "DD"];
const ICI_06 = "/nouveautes/2026-11-06";

export const EDITIONS: Edition[] = [
  {
    id: "2026-11-06",
    titre: "Mise à jour du 6 novembre 2026",
    nouveautes: [
      {
        id: "chef-case-vide",
        titre: "Compléter une donnée oubliée par le DA",
        roles: CHEFS_ET_DD,
        etapes: [
          {
            image: `${ICI_06}/chef-case-vide.jpg`,
            faire: "Rapport mensuel → « Contrôler les chiffres des arrondissements » → un tableau de chiffres de votre section. Une case laissée vide par un DA qui a transmis son mois porte « — + saisir » : touchez-la.",
            obtenir: "Une petite fenêtre s'ouvre sous le tableau. Les DA qui n'ont pas encore transmis gardent la main : leurs cases vides restent « — ».",
          },
          {
            image: `${ICI_06}/chef-case-vide-panneau.jpg`,
            faire: "Inscrivez le chiffre et le motif (d'où il vient), puis « Enregistrer ».",
            obtenir: "Le chiffre entre dans le rapport du mois de l'arrondissement, tracé « case vide → valeur » avec votre motif ; le DA et le DD sont prévenus ; le trimestre le compte de lui-même.",
          },
        ],
      },
      {
        id: "chef-ligne-oubliee",
        titre: "Ajouter une ligne oubliée (une maladie, une vaccination…), sans attendre le trimestre",
        roles: CHEFS_ET_DD,
        etapes: [
          {
            image: `${ICI_06}/chef-ligne-oubliee.jpg`,
            faire: "Dans un tableau en liste de votre section (3.2 vaccinations, 3.1 foyers…) : « + Ajouter une ligne oubliée par le DA », choisissez l'arrondissement, remplissez la ligne et le motif, puis « Ajouter la ligne ».",
            obtenir: "La ligne entre dans le rapport du mois, marquée « ajoutée par le chef » ; le DA est prévenu de ne pas la ressaisir. Plus besoin d'attendre la correction directe du trimestre : il suffit que le DA ait transmis son mois.",
          },
        ],
      },
    ],
  },
  {
    id: "2026-11-04",
    titre: "Mise à jour du 4 novembre 2026",
    nouveautes: [
      {
        id: "czv-village",
        titre: "Chaque établissement rattaché à son CZV et à son village",
        roles: ["DD", "DA", "AGENT_SAISIE"],
        etapes: [
          {
            image: `${ICI}/czv-village-ajout.jpg`,
            faire: "Établissements → « Ajouter un établissement » : choisissez le CZV, puis le village. S'il manque, prenez « Autre village (à préciser) » et écrivez son nom.",
            obtenir: "La localité se remplit seule avec le nom du village. Cela marche aussi sans réseau.",
          },
          {
            image: `${ICI}/czv-village-liste.jpg`,
            faire: "Pour une ferme déjà enregistrée : bouton « Fiche » sur sa ligne, choisissez le CZV et le village, puis « Enregistrer la fiche ». La position GPS se prend au même endroit, facultative.",
            obtenir: "Le CZV s'affiche sous la localité, et dans l'export Excel de la liste des acteurs.",
          },
        ],
      },
      {
        id: "envoi-malgre-mois-precedent",
        titre: "Votre mois part, même si un mois précédent bloque",
        roles: ["DA"],
        etapes: [
          {
            image: `${ICI}/envoi-malgre-mois-precedent.jpg`,
            faire: "Appuyez sur « Envoyer au Délégué Départemental », comme d'habitude.",
            obtenir: "Le rapport du mois passe à « Soumis ». Les corrections d'un mois déjà transmis restent sur votre téléphone : le message et « À corriger » disent de quel mois il s'agit. Pour les faire entrer, demandez au DD de vous renvoyer ce mois.",
          },
        ],
      },
      {
        id: "mot-de-passe-5",
        titre: "Un mot de passe de 5 caractères suffit",
        roles: TOUS,
        etapes: [
          {
            image: `${ICI}/mot-de-passe-5.jpg`,
            faire: "À la première connexion, écran « Complétez votre compte » : choisissez votre mot de passe et tapez-le deux fois.",
            obtenir: "5 caractères au moins suffisent désormais (8 auparavant).",
          },
        ],
      },
      {
        id: "admin-comptes",
        titre: "Les comptes de tous les départements",
        roles: TOUS,
        adminSeulement: true,
        etapes: [
          {
            image: `${ICI}/admin-comptes.jpg`,
            faire: "Administration du système → « Comptes et mots de passe » : choisissez le département, puis « Réinitialiser » ou « Réactiver » sur la ligne du compte.",
            obtenir: "Le compte repart sur le mot de passe provisoire du département (BTOS123…), ou se rouvre avec son mot de passe habituel. Tout est inscrit à votre journal.",
          },
        ],
      },
      {
        id: "admin-intervention",
        titre: "Intervenir à distance dans un département",
        roles: TOUS,
        adminSeulement: true,
        etapes: [
          {
            image: `${ICI}/admin-intervenir.jpg`,
            faire: "Administration du système → « Départements et lancements » → « Intervenir dans ce département ».",
            obtenir: "Son DD est prévenu ; vous avez tous ses écrans : comptes, rapports, mois, trimestre, journal.",
          },
          {
            image: `${ICI}/admin-bandeau.jpg`,
            faire: "Dépannez, puis « Revenir à la Menoua » dans le bandeau orange.",
            obtenir: "Chaque geste est inscrit au journal du département, « par l'administrateur, à distance ». Rien ne passe d'un département à l'autre.",
          },
        ],
      },
    ],
  },
];

/** Les nouveautés d'une édition qui concernent ce compte. */
export function nouveautesPour(edition: Edition, role: string, adminSysteme: boolean): Nouveaute[] {
  return edition.nouveautes.filter((n) => (n.adminSeulement ? adminSysteme : n.roles.length === 0 || (n.roles as string[]).includes(role)));
}

/** Où l'appareil retient la dernière édition vue par ce compte. */
export const cleNouveautesVues = (username: string) => `sid-nouveautes-vues|${username}`;

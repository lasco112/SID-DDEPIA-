/**
 * navItems.ts — le menu de chaque rôle. Source unique du menu latéral
 * (Sidebar.tsx), du fil d'étapes (FilEtapes.tsx), de la page d'accueil, de la
 * recherche rapide (RechercheGlobale.tsx) et du préchargement hors ligne
 * (offlineStore.ts).
 *
 * Rangé PAR RAPPORT, à la demande du Délégué (27 septembre 2026) : ses
 * collègues ne savaient pas où se faisait le rapport mensuel, où se faisait le
 * trimestriel, ni à quoi servait chaque écran du trimestre. Chaque groupe dit
 * quel rapport il prépare ; dans le trimestriel, les écrans sont des ÉTAPES
 * numérotées, dans l'ordre où on les franchit (saisir avant de relire les
 * analyses, relire avant de transmettre), nommées par ce qu'on y FAIT, et
 * chacune a une phrase d'aide qui dit à quoi elle sert.
 *
 * Les adresses ne changent pas : le hors ligne déjà en cache et les habitudes
 * restent valables.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Rang dans les étapes du groupe (1, 2…). Absent : écran d'appoint, hors du fil. */
  etape?: number;
  /** À quoi sert l'étape, en une phrase (page d'accueil). */
  aide?: string;
}

export type CleGroupe = "accueil" | "mensuel" | "trimestriel" | "autres" | "outils" | "administration";

export interface NavGroupe {
  cle: CleGroupe;
  /** Titre du groupe ; absent pour l'accueil. */
  titre?: string;
  items: NavItem[];
}

const ACCUEIL: NavGroupe = { cle: "accueil", items: [{ href: "/dashboard", label: "Accueil" }] };

export const TITRE_MENSUEL = "Rapport mensuel";
export const TITRE_TRIMESTRIEL = "Rapport trimestriel";

/**
 * Les deux étapes qu'on confondait (question du Délégué, 28 septembre 2026).
 * L'ANALYSE : les phrases que le SID écrit sous chaque tableau à partir des
 * chiffres — on les valide. Les TEXTES : les rubriques que seul le terrain
 * connaît — on les rédige. Nommées par les rubriques que le personnel connaît
 * par cœur, pas par une notion abstraite (décision du Délégué : « Rédiger les
 * perspectives », pas « ce que les chiffres ne disent pas »).
 */
const ANALYSE = "Valider l'analyse des chiffres sous chaque tableau";
const REDIGER = "Rédiger les infrastructures, l'encadrement, les échanges, les difficultés et les perspectives";

const AIDE = {
  tableaux: "Les chiffres du trimestre que les rapports mensuels ne donnent pas.",
  analyses: "Sous chaque tableau, quelques phrases écrites par le SID à partir des chiffres : les lire, corriger si besoin, valider.",
  textes: "Section I, chaque filière d'élevage, pêche, santé animale ; les conclusions sont déjà écrites, à relire.",
  verifier: "Produire le document Word de l'arrondissement et le relire.",
  transmettre: "Envoyer le rapport au DD. Il n'est plus modifiable ensuite, sauf renvoi.",
  valider: "Possible une fois les six arrondissements transmis.",
  bac: "Personnel, budget, recettes, infrastructures : ce que seul le BAC connaît.",
  suivre: "Qui a transmis, qui a validé ; prendre le relais au besoin.",
  produire: "Le document Word du département, définitif quand tout est validé.",
};

/** Les écrans des chefs de section pour le mensuel. */
const MENSUEL_CHEF: NavGroupe = {
  cle: "mensuel",
  titre: TITRE_MENSUEL,
  items: [
    { href: "/section/controle", label: "Contrôler les chiffres des arrondissements" },
    { href: "/section/analyse", label: "Rédiger la synthèse de ma section" },
  ],
};

/**
 * Ce que chaque chef rédige : les rubriques de SA partie du rapport
 * (répartition de canevas/sections.ts, chefDeSection).
 */
const REDACTION_CHEF: Record<"CHEF_BAC" | "CHEF_PSA" | "CHEF_SPAIH" | "CHEF_SSV", NavItem> = {
  CHEF_BAC: {
    href: "/trimestre/textes",
    label: "Rédiger le fonctionnement du service, les projets, les difficultés et les perspectives",
    aide: "Section I : personnel, performances, projets (AFOP, ACEFA, PDCVEP…), contraintes ; références.",
  },
  CHEF_PSA: {
    href: "/trimestre/textes",
    label: "Rédiger les infrastructures, l'encadrement et les échanges des filières d'élevage",
    aide: "Deuxième partie, chaque filière : infrastructures, pâturages, animation, produits dérivés, exportations et importations ; conclusions à relire.",
  },
  CHEF_SPAIH: {
    href: "/trimestre/textes",
    label: "Rédiger la pêche et l'aquaculture : infrastructures, encadrement, difficultés",
    aide: "Chapitre III : présentation, infrastructures, encadrement, produits dérivés, difficultés.",
  },
  CHEF_SSV: {
    href: "/trimestre/textes",
    label: "Rédiger la situation sanitaire : influenza aviaire, bilan, cartographie",
    aide: "Chapitre IV : influenza aviaire, bilan sanitaire, cartographie des maladies.",
  },
};

/** Les chefs PSA, SSV, SPAIH : valider les analyses de leur section, rédiger ses rubriques, la valider. */
const trimestrielChef = (chef: "CHEF_PSA" | "CHEF_SPAIH" | "CHEF_SSV"): NavGroupe => ({
  cle: "trimestriel",
  titre: TITRE_TRIMESTRIEL,
  items: [
    { href: "/trimestre/analyses", label: `${ANALYSE} de ma section`, etape: 1, aide: AIDE.analyses },
    { ...REDACTION_CHEF[chef], etape: 2 },
    { href: "/trimestre/circuit", label: "Valider ma section", etape: 3, aide: AIDE.valider },
  ],
});

export const MENU_PAR_ROLE: Record<string, NavGroupe[]> = {
  DA: [
    ACCUEIL,
    {
      cle: "mensuel",
      titre: TITRE_MENSUEL,
      items: [
        { href: "/da/saisie", label: "Remplir et envoyer les tableaux du mois" },
        { href: "/da/assignations", label: "Répartir les tableaux entre mes agents" },
        { href: "/da/supervision-agents", label: "Suivre le travail de mes agents" },
      ],
    },
    {
      cle: "trimestriel",
      titre: TITRE_TRIMESTRIEL,
      items: [
        { href: "/trimestre/saisie", label: "Compléter les tableaux du trimestre", etape: 1, aide: AIDE.tableaux },
        { href: "/trimestre/analyses", label: ANALYSE, etape: 2, aide: AIDE.analyses },
        { href: "/da/trimestre/rubriques", label: REDIGER, etape: 3, aide: AIDE.textes },
        { href: "/da/trimestre", label: "Vérifier et télécharger mon rapport", etape: 4, aide: AIDE.verifier },
        { href: "/trimestre/circuit", label: "Transmettre mon rapport au DD", etape: 5, aide: AIDE.transmettre },
      ],
    },
    {
      cle: "outils",
      titre: "Outils",
      items: [
        { href: "/etablissements", label: "Établissements" },
        { href: "/mon-compte/synchronisation", label: "Synchronisation" },
      ],
    },
  ],
  AGENT_SAISIE: [
    ACCUEIL,
    {
      cle: "mensuel",
      titre: TITRE_MENSUEL,
      items: [{ href: "/da/saisie", label: "Remplir les tableaux du mois" }],
    },
    {
      // L'agent prépare ; c'est son DA qui transmet. Pas de circuit ici.
      cle: "trimestriel",
      titre: TITRE_TRIMESTRIEL,
      items: [
        { href: "/trimestre/saisie", label: "Compléter les tableaux du trimestre", etape: 1, aide: AIDE.tableaux },
        { href: "/trimestre/analyses", label: ANALYSE, etape: 2, aide: AIDE.analyses },
        { href: "/trimestre/textes", label: REDIGER, etape: 3, aide: AIDE.textes },
      ],
    },
    {
      cle: "outils",
      titre: "Outils",
      items: [
        { href: "/etablissements", label: "Établissements" },
        { href: "/mon-compte/synchronisation", label: "Synchronisation" },
      ],
    },
  ],
  DD: [
    ACCUEIL,
    {
      cle: "mensuel",
      titre: TITRE_MENSUEL,
      items: [
        { href: "/dd/supervision", label: "Suivre les arrondissements" },
        { href: "/dd/donnees", label: "Consulter les chiffres par arrondissement" },
        { href: "/dd/periodes", label: "Ouvrir et clôturer les mois" },
      ],
    },
    {
      // Le DD relit et produit ; il n'intervient dans les tableaux qu'au besoin.
      cle: "trimestriel",
      titre: TITRE_TRIMESTRIEL,
      items: [
        // Le DD relit (les chefs valident, les agents rédigent) : « Relire », pas « Valider » ni « Rédiger ».
        { href: "/trimestre/circuit", label: "Suivre l'avancement du trimestre", etape: 1, aide: AIDE.suivre },
        { href: "/trimestre/analyses", label: "Relire l'analyse des chiffres sous chaque tableau", etape: 2, aide: AIDE.analyses },
        {
          href: "/dd/trimestre/rubriques",
          label: "Relire les infrastructures, l'encadrement, les échanges, les difficultés et les perspectives",
          etape: 3,
          aide: AIDE.textes,
        },
        { href: "/dd/trimestre", label: "Produire le rapport du département", etape: 4, aide: AIDE.produire },
        { href: "/trimestre/saisie", label: "Corriger un tableau du trimestre" },
        { href: "/section/bac", label: "Tableaux administratifs du BAC" },
      ],
    },
    {
      cle: "autres",
      titre: "Autres rapports",
      items: [{ href: "/dd/rapports-thematiques", label: "Rapports thématiques" }],
    },
    {
      cle: "administration",
      titre: "Administration",
      items: [
        { href: "/admin/utilisateurs", label: "Comptes utilisateurs" },
        { href: "/etablissements", label: "Établissements" },
        { href: "/dd/referentiels", label: "Propositions de référentiel" },
        { href: "/technique/audit", label: "Journal d'activité" },
        { href: "/technique/aide", label: "Questions des utilisateurs" },
      ],
    },
  ],
  CHEF_BAC: [
    ACCUEIL,
    MENSUEL_CHEF,
    {
      cle: "trimestriel",
      titre: TITRE_TRIMESTRIEL,
      items: [
        { href: "/section/bac", label: "Compléter les tableaux du BAC", etape: 1, aide: AIDE.bac },
        { href: "/trimestre/analyses", label: `${ANALYSE} de ma section`, etape: 2, aide: AIDE.analyses },
        { ...REDACTION_CHEF.CHEF_BAC, etape: 3 },
        { href: "/trimestre/circuit", label: "Valider ma section", etape: 4, aide: AIDE.valider },
      ],
    },
  ],
  CHEF_SSV: [ACCUEIL, MENSUEL_CHEF, trimestrielChef("CHEF_SSV")],
  CHEF_PSA: [ACCUEIL, MENSUEL_CHEF, trimestrielChef("CHEF_PSA")],
  CHEF_SPAIH: [ACCUEIL, MENSUEL_CHEF, trimestrielChef("CHEF_SPAIH")],
  ADMIN_TECH: [
    ACCUEIL,
    {
      cle: "administration",
      titre: "Administration technique",
      items: [
        { href: "/technique", label: "Santé du système" },
        { href: "/technique/sauvegarde", label: "Sauvegarde de la base" },
        { href: "/technique/referentiels", label: "Listes de référence" },
        { href: "/technique/audit", label: "Journal d'audit" },
        { href: "/technique/aide", label: "Questions des utilisateurs" },
      ],
    },
  ],
};

/** Toutes les pages d'un rôle, à plat (recherche rapide, préchargement hors ligne). */
export const NAV_PAR_ROLE: Record<string, NavItem[]> = Object.fromEntries(
  Object.entries(MENU_PAR_ROLE).map(([role, groupes]) => [role, groupes.flatMap((g) => g.items)])
);

/**
 * L'entrée du menu qui correspond à une adresse : la plus précise gagne
 * (« /dd/trimestre/rubriques » n'est pas « /dd/trimestre »).
 */
export function entreeCourante(role: string, pathname: string | null): { groupe: NavGroupe; item: NavItem } | null {
  if (!pathname) return null;
  let meilleur: { groupe: NavGroupe; item: NavItem } | null = null;
  for (const groupe of MENU_PAR_ROLE[role] ?? []) {
    for (const item of groupe.items) {
      const correspond = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
      if (correspond && (!meilleur || item.href.length > meilleur.item.href.length)) meilleur = { groupe, item };
    }
  }
  return meilleur;
}

/** Les étapes numérotées d'un groupe, dans l'ordre. */
export function etapesDu(groupe: NavGroupe): NavItem[] {
  return groupe.items.filter((i) => i.etape != null).sort((a, b) => a.etape! - b.etape!);
}

/** Les étapes du rapport trimestriel pour un rôle (page d'accueil). */
export function etapesTrimestrielles(role: string): NavItem[] {
  const groupe = (MENU_PAR_ROLE[role] ?? []).find((g) => g.cle === "trimestriel");
  return groupe ? etapesDu(groupe) : [];
}

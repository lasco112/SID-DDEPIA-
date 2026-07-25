/**
 * navItems.ts — pages accessibles par rôle. Source unique utilisée par
 * Sidebar.tsx (menu latéral) et RechercheGlobale.tsx (recherche rapide) pour
 * ne jamais désynchroniser les deux.
 */

export interface NavItem {
  href: string;
  label: string;
}

export const NAV_PAR_ROLE: Record<string, NavItem[]> = {
  DA: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/da/saisie", label: "Saisie de données" },
    { href: "/etablissements", label: "Établissements" },
    { href: "/da/supervision-agents", label: "Suivi des agents de saisie" },
    { href: "/da/assignations", label: "Organisation du travail" },
  ],
  AGENT_SAISIE: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/da/saisie", label: "Saisie de données" },
    { href: "/etablissements", label: "Établissements" },
  ],
  DD: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/dd/supervision", label: "Supervision" },
    { href: "/dd/rapports-thematiques", label: "Rapports thématiques" },
    { href: "/admin/utilisateurs", label: "Comptes utilisateurs" },
    { href: "/etablissements", label: "Établissements" },
    { href: "/dd/referentiels", label: "Propositions de référentiel" },
    { href: "/technique/aide", label: "Questions des utilisateurs" },
  ],
  CHEF_BAC: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/section/controle", label: "Vue croisée de contrôle" },
    { href: "/section/analyse", label: "Synthèse d'analyse" },
  ],
  CHEF_SSV: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/section/controle", label: "Vue croisée de contrôle" },
    { href: "/section/analyse", label: "Synthèse d'analyse" },
  ],
  CHEF_PSA: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/section/controle", label: "Vue croisée de contrôle" },
    { href: "/section/analyse", label: "Synthèse d'analyse" },
  ],
  CHEF_SPAIH: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/section/controle", label: "Vue croisée de contrôle" },
    { href: "/section/analyse", label: "Synthèse d'analyse" },
  ],
  ADMIN_TECH: [
    { href: "/dashboard", label: "Tableau de bord" },
    { href: "/technique", label: "Santé du système" },
    { href: "/technique/sauvegarde", label: "Sauvegarde de la base" },
    { href: "/technique/referentiels", label: "Listes de référence" },
    { href: "/technique/audit", label: "Journal d'audit" },
    { href: "/technique/aide", label: "Questions des utilisateurs" },
  ],
};

import AppShell from "@/components/AppShell";
import SaisieTrimestrielleClient from "@/components/SaisieTrimestrielleClient";

/**
 * Saisie trimestrielle (décision D9 du Délégué) : ce que les rapports mensuels
 * ne collectent pas. Le DA et l'agent de saisie remplissent leur
 * arrondissement, le DD le département ; les droits sont vérifiés case par
 * case côté serveur.
 */
export default function SaisieTrimestriellePage() {
  return (
    <AppShell allowedRoles={["DD", "CHEF_BAC", "DA", "AGENT_SAISIE"]}>
      <SaisieTrimestrielleClient />
    </AppShell>
  );
}

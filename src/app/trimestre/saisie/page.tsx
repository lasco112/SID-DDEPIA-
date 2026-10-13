import AppShell from "@/components/AppShell";
import SaisieTrimestrielleClient from "@/components/SaisieTrimestrielleClient";
import { nomDeCompte } from "@/lib/utilisateurCourant";

/**
 * Saisie trimestrielle (décision D9 du Délégué) : ce que les rapports mensuels
 * ne collectent pas. Le DA et l'agent de saisie remplissent leur
 * arrondissement, le DD le département, un chef de section ce qui manque
 * dans les tableaux de sa section ; les droits sont vérifiés case par case
 * côté serveur.
 */
export default async function SaisieTrimestriellePage() {
  const username = await nomDeCompte();
  return (
    <AppShell allowedRoles={["DD", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV", "DA", "AGENT_SAISIE"]}>
      <SaisieTrimestrielleClient username={username} />
    </AppShell>
  );
}

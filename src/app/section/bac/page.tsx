import AppShell from "@/components/AppShell";
import SectionBacClient from "@/components/SectionBacClient";

/**
 * Les treize tableaux du Bureau des Affaires Communes — personnel,
 * infrastructures, matériel, équipements, budget, recettes.
 *
 * Ils ne sont collectés nulle part ailleurs : sans cet écran, ils sortaient
 * vides du rapport trimestriel. Le DD y a accès aussi, pour relire et compléter.
 */
export default function SectionBacPage() {
  return (
    <AppShell allowedRoles={["CHEF_BAC", "DD"]}>
      <SectionBacClient />
    </AppShell>
  );
}

import AppShell from "@/components/AppShell";
import CircuitTrimestreClient from "@/components/CircuitTrimestreClient";

/**
 * Le circuit de validation du rapport trimestriel (décision du Délégué, 24
 * septembre 2026) : agent → DA → chef de section → DD. Chacun y voit l'état du
 * trimestre et y franchit SON étape.
 */
export default function CircuitTrimestrePage() {
  return (
    <AppShell allowedRoles={["AGENT_SAISIE", "DA", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV", "DD"]}>
      <CircuitTrimestreClient />
    </AppShell>
  );
}

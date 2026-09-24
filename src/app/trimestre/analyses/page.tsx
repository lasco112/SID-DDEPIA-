import AppShell from "@/components/AppShell";
import AnalysesTrimestreClient from "@/components/AnalysesTrimestreClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Relecture des analyses du rapport trimestriel (décision du Délégué, 24
 * septembre 2026). Le SID calcule le texte ; l'agent de saisie le valide pour
 * son arrondissement, le chef de section pour son domaine ; le DA et le DD
 * relisent et ne corrigent que s'ils le jugent utile.
 */
const PRESENTATION: Record<string, string> = {
  AGENT_SAISIE:
    "Le SID écrit l’analyse de chaque tableau à partir de vos chiffres. Relisez-la, ajoutez une explication si vous en avez une, et validez.",
  DA: "Vos agents de saisie valident les analyses de votre rapport. Relisez l’ensemble, et corrigez ce que vous jugez utile.",
  DD: "Les chefs de section valident les analyses de leur domaine. Vous relisez ; vous ne corrigez que si vous le souhaitez.",
};
const PRESENTATION_CHEF =
  "Le SID écrit l’analyse de chaque tableau de votre domaine à partir des chiffres du département. Relisez-la, ajoutez une explication si vous en avez une, et validez.";

export default async function AnalysesPage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  return (
    <AppShell allowedRoles={["DD", "DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"]}>
      <AnalysesTrimestreClient presentation={PRESENTATION[role] ?? PRESENTATION_CHEF} />
    </AppShell>
  );
}

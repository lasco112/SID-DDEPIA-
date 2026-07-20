import AppShell from "@/components/AppShell";
import SectionControleClient from "@/components/SectionControleClient";

export default function SectionControlePage() {
  return (
    <AppShell allowedRoles={["CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"]}>
      <SectionControleClient />
    </AppShell>
  );
}

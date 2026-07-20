import AppShell from "@/components/AppShell";
import SectionAnalyseClient from "@/components/SectionAnalyseClient";

export default function SectionAnalysePage() {
  return (
    <AppShell allowedRoles={["CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"]}>
      <SectionAnalyseClient />
    </AppShell>
  );
}

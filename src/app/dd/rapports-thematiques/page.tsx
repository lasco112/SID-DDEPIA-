import AppShell from "@/components/AppShell";
import RapportThematiqueClient from "@/components/RapportThematiqueClient";

export default function RapportsThematiquesPage() {
  return (
    <AppShell allowedRoles={["DD"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Rapports thématiques</h1>
        <p className="mt-1 text-gray-600">
          Extrayez les données selon vos propres critères (espèce, domaine, arrondissement, période) — en plus du rapport
          mensuel officiel, dont la génération reste inchangée sur la page Supervision.
        </p>
        <div className="mt-6">
          <RapportThematiqueClient />
        </div>
      </div>
    </AppShell>
  );
}

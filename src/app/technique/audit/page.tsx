import AppShell from "@/components/AppShell";
import TechniqueAuditClient from "@/components/TechniqueAuditClient";

export default function TechniqueAuditPage() {
  return (
    <AppShell allowedRoles={["ADMIN_TECH"]}>
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold text-primary-dark">Journal d'audit</h1>
        <p className="mt-1 text-gray-600">Historique en lecture seule des actions effectuées dans l'application.</p>
        <div className="mt-6">
          <TechniqueAuditClient />
        </div>
      </div>
    </AppShell>
  );
}

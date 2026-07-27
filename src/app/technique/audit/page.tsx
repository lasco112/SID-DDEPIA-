import AppShell from "@/components/AppShell";
import TechniqueAuditClient from "@/components/TechniqueAuditClient";

export default function TechniqueAuditPage() {
  return (
    <AppShell allowedRoles={["ADMIN_TECH", "DD"]}>
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold text-primary-dark">Journal d'activité</h1>
        <p className="mt-1 text-gray-600">
          Historique en lecture seule de ce qui se passe dans l'application : connexions, saisies, soumissions,
          validations, corrections, suppressions et exports — avec leur auteur et leur date.
        </p>
        <div className="mt-6">
          <TechniqueAuditClient />
        </div>
      </div>
    </AppShell>
  );
}

import AppShell from "@/components/AppShell";
import DemonstrationClient from "@/components/admin-systeme/DemonstrationClient";

/** La démonstration, pour former les départements — réservé à l'administrateur du système. */
export default function DemonstrationAdminPage() {
  return (
    <AppShell allowedRoles={["DD"]} exigeAdminSysteme>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Démonstration</h1>
        <p className="mt-1 text-gray-600">
          Un département fictif (la Menoua de démonstration), séparé de la production : six mois clos et complets d&apos;avril à
          septembre 2026, et octobre en cours avec un arrondissement dans chaque situation. Remettez-la à zéro avant chaque
          séance de formation.
        </p>
        <div className="mt-6">
          <DemonstrationClient />
        </div>
      </div>
    </AppShell>
  );
}

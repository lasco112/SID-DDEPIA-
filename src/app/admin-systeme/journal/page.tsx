import AppShell from "@/components/AppShell";
import JournalClient from "@/components/admin-systeme/JournalClient";

/** Journal de l'administration du système — réservé à son administrateur. */
export default function JournalAdministrationPage() {
  return (
    <AppShell allowedRoles={["DD"]} exigeAdminSysteme>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-primary-dark">Journal de l&apos;administration</h1>
        <p className="mt-1 text-gray-600">
          Départements lancés ou éteints, fiches d&apos;identifiants, purges, nouvelles espèces : les 200 dernières actions.
        </p>
        <div className="mt-6">
          <JournalClient />
        </div>
      </div>
    </AppShell>
  );
}

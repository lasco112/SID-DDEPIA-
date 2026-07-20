import AppShell from "@/components/AppShell";
import TechniqueSanteClient from "@/components/TechniqueSanteClient";

export default function TechniquePage() {
  return (
    <AppShell allowedRoles={["ADMIN_TECH"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Maintenance technique</h1>
        <p className="mt-1 text-gray-600">État du système. Aucune donnée métier (chiffres du terrain) n'est affichée ici.</p>
        <div className="mt-6">
          <TechniqueSanteClient />
        </div>
      </div>
    </AppShell>
  );
}

import AppShell from "@/components/AppShell";
import TechniqueSauvegardeClient from "@/components/TechniqueSauvegardeClient";

export default function TechniqueSauvegardePage() {
  return (
    <AppShell allowedRoles={["ADMIN_TECH"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Sauvegarde de la base de données</h1>
        <p className="mt-1 text-gray-600">Copie complète de la base (pg_dump), à conserver hors du serveur principal.</p>
        <div className="mt-6">
          <TechniqueSauvegardeClient />
        </div>
      </div>
    </AppShell>
  );
}

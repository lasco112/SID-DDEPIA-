import AppShell from "@/components/AppShell";
import TechniqueReferentielsClient from "@/components/TechniqueReferentielsClient";

export default function TechniqueReferentielsPage() {
  return (
    <AppShell allowedRoles={["ADMIN_TECH"]}>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-primary-dark">Listes de référence</h1>
        <p className="mt-1 text-gray-600">
          Maladies, vaccins, espèces, actes vétérinaires, motifs de saisie, unités, types d'établissement — ces listes alimentent les menus déroulants
          de saisie. Jamais de suppression définitive : un item obsolète est désactivé.
        </p>
        <div className="mt-6">
          <TechniqueReferentielsClient />
        </div>
      </div>
    </AppShell>
  );
}

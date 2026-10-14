import AppShell from "@/components/AppShell";
import ReferentielsEnAttenteClient from "@/components/ReferentielsEnAttenteClient";

/**
 * Nouvelles espèces : valider ajoute des COLONNES aux tableaux de saisie et au
 * rapport de TOUS les départements. Réservé à l'administrateur du système
 * (décision du Délégué, 14 octobre 2026 : « je suis le seul à ajouter de
 * nouvelles colonnes »).
 */
export default function EspecesPage() {
  return (
    <AppShell allowedRoles={["DD"]} exigeAdminSysteme>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Nouvelles espèces (nouvelles colonnes)</h1>
        <p className="mt-1 text-gray-600">
          L&apos;administrateur technique peut proposer une nouvelle espèce, volaille ou espèce halieutique. Rien ne change dans
          les tableaux de saisie ni dans les rapports tant que vous n&apos;avez pas validé. Une fois validée, la nouvelle colonne
          apparaît dans <strong>tous les départements</strong>.
        </p>
        <div className="mt-6">
          <ReferentielsEnAttenteClient />
        </div>
      </div>
    </AppShell>
  );
}

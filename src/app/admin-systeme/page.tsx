import AppShell from "@/components/AppShell";
import DepartementsClient from "@/components/admin-systeme/DepartementsClient";

/**
 * Administration du système — départements et lancements. Réservé au compte
 * qui porte la marque d'administrateur (décisions du Délégué, 14 octobre 2026).
 */
export default function AdministrationSystemePage() {
  return (
    <AppShell allowedRoles={["DD"]} exigeAdminSysteme>
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold text-primary-dark">Départements et lancements</h1>
        <p className="mt-1 max-w-3xl text-gray-600">
          Les départements de l&apos;Ouest dans le SID EPIA-O. Un département préparé reste éteint : ses comptes ne peuvent pas
          se connecter. Le jour du lancement, imprimez ses fiches d&apos;identifiants, remettez-les en main propre, puis lancez le
          département.
        </p>
        <ol className="mt-3 max-w-3xl list-decimal space-y-1 pl-5 text-[13.5px] text-ink-muted">
          <li>Vérifier que le département est « Prêt » : arrondissements, compte du DD, modèles Word.</li>
          <li>Imprimer les fiches d&apos;identifiants (un nouveau mot de passe provisoire pour chaque compte jamais connecté).</li>
          <li>Lancer le département : ses comptes peuvent se connecter.</li>
          <li>Son DD crée ensuite lui-même ses agents de saisie et ses chefs de section (Administration → Comptes utilisateurs).</li>
        </ol>
        <div className="mt-6">
          <DepartementsClient />
        </div>
      </div>
    </AppShell>
  );
}

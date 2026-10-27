import AppShell from "@/components/AppShell";
import ComptesSystemeClient from "@/components/admin-systeme/ComptesSystemeClient";

/**
 * Administration du système — les comptes de tous les départements et leurs
 * mots de passe (demande du Délégué, 27 octobre 2026).
 */
export default function ComptesSystemePage() {
  return (
    <AppShell allowedRoles={["DD"]} exigeAdminSysteme>
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold text-primary-dark">Comptes et mots de passe</h1>
        <p className="mt-1 max-w-3xl text-gray-600">
          Les comptes de chaque département. « Réinitialiser » remet le mot de passe provisoire du département (BTOS123 pour les
          Bamboutos, password123 pour la Menoua) ; la personne le remplace à sa prochaine connexion. Cela vaut aussi pour un compte
          déjà utilisé : c&apos;est le remède au mot de passe oublié.
        </p>
        <div className="mt-6">
          <ComptesSystemeClient />
        </div>
      </div>
    </AppShell>
  );
}

import AppShell from "@/components/AppShell";
import DonneesEssaiClient from "@/components/admin-systeme/DonneesEssaiClient";

/** Purger des données d'essai — réservé à l'administrateur du système. */
export default function DonneesEssaiPage() {
  return (
    <AppShell allowedRoles={["DD"]} exigeAdminSysteme>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Purger des données d&apos;essai</h1>
        <p className="mt-1 text-gray-600">
          Avant le lancement d&apos;un département, effacez ce qui a été saisi pour essayer. L&apos;opération ne vise qu&apos;un
          département à la fois, et ne peut pas être annulée.
        </p>
        <div className="mt-6">
          <DonneesEssaiClient />
        </div>
      </div>
    </AppShell>
  );
}

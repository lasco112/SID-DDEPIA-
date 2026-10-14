import AppShell from "@/components/AppShell";
import TextesDepartementClient from "@/components/TextesDepartementClient";

/** Les textes permanents de n'importe quel département — réservé à l'administrateur du système. */
export default function TextesDepartementsAdminPage() {
  return (
    <AppShell allowedRoles={["DD"]} exigeAdminSysteme>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Textes permanents des départements</h1>
        <p className="mt-1 text-gray-600">
          Rédigez pour un département ses textes permanents — ou ceux de ses arrondissements — comme le ferait son DD. Ils sont
          repris dans chacun de ses rapports trimestriels.
        </p>
        <div className="mt-6">
          <TextesDepartementClient administration />
        </div>
      </div>
    </AppShell>
  );
}

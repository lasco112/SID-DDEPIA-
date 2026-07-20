import AppShell from "@/components/AppShell";
import ReferentielsEnAttenteClient from "@/components/ReferentielsEnAttenteClient";

export default function DDReferentielsPage() {
  return (
    <AppShell allowedRoles={["DD"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Propositions de référentiel</h1>
        <p className="mt-1 text-gray-600">
          L'administrateur technique peut proposer une nouvelle espèce, volaille ou espèce halieutique. Rien ne change dans les
          tableaux de saisie ni dans le rapport tant que vous n'avez pas validé.
        </p>
        <div className="mt-6">
          <ReferentielsEnAttenteClient />
        </div>
      </div>
    </AppShell>
  );
}

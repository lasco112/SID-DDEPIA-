import AppShell from "@/components/AppShell";
import TrimestreClient from "@/components/TrimestreClient";

export default function RapportTrimestrielPage() {
  return (
    <AppShell allowedRoles={["DD"]}>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-primary-dark">Rapport trimestriel</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Consolidation des mois validés selon la règle propre à chaque indicateur : les flux s&apos;additionnent,
          les stocks prennent leur dernière valeur, les prix sont pondérés par les quantités vendues.
        </p>
        <div className="mt-6">
          <TrimestreClient />
        </div>
      </div>
    </AppShell>
  );
}

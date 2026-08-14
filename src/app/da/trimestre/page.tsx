import AppShell from "@/components/AppShell";
import TrimestreArrondissementClient from "@/components/TrimestreArrondissementClient";

export default function RapportTrimestrielArrondissementPage() {
  return (
    <AppShell allowedRoles={["DA"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Mon rapport trimestriel</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Le canevas officiel, ramené à votre arrondissement. Les chiffres viennent de vos trois saisies
          mensuelles, consolidées selon la règle propre à chaque indicateur : les flux s&apos;additionnent, les
          stocks prennent leur dernière valeur, les prix sont pondérés par les quantités vendues.
        </p>
        <div className="mt-6">
          <TrimestreArrondissementClient />
        </div>
      </div>
    </AppShell>
  );
}

import AppShell from "@/components/AppShell";
import RubriquesTrimestreClient from "@/components/RubriquesTrimestreClient";
import { trimestreEchu } from "@/lib/trimestreEchu";

export default function RubriquesDDPage() {
  const { annee, trimestre } = trimestreEchu();
  return (
    <AppShell allowedRoles={["DD"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Textes du rapport trimestriel</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Les zones d&apos;analyse du canevas. Ce que vous écrivez ici est repris tel quel dans le document
          produit — vous n&apos;avez plus à le retaper dans Word après téléchargement.
        </p>
        <div className="mt-6">
          <RubriquesTrimestreClient annee={annee} trimestre={trimestre} />
        </div>
      </div>
    </AppShell>
  );
}

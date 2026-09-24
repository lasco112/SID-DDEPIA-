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
          Les chefs de section rédigent les zones de texte de leur domaine. Vous les relisez, et ne corrigez
          que si vous le souhaitez : ce qui est écrit ici est repris tel quel dans le document ; une zone vide
          y est marquée « Néant ».
        </p>
        <div className="mt-6">
          <RubriquesTrimestreClient annee={annee} trimestre={trimestre} />
        </div>
      </div>
    </AppShell>
  );
}

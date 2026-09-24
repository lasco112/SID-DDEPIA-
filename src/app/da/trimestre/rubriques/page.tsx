import AppShell from "@/components/AppShell";
import RubriquesTrimestreClient from "@/components/RubriquesTrimestreClient";
import { trimestreARapporter } from "@/lib/trimestreEchu";

export default function RubriquesDAPage() {
  const { annee, trimestre } = trimestreARapporter();
  return (
    <AppShell allowedRoles={["DA"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Textes de mon rapport trimestriel</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Vos agents de saisie rédigent les zones de texte de votre rapport. Relisez-les, et corrigez ce que
          vous jugez utile : ce qui est écrit ici est repris tel quel dans le document ; une zone vide y est
          marquée « Néant ».
        </p>
        <div className="mt-6">
          <RubriquesTrimestreClient annee={annee} trimestre={trimestre} />
        </div>
      </div>
    </AppShell>
  );
}

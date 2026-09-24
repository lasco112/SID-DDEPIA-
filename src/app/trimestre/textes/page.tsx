import AppShell from "@/components/AppShell";
import RubriquesTrimestreClient from "@/components/RubriquesTrimestreClient";
import { nomDeCompte } from "@/lib/utilisateurCourant";
import { trimestreARapporter } from "@/lib/trimestreEchu";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Rédaction des zones de texte du rapport trimestriel (décision du Délégué,
 * 24 septembre 2026) : l'agent de saisie rédige celles de son arrondissement,
 * chaque chef de section celles de son domaine au département. Le DA et le DD
 * relisent, depuis leurs propres écrans.
 */
export default async function TextesTrimestrePage() {
  const { annee, trimestre } = trimestreARapporter();
  const username = await nomDeCompte();
  const session = await getServerSession(authOptions);
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const presentation =
    role === "AGENT_SAISIE"
      ? "Les zones de texte du rapport de votre arrondissement. Votre DA les relira. Ce que vous écrivez ici est repris tel quel dans le document ; une zone laissée vide y sera marquée « Néant »."
      : "Les zones de texte du rapport départemental qui relèvent de votre section. Le Délégué départemental les relira. Ce que vous écrivez ici est repris tel quel dans le document ; une zone laissée vide y sera marquée « Néant ».";
  return (
    <AppShell allowedRoles={["AGENT_SAISIE", "DA", "DD", "CHEF_BAC", "CHEF_PSA", "CHEF_SPAIH", "CHEF_SSV"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Textes du rapport trimestriel</h1>
        <p className="mt-1 text-sm text-ink-muted">{presentation}</p>
        <div className="mt-6">
          <RubriquesTrimestreClient annee={annee} trimestre={trimestre} username={username} />
        </div>
      </div>
    </AppShell>
  );
}

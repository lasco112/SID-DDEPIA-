import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import AssignationsClient from "@/components/AssignationsClient";

export default async function AssignationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  const role = (session.user as any).role as string;
  if (role !== "DA") redirect("/dashboard");

  return (
    <AppShell allowedRoles={["DA"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Organisation du travail des agents</h1>
        <p className="mt-1 text-gray-600">
          Attribuez chaque tableau à un agent de saisie précis, pour organiser le travail de l'équipe ce mois-ci. Ceci
          reste indicatif : n'importe quel agent de votre arrondissement peut toujours remplir n'importe quel tableau
          si besoin (personne n'est bloqué). Vous pouvez réattribuer à tout moment sans perdre aucune donnée déjà
          saisie.
        </p>
        <div className="mt-6">
          <AssignationsClient />
        </div>
      </div>
    </AppShell>
  );
}

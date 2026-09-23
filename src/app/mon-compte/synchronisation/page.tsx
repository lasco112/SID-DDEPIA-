import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import SynchronisationClient from "@/components/SynchronisationClient";

export default async function SynchronisationPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  const username = (session.user as any).username as string;
  // Même règle que les écrans de saisie : l'agent envoie à son DA, le DA au DD.
  const role = (session.user as any).role as string;
  const destinataire =
    role === "AGENT_SAISIE" ? "Délégué d'Arrondissement" : role === "DA" ? "Délégué Départemental" : null;

  return (
    <AppShell>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-primary-dark">Synchronisation</h1>
        <p className="mt-1 text-gray-600">
          État de l'envoi de votre travail vers le serveur. Vos saisies sont d'abord enregistrées sur cet appareil :
          rien n'est perdu si le réseau manque.
        </p>
        <div className="mt-6">
          <SynchronisationClient username={username} destinataire={destinataire} />
        </div>
      </div>
    </AppShell>
  );
}

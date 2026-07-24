import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import SupervisionAgentsClient from "@/components/SupervisionAgentsClient";

export default async function SupervisionAgentsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  const role = (session.user as any).role as string;
  if (role !== "DA") redirect("/dashboard");

  return (
    <AppShell allowedRoles={["DA"]}>
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold text-primary-dark">Suivi des agents de saisie</h1>
        <p className="mt-1 text-gray-600">
          Les agents de saisie de votre arrondissement et les données qu'ils ont personnellement saisies ce mois-ci.
        </p>
        <div className="mt-6">
          <SupervisionAgentsClient />
        </div>
      </div>
    </AppShell>
  );
}

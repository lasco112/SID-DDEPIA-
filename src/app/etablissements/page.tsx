import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import AppShell from "@/components/AppShell";
import EtablissementsClient from "@/components/EtablissementsClient";

export default async function EtablissementsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  const role = (session.user as any).role as string;
  if (role !== "DA" && role !== "DD") redirect("/dashboard");

  const arrondissements = await db.arrondissement.findMany({ orderBy: { ordre: "asc" } });
  const ownArrondissementId = (session.user as any).arrondissementId as string | null;

  return (
    <AppShell allowedRoles={["DA", "DD"]}>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-primary-dark">Registre des établissements</h1>
        <p className="mt-1 text-gray-600">
          Couvoirs, fermes de ponte, fermes de poulets de chair et provenderies utilisés dans les tableaux 1.3, 1.4, 1.5 et 2.3.
          Ajoutez un nouvel établissement ou corrigez un nom déjà existant — rien n'est jamais supprimé, un établissement fermé peut être désactivé.
        </p>
        <div className="mt-6">
          <EtablissementsClient role={role as "DA" | "DD"} arrondissements={arrondissements} ownArrondissementId={ownArrondissementId} />
        </div>
      </div>
    </AppShell>
  );
}

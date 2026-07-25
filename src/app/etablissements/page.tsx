import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import AppShell from "@/components/AppShell";
import EtablissementsClient from "@/components/EtablissementsClient";
import SupprimerEtablissementsDemoButton from "@/components/SupprimerEtablissementsDemoButton";

export default async function EtablissementsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  const role = (session.user as any).role as string;
  if (role !== "DA" && role !== "DD" && role !== "AGENT_SAISIE") redirect("/dashboard");

  const arrondissements = await db.arrondissement.findMany({ orderBy: { ordre: "asc" } });
  const ownArrondissementId = (session.user as any).arrondissementId as string | null;

  return (
    <AppShell allowedRoles={["DA", "DD", "AGENT_SAISIE"]}>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-primary-dark">Registre des établissements</h1>
        <p className="mt-1 text-gray-600">
          Couvoirs, fermes de ponte, fermes de poulets de chair et provenderies utilisés dans les tableaux 1.3, 1.4, 1.5 et 2.3.
          Ajoutez un nouvel établissement ou corrigez un nom déjà existant — un établissement fermé peut être désactivé sans perdre son historique.
          {role === "DD"
            ? " La suppression définitive emporte aussi les saisies rattachées."
            : " Vous pouvez supprimer définitivement un établissement de votre arrondissement — la suppression emporte aussi ses saisies rattachées."}
        </p>
        <div className="mt-6">
          <EtablissementsClient
            role={role as "DA" | "DD" | "AGENT_SAISIE"}
            arrondissements={arrondissements}
            ownArrondissementId={ownArrondissementId}
          />
        </div>
        {role === "DD" && <SupprimerEtablissementsDemoButton />}
      </div>
    </AppShell>
  );
}

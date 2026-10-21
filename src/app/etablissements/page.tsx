import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { contexteSession } from "@/lib/permissions";
import AppShell from "@/components/AppShell";
import EtablissementsClient from "@/components/EtablissementsClient";
import { identiteDepartement } from "@/lib/departement";

export default async function EtablissementsPage() {
  const session = await getServerSession(authOptions);
  const user = await contexteSession(session);
  if (!user) redirect("/");
  const role = user.role as string;
  if (role !== "DA" && role !== "DD" && role !== "AGENT_SAISIE") redirect("/dashboard");

  // `user.db` plutôt que le client global : la liste des arrondissements est
  // celle du département de la session, pas celle de tout le pays.
  const arrondissements = await user.db.arrondissement.findMany({ orderBy: { ordre: "asc" } });
  const ownArrondissementId = user.arrondissementId;
  // Le calendrier traditionnel des jours de marché dépend du département.
  const identite = await identiteDepartement(user.db);

  return (
    <AppShell allowedRoles={["DA", "DD", "AGENT_SAISIE"]}>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-primary-dark">Registre des établissements</h1>
        <p className="mt-1 text-gray-600">
          Tous les acteurs de l'élevage : couvoirs, fermes de ponte, fermes de poulets de chair et provenderies (utilisés dans les tableaux 1.3, 1.4, 1.5 et 2.3), marchés, abattoirs, aires d'abattage, étangs piscicoles et cliniques vétérinaires privées — avec leurs coordonnées GPS et, pour un marché, les espèces vendues, les jours et les équipements.
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
            codeDepartement={identite.code}
            nomDepartement={identite.nom}
          />
        </div>
        {/* Retirer d'un coup les établissements de démonstration : rangé dans
            l'administration du système, avec la purge des données d'essai. */}
      </div>
    </AppShell>
  );
}

/**
 * Les collectes ponctuelles — l'écran du DD (21 octobre 2026) : lancer une
 * collecte prioritaire, la suivre arrondissement par arrondissement, relancer,
 * clôturer, exporter.
 */
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { contexteSession } from "@/lib/permissions";
import AppShell from "@/components/AppShell";
import CollectesClient from "@/components/CollectesClient";
import { dateAuCameroun } from "@/lib/marches";

export default async function CollectesPage() {
  const session = await getServerSession(authOptions);
  const user = await contexteSession(session);
  if (!user) redirect("/");
  if (user.role !== "DD") redirect("/dashboard");
  const arrondissements = await user.db.arrondissement.findMany({ orderBy: { ordre: "asc" }, select: { id: true, nom: true } });
  const aujourdhui = dateAuCameroun();
  const demain = new Date(Date.parse(`${aujourdhui}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

  return (
    <AppShell allowedRoles={["DD"]}>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-primary-dark">Collectes ponctuelles</h1>
        <p className="mt-1 text-gray-600">
          Lancez une petite collecte comme activité prioritaire — le recensement des marchés, par exemple. Ceux qui collectent la voient en tête de leur
          accueil, reçoivent une notification au lancement puis un rappel chaque matin. Vous suivez ici ce qui arrive, arrondissement par arrondissement.
          Les fiches vont au registre des établissements ; rien ne s&apos;ajoute aux rapports mensuel et trimestriel.
        </p>
        <div className="mt-6">
          <CollectesClient arrondissements={arrondissements} aujourdhui={aujourdhui} demain={demain} />
        </div>
      </div>
    </AppShell>
  );
}

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import AppShellClient from "@/components/AppShellClient";
import { resoudrePeriode, listerPeriodes } from "@/server/periodes/courante";

const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/**
 * AppShell — ossature commune à toutes les pages authentifiées : bandeau
 * supérieur (identité, indicateur en ligne/hors ligne, rôle, déconnexion) +
 * navigation latérale par rôle (charte graphique SID DDEPIA-Menoua).
 */
export default async function AppShell({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  if ((session.user as any).mustChangePassword) redirect("/mon-compte/premiere-connexion");
  const role = (session.user as any).role as string;
  const username = (session.user as any).username as string;
  if (allowedRoles && !allowedRoles.includes(role)) redirect("/dashboard");

  // Période de TRAVAIL (celle choisie par l'utilisateur), et non plus « la plus
  // récente » : c'est elle qui pilote ce que chaque page affiche et enregistre.
  const [periode, periodes] = await Promise.all([resoudrePeriode(db), listerPeriodes(db)]);
  const periodeLabel = periode ? `${MOIS_FR[(periode.mois ?? 1) - 1]} ${periode.annee}` : undefined;

  return (
    <AppShellClient
      role={role}
      username={username}
      periodeLabel={periodeLabel}
      periodes={periodes.map((p) => ({
        id: p.id,
        libelle: `${MOIS_FR[(p.mois ?? 1) - 1]} ${p.annee}`,
        cloturee: p.statut === "ARCHIVEE",
      }))}
      couranteId={periode?.id ?? null}
    >
      {children}
    </AppShellClient>
  );
}

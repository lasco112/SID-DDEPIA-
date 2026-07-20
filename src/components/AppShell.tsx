import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import AppShellClient from "@/components/AppShellClient";

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

  const periode = await db.periodeReporting.findFirst({
    where: { type: "MENSUEL" },
    orderBy: [{ annee: "desc" }, { mois: "desc" }],
  });
  const periodeLabel = periode ? `${MOIS_FR[(periode.mois ?? 1) - 1]} ${periode.annee}` : undefined;

  return (
    <AppShellClient role={role} username={username} periodeLabel={periodeLabel}>
      {children}
    </AppShellClient>
  );
}

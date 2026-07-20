import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import OnlineIndicator from "@/components/OnlineIndicator";

const LIBELLES_ROLE: Record<string, string> = {
  DD: "Délégué Départemental",
  DA: "Délégué d'Arrondissement",
  AGENT_SAISIE: "Agent de saisie",
  CHEF_BAC: "Chef de section — BAC",
  CHEF_SSV: "Chef de section — SSV",
  CHEF_PSA: "Chef de section — PSA",
  CHEF_SPAIH: "Chef de section — SPAIH",
  ADMIN_TECH: "Administrateur technique",
};

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
    <div className="flex min-h-screen flex-col">
      <header className="flex h-[58px] shrink-0 items-center gap-4 bg-primary px-[18px] text-white shadow-[0_1px_0_rgba(0,0,0,.12)]">
        <div className="flex items-center gap-[11px]">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[7px] bg-white/15 text-[10px] font-bold tracking-wide">
            DD
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold">SID DDEPIA-Menoua</div>
            <div className="text-[11px] text-white/70">Délégation Départementale · Menoua</div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <OnlineIndicator />
          <div className="text-right leading-tight">
            <div className="text-[13.5px] font-semibold">{username}</div>
            <div className="text-[11.5px] text-white/75">{LIBELLES_ROLE[role] ?? role}</div>
          </div>
          <a
            href="/api/auth/signout"
            className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-[13px] font-semibold text-white hover:bg-white/20"
          >
            Déconnexion
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar role={role} periodeLabel={periodeLabel} />
        <main className="sid-scroll flex-1 min-w-0 overflow-auto bg-appbg p-6 md:p-[26px_30px]">{children}</main>
      </div>
    </div>
  );
}

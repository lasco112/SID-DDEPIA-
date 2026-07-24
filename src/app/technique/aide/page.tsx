import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import AideInboxClient from "@/components/AideInboxClient";

export default async function AideInboxPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");
  const role = (session.user as any).role as string;
  if (role !== "DD" && role !== "ADMIN_TECH") redirect("/dashboard");

  return (
    <AppShell allowedRoles={["DD", "ADMIN_TECH"]}>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-primary-dark">Questions des utilisateurs</h1>
        <p className="mt-1 text-gray-600">
          Questions posées depuis le bouton « Aide », avec la page et le tableau exact où la personne se trouvait.
        </p>
        <div className="mt-6">
          <AideInboxClient />
        </div>
      </div>
    </AppShell>
  );
}

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import SecuriteAppareilClient from "@/components/SecuriteAppareilClient";

export default async function SecuriteAppareilPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/");

  return (
    <AppShell>
      <div className="max-w-md">
        <h1 className="text-xl font-bold text-primary-dark">Sécurité de l'appareil</h1>
        <p className="mt-1 text-sm text-gray-600">
          Un code PIN local protège l'accès à l'application sur cet appareil si vous le partagez avec d'autres
          personnes. Il ne remplace pas votre mot de passe et reste uniquement sur cet appareil.
        </p>
        <div className="mt-6">
          <SecuriteAppareilClient />
        </div>
      </div>
    </AppShell>
  );
}

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import SaisieTemplateClient from "@/components/SaisieTemplateClient";

export default async function SaisieTemplatePage({ params }: { params: { templateCode: string } }) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  if (!session || (role !== "DA" && role !== "AGENT_SAISIE")) redirect("/");
  const username = (session.user as any).username as string;
  const destinataire = role === "AGENT_SAISIE" ? "Délégué d'Arrondissement" : "Délégué Départemental";

  return (
    <AppShell allowedRoles={["DA", "AGENT_SAISIE"]}>
      <SaisieTemplateClient templateCode={params.templateCode} username={username} destinataire={destinataire} />
    </AppShell>
  );
}

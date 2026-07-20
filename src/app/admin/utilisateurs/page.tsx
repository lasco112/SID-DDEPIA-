import AppShell from "@/components/AppShell";
import AdminUtilisateursClient from "@/components/AdminUtilisateursClient";

export default function AdminUtilisateursPage() {
  return (
    <AppShell allowedRoles={["DD"]}>
      <AdminUtilisateursClient />
    </AppShell>
  );
}

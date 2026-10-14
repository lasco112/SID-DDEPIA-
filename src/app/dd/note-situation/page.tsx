import AppShell from "@/components/AppShell";
import NoteSituationClient from "@/components/NoteSituationClient";

/**
 * La note de situation du département : une lecture rapide, à présenter en
 * dix minutes (demande du Délégué, 14 octobre 2026). Réservée au DD.
 */
export default function NoteSituationPage() {
  return (
    <AppShell allowedRoles={["DD"]}>
      <div className="max-w-5xl">
        <h1 className="text-2xl font-bold text-primary-dark">Note de situation</h1>
        <p className="mt-1 text-gray-600">
          La situation du département en un coup d&apos;œil : chiffres clés, faits saillants, graphiques, et ce que valent les
          chiffres. À projeter en dix minutes (PowerPoint), ou à imprimer et envoyer (Word, PDF).
        </p>
        <div className="mt-6">
          <NoteSituationClient />
        </div>
      </div>
    </AppShell>
  );
}

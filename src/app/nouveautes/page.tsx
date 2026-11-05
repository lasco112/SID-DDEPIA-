import { getServerSession } from "next-auth";
import AppShell from "@/components/AppShell";
import { authOptions } from "@/lib/auth";
import { contexteSession } from "@/lib/permissions";
import { EDITIONS, nouveautesPour } from "@/lib/nouveautes";
import { EtapesNouveaute } from "@/components/FicheNouveautes";

/**
 * Les nouveautés de chaque mise à jour, pour CE rôle, la plus récente en tête
 * (ordre du Délégué, 4 novembre 2026). La fiche s'affiche d'elle-même une fois
 * après chaque mise à jour ; cette page permet de la revoir.
 */
export default async function NouveautesPage() {
  const user = await contexteSession(await getServerSession(authOptions));
  const role = user?.role ?? "";
  const adminSysteme = user?.adminSysteme ?? false;
  const editions = EDITIONS.map((e) => ({ edition: e, liste: nouveautesPour(e, role, adminSysteme) })).filter((x) => x.liste.length > 0);

  return (
    <AppShell>
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold text-primary-dark">Nouveautés</h1>
        <p className="mt-1 text-gray-600">Ce qui a changé pour vous à chaque mise à jour du SID : l&apos;écran, ce que vous faites, ce que vous obtenez.</p>
        {editions.length === 0 && <p className="mt-6 text-ink-muted">Aucune nouveauté pour votre fonction pour le moment.</p>}
        {editions.map(({ edition, liste }) => (
          <section key={edition.id} className="mt-8">
            <h2 className="text-[13px] font-bold uppercase tracking-wide text-cuivre">{edition.titre}</h2>
            {liste.map((n) => (
              <div key={n.id} className="mt-4">
                <h3 className="mb-2 text-[17px] font-bold text-primary-dark">{n.titre}</h3>
                <EtapesNouveaute n={n} />
              </div>
            ))}
          </section>
        ))}
      </div>
    </AppShell>
  );
}

/**
 * /dd/donnees — Consultation et correction, par le DD, des données de chaque
 * arrondissement avant consolidation (CDC §4 et §7).
 *
 * Deux niveaux de lecture dans le même écran :
 *  - niveau 1, les données d'un arrondissement précis ;
 *  - niveau 2, le total départemental, avec la répartition qui le compose —
 *    pour comprendre d'où vient chaque chiffre consolidé.
 */
import { getServerSession } from 'next-auth';
import { resoudrePeriode } from '@/server/periodes/courante';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { contexteSession } from '@/lib/permissions';
import AppShell from '@/components/AppShell';
import DDDonneesClient from '@/components/DDDonneesClient';

export default async function DDDonneesPage({
  searchParams,
}: {
  searchParams: { arrondissement?: string };
}) {
  const session = await getServerSession(authOptions);
  const moi = await contexteSession(session);
  if (!moi || moi.role !== 'DD') redirect('/');
  const db = moi.db;

  const [periode, arrondissements, templates] = await Promise.all([
    resoudrePeriode(db),
    db.arrondissement.findMany({ orderBy: { ordre: 'asc' } }),
    db.formTemplate.findMany({ where: { actif: true }, orderBy: { ordre: 'asc' }, include: { section: true } }),
  ]);

  if (!periode) {
    return (
      <AppShell allowedRoles={['DD']}>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">Aucune période n'est ouverte.</div>
      </AppShell>
    );
  }

  // Le code d'arrondissement peut arriver par l'URL (lien « Voir les données »
  // depuis la Supervision) : on le convertit ici en identifiant.
  const depuisUrl = searchParams.arrondissement
    ? arrondissements.find((a) => a.code === searchParams.arrondissement)?.id ?? null
    : null;

  return (
    <AppShell allowedRoles={['DD']}>
      <DDDonneesClient
        periode={{ id: periode.id, mois: periode.mois ?? 0, annee: periode.annee, statut: periode.statut }}
        arrondissements={arrondissements.map((a) => ({ id: a.id, code: a.code, nom: a.nom }))}
        templates={templates.map((t) => ({
          code: t.code,
          numero: t.numero,
          titre: t.titre,
          type: t.type,
          section: t.section.nom,
        }))}
        arrondissementInitial={depuisUrl}
      />
    </AppShell>
  );
}

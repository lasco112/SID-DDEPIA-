/**
 * /dd/periodes — Gestion des périodes de rapportage (CDC §2, §15.7).
 */
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { contexteSession } from '@/lib/permissions';
import { resoudrePeriode } from '@/server/periodes/courante';
import AppShell from '@/components/AppShell';
import GestionPeriodesClient from '@/components/GestionPeriodesClient';

export default async function DDPeriodesPage() {
  const session = await getServerSession(authOptions);
  const moi = await contexteSession(session);
  if (!moi || moi.role !== 'DD') redirect('/');

  const courante = await resoudrePeriode(moi.db);

  return (
    <AppShell allowedRoles={['DD']}>
      <GestionPeriodesClient couranteId={courante?.id ?? null} />
    </AppShell>
  );
}

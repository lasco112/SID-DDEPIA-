import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import AppShell from '@/components/AppShell';
import DeverrouillerButton from '@/components/DeverrouillerButton';
import SyntheseValidationRow from '@/components/SyntheseValidationRow';
import GenererRapportDDButton from '@/components/GenererRapportDDButton';

const STATUT_STYLE: Record<string, string> = {
  SOUMIS: 'bg-green-100 text-green-800',
  CLOTURE: 'bg-green-100 text-green-800',
  REJETE: 'bg-red-100 text-red-800',
  EN_SAISIE: 'bg-amber-100 text-amber-800',
};

export default async function DDSupervisionPage() {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== 'DD') {
    redirect('/');
  }

  const periode = await db.periodeReporting.findFirst({
    where: { type: 'MENSUEL' },
    orderBy: [{ annee: 'desc' }, { mois: 'desc' }],
  });

  const [rapports, validations, syntheses, sections] = periode
    ? await Promise.all([
        db.rapportArrondissement.findMany({ where: { periodeId: periode.id }, include: { arrondissement: true } }),
        db.validationSection.findMany({ where: { periodeId: periode.id }, include: { section: true } }),
        db.syntheseSection.findMany({ where: { periodeId: periode.id }, include: { section: true } }),
        db.section.findMany({ orderBy: { ordre: 'asc' } }),
      ])
    : [[], [], [], []];

  const arrondissements = await db.arrondissement.findMany({ orderBy: { ordre: 'asc' } });

  return (
    <AppShell allowedRoles={['DD']}>
      <div className="max-w-6xl">
        <h1 className="text-2xl font-bold text-primary-dark">Supervision départementale</h1>

        {periode ? (
          <div className="mt-4 space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm text-gray-800">
                <strong>Période :</strong> {periode.mois}/{periode.annee} <span className="text-gray-500">({periode.statut})</span>
              </p>
              <div className="flex flex-wrap gap-3">
                <GenererRapportDDButton periodeId={periode.id} type="DD" />
                <GenererRapportDDButton periodeId={periode.id} type="EXACT" />
              </div>
            </div>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">État de soumission des arrondissements</h2>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="border-b border-gray-200 px-4 py-2">Arrondissement</th>
                      <th className="border-b border-gray-200 px-4 py-2">Statut</th>
                      <th className="border-b border-gray-200 px-4 py-2">Soumission</th>
                      <th className="border-b border-gray-200 px-4 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arrondissements.map((arr) => {
                      const r = rapports.find((r) => r.arrondissementId === arr.id);
                      return (
                        <tr key={arr.id}>
                          <td className="border-b border-gray-100 px-4 py-2 font-medium">{arr.nom}</td>
                          <td className="border-b border-gray-100 px-4 py-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUT_STYLE[r?.statut ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                              {r?.statut ?? 'AUCUNE SAISIE'}
                            </span>
                          </td>
                          <td className="border-b border-gray-100 px-4 py-2 text-gray-600">
                            {r?.dateSoumission ? new Date(r.dateSoumission).toLocaleString('fr-FR') : '—'}
                          </td>
                          <td className="border-b border-gray-100 px-4 py-2">
                            {r && periode.statut === 'VERROUILLEE_DA' && r.statut !== 'SOUMIS' && r.statut !== 'CLOTURE' && !r.deverrouillePar && (
                              <DeverrouillerButton rapportId={r.id} />
                            )}
                            {r?.deverrouillePar && <span className="text-xs text-amber-700">Déverrouillé exceptionnellement</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Validation des sections</h2>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="border-b border-gray-200 px-4 py-2">Section</th>
                      <th className="border-b border-gray-200 px-4 py-2">Statut du contrôle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((s) => {
                      const v = validations.find((v) => v.sectionId === s.id);
                      return (
                        <tr key={s.id}>
                          <td className="border-b border-gray-100 px-4 py-2 font-medium">{s.nom}</td>
                          <td className="border-b border-gray-100 px-4 py-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${v?.statut === 'VALIDE' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                              {v?.statut ?? 'EN_ATTENTE'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Synthèses d'analyse</h2>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="border-b border-gray-200 px-4 py-2">Section</th>
                      <th className="border-b border-gray-200 px-4 py-2">Contenu</th>
                      <th className="border-b border-gray-200 px-4 py-2">Statut</th>
                      <th className="border-b border-gray-200 px-4 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sections.map((s) => {
                      const synth = syntheses.find((x) => x.sectionId === s.id);
                      return synth ? (
                        <SyntheseValidationRow
                          key={s.id}
                          syntheseId={synth.id}
                          sectionNom={s.nom}
                          contenuFinal={synth.contenuFinal}
                          valideDD={synth.valideDD}
                        />
                      ) : (
                        <tr key={s.id}>
                          <td className="border-b border-gray-100 px-4 py-2 font-medium">{s.nom}</td>
                          <td className="border-b border-gray-100 px-4 py-2 text-gray-400" colSpan={3}>
                            Synthèse non rédigée
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">Aucune période n'est ouverte.</div>
        )}
      </div>
    </AppShell>
  );
}

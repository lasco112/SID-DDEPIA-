import React from 'react';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { contexteSession } from '@/lib/permissions';
import { resoudrePeriode } from '@/server/periodes/courante';
import AppShell from '@/components/AppShell';
import DeverrouillerButton from '@/components/DeverrouillerButton';
import SyntheseValidationRow from '@/components/SyntheseValidationRow';
import GenererRapportDDButton from '@/components/GenererRapportDDButton';
import PurgerDonneesTestButton from '@/components/PurgerDonneesTestButton';
import ReporterEcheanceButton from '@/components/ReporterEcheanceButton';
import ValidationsDDPanel from '@/components/ValidationsDDPanel';
import CloturePeriodePanel from '@/components/CloturePeriodePanel';
import ControleReportPanel from '@/components/ControleReportPanel';
import { tauxRemplissageParArrondissement } from '@/server/supervision/tauxRemplissage';

const STATUT_STYLE: Record<string, string> = {
  SOUMIS: 'bg-green-100 text-green-800',
  CLOTURE: 'bg-green-100 text-green-800',
  REJETE: 'bg-red-100 text-red-800',
  EN_SAISIE: 'bg-amber-100 text-amber-800',
};

export default async function DDSupervisionPage() {
  const session = await getServerSession(authOptions);
  const moi = await contexteSession(session);
  if (!moi || moi.role !== 'DD') {
    redirect('/');
  }
  const db = moi.db;

  // Période de travail choisie par le DD, et non « la dernière » : il doit
  // pouvoir superviser un mois antérieur (§1).
  const choisie = await resoudrePeriode(db);
  const periode = choisie
    ? await db.periodeReporting.findUnique({
        where: { id: choisie.id },
        include: { clotureePar: { select: { nom: true } } },
      })
    : null;

  const [rapports, validations, syntheses, sections] = periode
    ? await Promise.all([
        db.rapportArrondissement.findMany({ where: { periodeId: periode.id }, include: { arrondissement: true } }),
        db.validationSection.findMany({
          where: { periodeId: periode.id },
          include: { section: true, validePar: { select: { nom: true } } },
        }),
        db.syntheseSection.findMany({ where: { periodeId: periode.id }, include: { section: true } }),
        db.section.findMany({ orderBy: { ordre: 'asc' } }),
      ])
    : [[], [], [], []];

  const arrondissements = await db.arrondissement.findMany({ orderBy: { ordre: 'asc' } });
  const remplissage = periode ? await tauxRemplissageParArrondissement(db, periode.id) : new Map();

  // Dernière version du rapport transmis par chaque arrondissement. `contenu`
  // est volontairement exclu de la sélection : inutile de charger les
  // documents entiers en mémoire pour n'afficher que des liens.
  const documentsDA = periode
    ? await db.exportDocument.findMany({
        where: { periodeId: periode.id, type: 'RAPPORT_DA_DOCX' },
        orderBy: { version: 'desc' },
        select: { id: true, version: true, createdAt: true, arrondissementId: true },
      })
    : [];
  const dernierRapportParArrondissement = new Map<string, (typeof documentsDA)[number]>();
  for (const d of documentsDA) {
    if (d.arrondissementId && !dernierRapportParArrondissement.has(d.arrondissementId)) {
      dernierRapportParArrondissement.set(d.arrondissementId, d);
    }
  }

  // État des validations (§10) : le DD doit voir précisément ce qui bloque la
  // clôture avant de décider d'attendre ou de valider lui-même.
  // Le BAC ne contrôle aucun des 28 tableaux : sa validation n'est pas
  // bloquante pour une période mensuelle — même règle que verifierCompletudeDD.
  const etatArrondissements = arrondissements.map((a) => ({
    nom: a.nom,
    soumis: rapports.some((r) => r.arrondissementId === a.id && (r.statut === 'SOUMIS' || r.statut === 'CLOTURE')),
  }));
  const etatSections = sections.map((s) => {
    const v = validations.find((v) => v.sectionId === s.id);
    return {
      sectionId: s.id,
      code: s.code,
      nom: s.nom,
      valide: v?.statut === 'VALIDE',
      bloquante: s.code !== 'BAC',
      parLeDD: Boolean(v?.validationDirecteDD),
      validePar: v?.validePar?.nom ?? null,
      dateValidation: v?.dateValidation?.toISOString() ?? null,
      motif: v?.motifValidationDD ?? null,
    };
  });
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
                {/* L'aperçu est disponible à tout moment (§11) : c'est justement
                    quand le rapport est incomplet qu'il sert à repérer ce qui
                    manque. Le définitif, lui, reste conditionné aux validations. */}
                <GenererRapportDDButton periodeId={periode.id} type="APERCU" secondaire />
                <GenererRapportDDButton periodeId={periode.id} type="DD" />
                <GenererRapportDDButton periodeId={periode.id} type="EXACT" />
              </div>
            </div>

            <ReporterEcheanceButton
              dateLimiteActuelle={periode.dateLimiteDA.toISOString()}
              verrouillee={periode.statut === 'VERROUILLEE_DA'}
            />

            <ValidationsDDPanel
              periodeId={periode.id}
              periodeCloturee={periode.statut === 'ARCHIVEE'}
              arrondissements={etatArrondissements}
              sections={etatSections}
            />

            <ControleReportPanel />

            <CloturePeriodePanel
              periodeId={periode.id}
              cloturee={periode.statut === 'ARCHIVEE'}
              clotureeLe={periode.clotureeLe?.toISOString() ?? null}
              clotureePar={periode.clotureePar?.nom ?? null}
              motifReouverture={periode.motifReouverture}
              reouverteLe={periode.reouverteLe?.toISOString() ?? null}
            />

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">État de soumission des arrondissements</h2>
                {dernierRapportParArrondissement.size > 0 && (
                  <a
                    href={`/api/reports/archives/lot-da?periodeId=${periode.id}`}
                    className="rounded-md border border-primary-dark px-3 py-1.5 text-xs font-semibold text-primary-dark hover:bg-green-50"
                  >
                    Télécharger tous les rapports des DA ({dernierRapportParArrondissement.size})
                  </a>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="border-b border-gray-200 px-4 py-2">Arrondissement</th>
                      <th className="border-b border-gray-200 px-4 py-2">Statut</th>
                      <th className="border-b border-gray-200 px-4 py-2">Remplissage du canevas</th>
                      <th className="border-b border-gray-200 px-4 py-2">Soumission</th>
                      <th className="border-b border-gray-200 px-4 py-2">Données saisies</th>
                      <th className="border-b border-gray-200 px-4 py-2">Rapport transmis</th>
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
                          <td className="border-b border-gray-100 px-4 py-2">
                            <RemplissageCellule info={remplissage.get(arr.id)} />
                          </td>
                          <td className="border-b border-gray-100 px-4 py-2 text-gray-600">
                            {r?.dateSoumission ? new Date(r.dateSoumission).toLocaleString('fr-FR') : '—'}
                          </td>
                          <td className="border-b border-gray-100 px-4 py-2">
                            <a
                              href={`/dd/donnees?arrondissement=${arr.code}`}
                              className="text-xs font-semibold text-primary-dark underline hover:no-underline"
                            >
                              Voir les données
                            </a>
                          </td>
                          <td className="border-b border-gray-100 px-4 py-2">
                            <RapportTransmis doc={dernierRapportParArrondissement.get(arr.id)} />
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

        <div className="mt-10">
          <PurgerDonneesTestButton />
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Rapport .docx transmis par un arrondissement, dans sa dernière version.
 * Le DD peut le lire dans le navigateur ou le télécharger tel que le DA l'a
 * produit — le document est relu depuis la base, pas régénéré.
 */
function RapportTransmis({ doc }: { doc?: { id: string; version: number; createdAt: Date } }) {
  if (!doc) {
    return <span className="text-xs text-gray-400">Pas encore généré</span>;
  }
  return (
    <div className="min-w-[130px]">
      <div className="flex gap-2">
        <a
          href={`/api/reports/archives/${doc.id}?apercu=1`}
          target="_blank"
          rel="noopener"
          className="text-xs font-semibold text-primary-dark underline hover:no-underline"
        >
          Lire
        </a>
        <a
          href={`/api/reports/archives/${doc.id}`}
          className="text-xs font-semibold text-primary-dark underline hover:no-underline"
        >
          Télécharger
        </a>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        v{doc.version} — {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
      </p>
    </div>
  );
}

/**
 * Part du canevas réellement renseignée par un arrondissement. Le code couleur
 * sert à repérer d'un coup d'œil un rapport bâclé, y compris lorsqu'il est
 * marqué « SOUMIS » : la soumission n'a jamais rien garanti sur le contenu.
 */
function RemplissageCellule({
  info,
}: {
  info?: { taux: number; renseigne: number; attendu: number; lignesEvenement: number };
}) {
  if (!info) return <span className="text-gray-400">—</span>;

  const couleur =
    info.taux >= 80
      ? { barre: 'bg-statut-soumisDot', texte: 'text-statut-soumisText' }
      : info.taux >= 50
        ? { barre: 'bg-statut-retardDot', texte: 'text-statut-retardText' }
        : { barre: 'bg-statut-rejeteDot', texte: 'text-statut-rejeteText' };

  return (
    <div className="min-w-[150px]">
      <div className="flex items-baseline gap-2">
        <span className={`text-sm font-bold ${couleur.texte}`}>{info.taux} %</span>
        <span className="text-xs text-gray-500">
          {info.renseigne} / {info.attendu} cases
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full rounded-full ${couleur.barre}`} style={{ width: `${info.taux}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-gray-500">
        {info.lignesEvenement} ligne{info.lignesEvenement > 1 ? 's' : ''} déclarée
        {info.lignesEvenement > 1 ? 's' : ''} (vaccinations, foyers…)
      </p>
    </div>
  );
}

/**
 * report.ts — reprise des valeurs du mois précédent à l'ouverture d'un mois.
 *
 * Demande du DD : à l'ouverture d'un nouveau mois, l'agent de saisie doit
 * retrouver les chiffres du mois précédent déjà inscrits, qu'il confirme ou
 * corrige en tapant par-dessus, sans avoir à tout ressaisir.
 *
 * Deux garde-fous, décidés avec le DD :
 *
 *  1. Une valeur reprise est MARQUÉE (`reporte = true`). Elle s'affiche en
 *     grisé et cesse de l'être dès que l'agent tape dessus.
 *  2. Le rapport ne peut pas être transmis tant qu'il reste des valeurs
 *     reprises non confirmées. Sans cela, un mois entier de production
 *     — œufs, abattages, vaccinations — serait validé sans que personne ne
 *     l'ait regardé, simplement parce que personne n'a rien touché.
 *
 * Les tableaux d'ÉVÉNEMENTS (vaccinations, foyers, saisies en abattoir) ne
 * sont jamais repris : ce sont des listes de faits datés, pas des états. Les
 * recopier reviendrait à déclarer une seconde fois des événements qui n'ont
 * eu lieu qu'une fois.
 */
import type { PrismaClient } from "@prisma/client";

export interface ResultatReport {
  matrice: number;
  nominatif: number;
  arrondissements: number;
}

/**
 * Recopie les valeurs de `periodeSourceId` vers `periodeCibleId`, pour tous
 * les arrondissements. N'écrase JAMAIS une valeur déjà présente dans le mois
 * cible : si un agent a commencé à saisir, son travail prime.
 */
export async function reporterMoisPrecedent(
  db: PrismaClient,
  periodeSourceId: string,
  periodeCibleId: string
): Promise<ResultatReport> {
  const resultat: ResultatReport = { matrice: 0, nominatif: 0, arrondissements: 0 };

  const rapportsSource = await db.rapportArrondissement.findMany({
    where: { periodeId: periodeSourceId },
    select: { id: true, arrondissementId: true },
  });
  if (rapportsSource.length === 0) return resultat;

  for (const source of rapportsSource) {
    // Le rapport du mois cible peut ne pas exister encore : on le crée, sinon
    // les valeurs reprises n'auraient nulle part où se rattacher.
    const cible = await db.rapportArrondissement.upsert({
      where: { periodeId_arrondissementId: { periodeId: periodeCibleId, arrondissementId: source.arrondissementId } },
      update: {},
      create: { periodeId: periodeCibleId, arrondissementId: source.arrondissementId, statut: "EN_SAISIE" },
    });
    resultat.arrondissements++;

    // --- Tableaux MATRICE
    const matrice = await db.saisieMatrice.findMany({
      where: { rapportId: source.id, nonRenseigne: false },
      select: { fieldCode: true, valeur: true, valeurTexte: true },
    });
    const dejaMatrice = new Set(
      (await db.saisieMatrice.findMany({ where: { rapportId: cible.id }, select: { fieldCode: true } })).map((s) => s.fieldCode)
    );
    const aCreerMatrice = matrice.filter((s) => !dejaMatrice.has(s.fieldCode));
    if (aCreerMatrice.length > 0) {
      await db.saisieMatrice.createMany({
        data: aCreerMatrice.map((s) => ({
          rapportId: cible.id,
          fieldCode: s.fieldCode,
          valeur: s.valeur,
          valeurTexte: s.valeurTexte,
          nonRenseigne: false,
          reporte: true,
          clientId: `report:${cible.id}:${s.fieldCode}`,
        })),
        skipDuplicates: true,
      });
      resultat.matrice += aCreerMatrice.length;
    }

    // --- Tableaux NOMINATIFS (une ligne par établissement)
    const nominatif = await db.saisieNominative.findMany({
      where: { rapportId: source.id, nonRenseigne: false },
      select: { templateId: true, etablissementId: true, fieldCode: true, valeur: true, valeurTexte: true },
    });
    const dejaNominatif = new Set(
      (await db.saisieNominative.findMany({ where: { rapportId: cible.id }, select: { etablissementId: true, fieldCode: true } })).map(
        (s) => `${s.etablissementId}:${s.fieldCode}`
      )
    );
    const aCreerNominatif = nominatif.filter((s) => !dejaNominatif.has(`${s.etablissementId}:${s.fieldCode}`));
    if (aCreerNominatif.length > 0) {
      await db.saisieNominative.createMany({
        data: aCreerNominatif.map((s) => ({
          rapportId: cible.id,
          templateId: s.templateId,
          etablissementId: s.etablissementId,
          fieldCode: s.fieldCode,
          valeur: s.valeur,
          valeurTexte: s.valeurTexte,
          nonRenseigne: false,
          reporte: true,
          clientId: `report:${cible.id}:${s.etablissementId}:${s.fieldCode}`,
        })),
        skipDuplicates: true,
      });
      resultat.nominatif += aCreerNominatif.length;
    }
  }

  return resultat;
}

/** Tableaux d'un rapport contenant encore des valeurs reprises non confirmées. */
export async function tableauxNonConfirmes(db: PrismaClient, rapportId: string): Promise<string[]> {
  const [matrice, nominatif] = await Promise.all([
    db.saisieMatrice.findMany({
      where: { rapportId, reporte: true },
      select: { field: { select: { template: { select: { numero: true, titre: true } } } } },
    }),
    db.saisieNominative.findMany({
      where: { rapportId, reporte: true },
      select: { template: { select: { numero: true, titre: true } } },
    }),
  ]);

  const noms = new Set<string>();
  for (const m of matrice) noms.add(`${m.field.template.numero} ${m.field.template.titre}`);
  for (const n of nominatif) noms.add(`${n.template.numero} ${n.template.titre}`);
  return Array.from(noms).sort();
}

/** Confirme en bloc les valeurs reprises d'un tableau : elles deviennent des données du mois. */
export async function confirmerTableau(db: PrismaClient, rapportId: string, templateCode: string): Promise<number> {
  const [m, n] = await Promise.all([
    db.saisieMatrice.updateMany({
      where: { rapportId, reporte: true, field: { template: { code: templateCode } } },
      data: { reporte: false },
    }),
    db.saisieNominative.updateMany({
      where: { rapportId, reporte: true, template: { code: templateCode } },
      data: { reporte: false },
    }),
  ]);
  return m.count + n.count;
}

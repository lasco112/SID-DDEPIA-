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
 *
 * Deux moments de reprise : à l'ouverture du mois par le DD (pour tous les
 * arrondissements), et à la TRANSMISSION d'un mois par un DA quand le mois
 * suivant est déjà ouvert (pour son seul arrondissement). Sans le second, un
 * DA qui finissait son mois après l'ouverture du suivant ne retrouvait rien
 * (Fokoué, juillet → août 2026).
 */
import type { PrismaClient } from "@prisma/client";
import { periodeEstCloturee } from "@/server/periodes/gel";

export interface ResultatReport {
  matrice: number;
  nominatif: number;
  arrondissements: number;
}

/**
 * Date d'une valeur reprise : l'origine des temps, plus son rang. Une reprise
 * doit perdre contre TOUTE vraie saisie — sur le serveur, `modifieLe` vide la
 * rend remplaçable ; sur le téléphone, c'est cette date qui départage, et une
 * date « maintenant » ferait passer la reprise devant une saisie d'août encore
 * en attente d'envoi, qui serait alors perdue. Le rang garde l'ordre d'arrivée
 * du mois source (ordre des établissements dans le rapport).
 */
const dateDeReprise = (rang: number) => new Date(rang);

/** Un rapport déjà transmis ne reçoit plus rien : il est entre les mains du DD. */
const STATUTS_FERMES = ["SOUMIS", "CLOTURE"];

/**
 * Recopie les valeurs de `periodeSourceId` vers `periodeCibleId`, pour tous
 * les arrondissements (ou le seul `arrondissementId`). N'écrase JAMAIS une
 * valeur déjà présente dans le mois cible : si un agent a commencé à saisir,
 * son travail prime. Un rapport cible déjà transmis n'est pas touché.
 */
export async function reporterMoisPrecedent(
  db: PrismaClient,
  periodeSourceId: string,
  periodeCibleId: string,
  options: { arrondissementId?: string } = {}
): Promise<ResultatReport> {
  const resultat: ResultatReport = { matrice: 0, nominatif: 0, arrondissements: 0 };

  const rapportsSource = await db.rapportArrondissement.findMany({
    where: { periodeId: periodeSourceId, ...(options.arrondissementId ? { arrondissementId: options.arrondissementId } : {}) },
    select: { id: true, arrondissementId: true },
  });
  if (rapportsSource.length === 0) return resultat;

  for (const source of rapportsSource) {
    const existant = await db.rapportArrondissement.findUnique({
      where: { periodeId_arrondissementId: { periodeId: periodeCibleId, arrondissementId: source.arrondissementId } },
      select: { statut: true },
    });
    if (existant && STATUTS_FERMES.includes(existant.statut)) continue;

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
      orderBy: [{ syncedAt: "asc" }, { id: "asc" }],
    });
    const dejaMatrice = new Set(
      (await db.saisieMatrice.findMany({ where: { rapportId: cible.id }, select: { fieldCode: true } })).map((s) => s.fieldCode)
    );
    const aCreerMatrice = matrice.filter((s) => !dejaMatrice.has(s.fieldCode));
    if (aCreerMatrice.length > 0) {
      await db.saisieMatrice.createMany({
        data: aCreerMatrice.map((s, rang) => ({
          rapportId: cible.id,
          fieldCode: s.fieldCode,
          valeur: s.valeur,
          valeurTexte: s.valeurTexte,
          nonRenseigne: false,
          reporte: true,
          syncedAt: dateDeReprise(rang),
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
      orderBy: [{ syncedAt: "asc" }, { id: "asc" }],
    });
    const dejaNominatif = new Set(
      (await db.saisieNominative.findMany({ where: { rapportId: cible.id }, select: { etablissementId: true, fieldCode: true } })).map(
        (s) => `${s.etablissementId}:${s.fieldCode}`
      )
    );
    const aCreerNominatif = nominatif.filter((s) => !dejaNominatif.has(`${s.etablissementId}:${s.fieldCode}`));
    if (aCreerNominatif.length > 0) {
      await db.saisieNominative.createMany({
        data: aCreerNominatif.map((s, rang) => ({
          rapportId: cible.id,
          templateId: s.templateId,
          etablissementId: s.etablissementId,
          fieldCode: s.fieldCode,
          valeur: s.valeur,
          valeurTexte: s.valeurTexte,
          nonRenseigne: false,
          reporte: true,
          syncedAt: dateDeReprise(rang),
          clientId: `report:${cible.id}:${s.etablissementId}:${s.fieldCode}`,
        })),
        skipDuplicates: true,
      });
      resultat.nominatif += aCreerNominatif.length;
    }
  }

  return resultat;
}

/**
 * À la transmission d'un mois par un DA : si le mois SUIVANT est déjà ouvert,
 * ses chiffres y sont repris aussitôt, pour son seul arrondissement. Sans
 * effet s'il n'y a pas de mois suivant (il sera repris à son ouverture), si ce
 * mois est clôturé, ou si le rapport suivant est déjà transmis.
 */
export async function reprendreDansMoisSuivant(
  db: PrismaClient,
  periodeId: string,
  arrondissementId: string
): Promise<{ periodeCibleId: string; resultat: ResultatReport } | null> {
  const periode = await db.periodeReporting.findUnique({ where: { id: periodeId }, select: { type: true, annee: true, mois: true } });
  if (!periode || periode.type !== "MENSUEL" || periode.mois == null) return null;

  const suivante = await db.periodeReporting.findFirst({
    where: { type: "MENSUEL", OR: [{ annee: { gt: periode.annee } }, { annee: periode.annee, mois: { gt: periode.mois } }] },
    orderBy: [{ annee: "asc" }, { mois: "asc" }],
    select: { id: true },
  });
  if (!suivante || (await periodeEstCloturee(db, suivante.id))) return null;

  const resultat = await reporterMoisPrecedent(db, periodeId, suivante.id, { arrondissementId });
  return { periodeCibleId: suivante.id, resultat };
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

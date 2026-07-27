/**
 * tauxRemplissage.ts — mesure, par arrondissement, la part du canevas
 * réellement renseignée pour une période.
 *
 * Pourquoi : la génération du rapport départemental ne vérifie que le CIRCUIT
 * (qui a soumis, qui a validé), jamais le contenu. Six arrondissements
 * pouvaient donc soumettre des tableaux quasi vides et le rapport se
 * générait, rempli de tirets. Le DD a demandé à voir « d'un coup d'œil qui a
 * bâclé » — c'est le rôle de cet indicateur.
 *
 * Ce qui compte comme renseigné : une cellule pour laquelle une saisie
 * existe, y compris marquée « non renseigné » avec motif — c'est une réponse
 * délibérée de l'agent, pas un oubli.
 *
 * Ce qui n'entre PAS dans le taux : les 8 tableaux ÉVÉNEMENT (vaccinations,
 * foyers de maladie, saisies d'abattoir...). Ils n'ont aucun nombre de lignes
 * attendu — zéro foyer déclaré peut être la stricte vérité. Leur volume est
 * donc rapporté à part, à titre indicatif.
 */
import type { PrismaClient } from "@prisma/client";
import { NOMINATIF_ETABLISSEMENT_TYPE } from "@/lib/nominatifTypes";

export interface RemplissageArrondissement {
  arrondissementId: string;
  attendu: number;
  renseigne: number;
  /** Part du canevas renseignée, de 0 à 100. */
  taux: number;
  /** Lignes déclarées dans les tableaux ÉVÉNEMENT — hors taux, purement indicatif. */
  lignesEvenement: number;
}

export async function tauxRemplissageParArrondissement(
  db: PrismaClient,
  periodeId: string
): Promise<Map<string, RemplissageArrondissement>> {
  const [rapports, champsMatrice, templatesNominatif, etablissements] = await Promise.all([
    db.rapportArrondissement.findMany({ where: { periodeId }, select: { id: true, arrondissementId: true } }),
    db.formField.count({ where: { actif: true, template: { actif: true, type: "MATRICE" } } }),
    db.formTemplate.findMany({
      where: { actif: true, type: "NOMINATIF" },
      select: { code: true, _count: { select: { fields: { where: { actif: true } } } } },
    }),
    db.etablissement.groupBy({ by: ["arrondissementId", "typeCode"], where: { actif: true }, _count: true }),
  ]);

  const rapportIds = rapports.map((r) => r.id);
  const [parMatrice, parNominatif, parEvenement] = await Promise.all([
    db.saisieMatrice.groupBy({ by: ["rapportId"], where: { rapportId: { in: rapportIds } }, _count: true }),
    db.saisieNominative.groupBy({ by: ["rapportId"], where: { rapportId: { in: rapportIds } }, _count: true }),
    db.saisieEvenement.groupBy({ by: ["rapportId"], where: { rapportId: { in: rapportIds } }, _count: true }),
  ]);

  const compte = (lignes: Array<{ rapportId: string; _count: number }>) =>
    new Map(lignes.map((l) => [l.rapportId, l._count]));
  const nbMatrice = compte(parMatrice);
  const nbNominatif = compte(parNominatif);
  const nbEvenement = compte(parEvenement);

  // Nombre d'établissements actifs par (arrondissement, type) : c'est lui qui
  // fait varier le nombre de cellules attendues d'un arrondissement à l'autre.
  const nbEtab = new Map<string, number>();
  for (const e of etablissements) nbEtab.set(`${e.arrondissementId}:${e.typeCode}`, e._count);

  const resultat = new Map<string, RemplissageArrondissement>();
  for (const rapport of rapports) {
    let attenduNominatif = 0;
    for (const t of templatesNominatif) {
      const typeCode = NOMINATIF_ETABLISSEMENT_TYPE[t.code];
      if (!typeCode) continue;
      attenduNominatif += (nbEtab.get(`${rapport.arrondissementId}:${typeCode}`) ?? 0) * t._count.fields;
    }

    const attendu = champsMatrice + attenduNominatif;
    const renseigne = (nbMatrice.get(rapport.id) ?? 0) + (nbNominatif.get(rapport.id) ?? 0);

    resultat.set(rapport.arrondissementId, {
      arrondissementId: rapport.arrondissementId,
      attendu,
      renseigne,
      // Plafonné à 100 : une correction peut laisser plus de saisies que de
      // cellules attendues si un établissement a été supprimé entre-temps.
      taux: attendu === 0 ? 0 : Math.min(100, Math.round((renseigne / attendu) * 100)),
      lignesEvenement: nbEvenement.get(rapport.id) ?? 0,
    });
  }
  return resultat;
}

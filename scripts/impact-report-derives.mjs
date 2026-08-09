/**
 * SIMULATION — n'écrit RIEN.
 *
 * Répond à une seule question : si la règle de report (1.2 ← 1.4 / 1.5) est
 * mise en service, quelles valeurs déjà saisies par les DA vont changer, et
 * de combien ?
 *
 * À lancer AVANT le déploiement, sur la base concernée :
 *
 *   node --env-file=.env scripts/impact-report-derives.mjs           (base locale)
 *   DATABASE_URL="<url production>" node scripts/impact-report-derives.mjs
 *
 * Sur Railway, l'exécuter depuis le service lui-même : la base de production
 * n'est pas joignable depuis l'extérieur.
 */
import { PrismaClient } from "@prisma/client";

const REGLES = [
  { cible: "T12_VOL_MOD_PONDEUSE", libelle: "Pondeuse — élevage moderne", source: "T14_PONDEUSES_DEBUT", tableau: "1.4" },
  { cible: "T12_VOL_MOD_POULET_CHAIR", libelle: "Poulet chair — élevage moderne", source: "T15_POULETS_DEBUT", tableau: "1.5" },
];

const p = new PrismaClient();
const rapports = await p.rapportArrondissement.findMany({
  include: { arrondissement: true, periode: true },
  orderBy: [{ periode: { annee: "desc" } }, { periode: { mois: "desc" } }],
});

let ecrasements = 0;
let preserves = 0;
let identiques = 0;
let creations = 0;

console.log("SIMULATION DU REPORT AUTOMATIQUE — aucune donnée n'est modifiée\n");

for (const r of rapports) {
  const periode = `${String(r.periode.mois ?? 0).padStart(2, "0")}/${r.periode.annee}`;
  for (const regle of REGLES) {
    const actuelle = await p.saisieMatrice.findUnique({
      where: { rapportId_fieldCode: { rapportId: r.id, fieldCode: regle.cible } },
    });
    const lignes = await p.saisieNominative.findMany({
      where: { rapportId: r.id, fieldCode: regle.source, nonRenseigne: false },
      select: { valeur: true },
    });

    const valeur = actuelle?.valeur == null ? null : Number(actuelle.valeur);
    const somme = lignes.reduce((s, x) => s + Number(x.valeur ?? 0), 0);
    const prefixe = `${periode}  ${r.arrondissement.nom.padEnd(13)} ${regle.libelle.padEnd(30)}`;

    if (lignes.length === 0) {
      preserves++;
      console.log(`${prefixe} conservée (${valeur ?? "vide"}) — tableau ${regle.tableau} vide`);
    } else if (valeur == null) {
      creations++;
      console.log(`${prefixe} REMPLIE : vide -> ${somme} (${lignes.length} ligne(s))`);
    } else if (valeur === somme) {
      identiques++;
      console.log(`${prefixe} inchangée (${somme})`);
    } else {
      ecrasements++;
      const ecart = somme - valeur;
      console.log(
        `${prefixe} *** REMPLACÉE : ${valeur} -> ${somme} (${ecart > 0 ? "+" : ""}${ecart}, ${lignes.length} ligne(s) en ${regle.tableau})`
      );
    }
  }
}

console.log(`
RÉSUMÉ
  ${ecrasements} valeur(s) saisie(s) à la main seraient REMPLACÉES  <- à examiner
  ${creations} case(s) vide(s) seraient remplies
  ${identiques} déjà cohérentes
  ${preserves} conservées telles quelles (tableau source vide)

Une valeur remplacée n'est jamais perdue : l'ancienne est conservée dans
l'historique des corrections, consultable par le DD.`);

await p.$disconnect();

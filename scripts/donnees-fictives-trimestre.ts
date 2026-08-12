/**
 * Données FICTIVES pour éprouver le moteur trimestriel (E4).
 *
 * Crée les mois manquants de deux trimestres — T3 2026 et T3 2025 — afin que la
 * consolidation ET la comparaison à l'année précédente puissent être exercées
 * sur des données réalistes.
 *
 * TROIS GARANTIES, dans cet ordre d'importance :
 *
 *   1. LE MOIS 07/2026 N'EST JAMAIS TOUCHÉ. C'est le mois de référence du
 *      golden master ; y écrire ferait échouer le filet de sécurité du module
 *      mensuel, qui est en production.
 *   2. REPRODUCTIBLE. Les valeurs sont tirées d'un générateur déterministe
 *      amorcé par (champ, arrondissement, mois) : deux exécutions produisent
 *      exactement les mêmes chiffres, et un test peut donc s'appuyer dessus.
 *   3. RECONNAISSABLE ET RÉVERSIBLE. Toutes les lignes portent un clientId
 *      préfixé `fictif-`, et `--supprimer` les retire intégralement.
 *
 * Les valeurs suivent la nature du champ : un stock progresse doucement d'un
 * mois sur l'autre, un flux oscille, un prix dérive lentement. Un trimestre
 * dont tous les mois seraient identiques ne prouverait rien.
 *
 *   npx tsx scripts/donnees-fictives-trimestre.ts
 *   npx tsx scripts/donnees-fictives-trimestre.ts --supprimer
 */
import { PrismaClient } from "@prisma/client";
import { regleDuChamp } from "../src/server/trimestre/reglesChamps";

const db = new PrismaClient();

/** Mois à fabriquer. 07/2026 est délibérément absent : il existe déjà et sert de référence. */
const MOIS_A_CREER = [
  { annee: 2026, mois: 8 },
  { annee: 2026, mois: 9 },
  { annee: 2025, mois: 7 },
  { annee: 2025, mois: 8 },
  { annee: 2025, mois: 9 },
];

const MOIS_PROTEGE = { annee: 2026, mois: 7 };
const PREFIXE = "fictif-";

/** Générateur déterministe : même graine, même suite. Rien n'est laissé au hasard réel. */
function alea(graine: string): number {
  let h = 2166136261;
  for (let i = 0; i < graine.length; i++) {
    h ^= graine.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // xorshift pour décorréler les graines proches ("…_08" et "…_09")
  h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Valeur fictive dérivée de la valeur de juillet 2026, selon la nature du champ.
 * `rang` est le nombre de mois d'écart avec la référence (négatif vers le passé).
 */
function valeurFictive(base: number, fieldCode: string, arr: string, annee: number, mois: number, rang: number): number {
  const r = alea(`${fieldCode}|${arr}|${annee}|${mois}`);
  const regle = regleDuChamp(fieldCode);

  if (regle === "DERNIERE_VALEUR") {
    // Un cheptel se déplace lentement : environ +1,5 % par mois, plus un bruit léger.
    const tendance = 1 + 0.015 * rang;
    return Math.max(0, Math.round(base * tendance * (0.98 + r * 0.04)));
  }
  if (regle === "MOYENNE_PONDEREE") {
    // Un prix dérive doucement à la hausse, sans à-coups.
    const tendance = 1 + 0.008 * rang;
    return Math.max(0, Math.round(base * tendance * (0.99 + r * 0.02)));
  }
  // Un flux oscille franchement d'un mois à l'autre : ±20 %.
  const saison = 1 + 0.02 * rang;
  return Math.max(0, Math.round(base * saison * (0.8 + r * 0.4)));
}

async function supprimer() {
  const saisies = await db.saisieMatrice.deleteMany({ where: { clientId: { startsWith: PREFIXE } } });
  const nominatives = await db.saisieNominative.deleteMany({ where: { clientId: { startsWith: PREFIXE } } });
  console.log(`  saisies matricielles supprimées : ${saisies.count}`);
  console.log(`  saisies nominatives supprimées  : ${nominatives.count}`);

  for (const m of MOIS_A_CREER) {
    const p = await db.periodeReporting.findFirst({ where: { type: "MENSUEL", annee: m.annee, mois: m.mois } });
    if (!p) continue;
    const restantes = await db.saisieMatrice.count({ where: { rapport: { periodeId: p.id } } });
    if (restantes > 0) {
      console.log(`  ${m.mois}/${m.annee} conservé : ${restantes} saisie(s) non fictive(s) s'y trouvent.`);
      continue;
    }
    await db.validationSection.deleteMany({ where: { periodeId: p.id } });
    await db.rapportArrondissement.deleteMany({ where: { periodeId: p.id } });
    await db.periodeReporting.delete({ where: { id: p.id } });
    console.log(`  période ${String(m.mois).padStart(2, "0")}/${m.annee} supprimée`);
  }
}

async function creer() {
  const reference = await db.periodeReporting.findFirst({
    where: { type: "MENSUEL", annee: MOIS_PROTEGE.annee, mois: MOIS_PROTEGE.mois },
  });
  if (!reference) throw new Error("Le mois de référence 07/2026 est introuvable : rien à dériver.");

  const arrondissements = await db.arrondissement.findMany({ orderBy: { ordre: "asc" } });
  const sections = await db.section.findMany();
  const rapportsRef = await db.rapportArrondissement.findMany({ where: { periodeId: reference.id } });
  const saisiesRef = await db.saisieMatrice.findMany({
    where: { rapport: { periodeId: reference.id } },
    select: { rapportId: true, fieldCode: true, valeur: true, valeurTexte: true },
  });
  const saisiesNomRef = await db.saisieNominative.findMany({
    where: { rapport: { periodeId: reference.id } },
    select: { rapportId: true, templateId: true, etablissementId: true, fieldCode: true, valeur: true, valeurTexte: true },
  });

  const champsConnus = new Set((await db.formField.findMany({ where: { actif: true }, select: { code: true } })).map((c) => c.code));
  console.log(
    `Référence ${String(MOIS_PROTEGE.mois).padStart(2, "0")}/${MOIS_PROTEGE.annee} : ` +
      `${saisiesRef.length} saisies matricielles, ${saisiesNomRef.length} saisies nominatives\n`
  );

  for (const m of MOIS_A_CREER) {
    if (m.annee === MOIS_PROTEGE.annee && m.mois === MOIS_PROTEGE.mois) {
      throw new Error("Refus d'écrire sur le mois de référence 07/2026.");
    }

    let periode = await db.periodeReporting.findFirst({ where: { type: "MENSUEL", annee: m.annee, mois: m.mois } });
    if (!periode) {
      periode = await db.periodeReporting.create({
        data: {
          type: "MENSUEL", annee: m.annee, mois: m.mois,
          dateOuverture: new Date(Date.UTC(m.annee, m.mois - 1, 1)),
          dateLimiteDA: new Date(Date.UTC(m.annee, m.mois - 1, 28)),
          dateLimiteChef: new Date(Date.UTC(m.annee, m.mois - 1, 29)),
          dateLimiteDD: new Date(Date.UTC(m.annee, m.mois, 2)),
          // Les mois fictifs sont clos : ils représentent des mois révolus.
          statut: "VALIDEE_DD",
        },
      });
    }

    // Écart en mois avec la référence, pour donner une tendance cohérente.
    const rang = (m.annee - MOIS_PROTEGE.annee) * 12 + (m.mois - MOIS_PROTEGE.mois);

    let creees = 0;
    for (const arr of arrondissements) {
      const rapport = await db.rapportArrondissement.upsert({
        where: { periodeId_arrondissementId: { periodeId: periode.id, arrondissementId: arr.id } },
        update: { statut: "SOUMIS" },
        create: { periodeId: periode.id, arrondissementId: arr.id, statut: "SOUMIS", dateSoumission: new Date(Date.UTC(m.annee, m.mois, 1)) },
      });

      const rapportRef = rapportsRef.find((r) => r.arrondissementId === arr.id);
      if (!rapportRef) continue;

      const lignes = saisiesRef.filter((s) => s.rapportId === rapportRef.id && champsConnus.has(s.fieldCode));
      const aCreer = lignes.map((s) => ({
        rapportId: rapport.id,
        fieldCode: s.fieldCode,
        valeur: s.valeur == null ? null : valeurFictive(Number(s.valeur), s.fieldCode, arr.code, m.annee, m.mois, rang),
        valeurTexte: s.valeurTexte,
        clientId: `${PREFIXE}${m.annee}${String(m.mois).padStart(2, "0")}-${arr.code}-${s.fieldCode}`,
        modifieLe: new Date(Date.UTC(m.annee, m.mois, 1)),
      }));

      const r = await db.saisieMatrice.createMany({ data: aCreer, skipDuplicates: true });
      creees += r.count;

      // Tableaux NOMINATIF (1.3, 1.4, 1.5, 2.3) : une ligne par établissement.
      // Sans elles, le trimestre serait dépourvu d'œufs, de poussins, de
      // poulets de chair et de provende.
      const lignesNom = saisiesNomRef.filter((s) => s.rapportId === rapportRef.id && champsConnus.has(s.fieldCode));
      const aCreerNom = lignesNom.map((s) => ({
        rapportId: rapport.id,
        templateId: s.templateId,
        etablissementId: s.etablissementId,
        fieldCode: s.fieldCode,
        valeur: s.valeur == null ? null : valeurFictive(Number(s.valeur), s.fieldCode, arr.code + s.etablissementId.slice(-4), m.annee, m.mois, rang),
        valeurTexte: s.valeurTexte,
        clientId: `${PREFIXE}${m.annee}${String(m.mois).padStart(2, "0")}-${s.etablissementId}-${s.fieldCode}`,
        modifieLe: new Date(Date.UTC(m.annee, m.mois, 1)),
      }));
      const rn = await db.saisieNominative.createMany({ data: aCreerNom, skipDuplicates: true });
      creees += rn.count;
    }

    // Les quatre sections valident : sans cela le mois ne serait pas exploitable.
    for (const s of sections) {
      await db.validationSection.upsert({
        where: { periodeId_sectionId: { periodeId: periode.id, sectionId: s.id } },
        update: { statut: "VALIDE", dateValidation: new Date(Date.UTC(m.annee, m.mois, 1)) },
        create: { periodeId: periode.id, sectionId: s.id, statut: "VALIDE", dateValidation: new Date(Date.UTC(m.annee, m.mois, 1)) },
      });
    }

    console.log(`  ${String(m.mois).padStart(2, "0")}/${m.annee} : ${creees} saisies créées, ${arrondissements.length} arrondissements transmis, 4 sections validées`);
  }
}

async function principal() {
  const supprimerDemande = process.argv.includes("--supprimer");
  console.log(supprimerDemande ? "=== SUPPRESSION DES DONNÉES FICTIVES ===\n" : "=== CRÉATION DES DONNÉES FICTIVES ===\n");
  if (supprimerDemande) await supprimer();
  else await creer();

  const toutes = await db.periodeReporting.findMany({ where: { type: "MENSUEL" }, orderBy: [{ annee: "asc" }, { mois: "asc" }] });
  console.log(`\nPériodes mensuelles en base : ${toutes.map((p) => `${String(p.mois).padStart(2, "0")}/${p.annee}`).join(", ")}`);
  await db.$disconnect();
}

principal().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

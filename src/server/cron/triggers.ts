/**
 * triggers.ts — Logique des 4 déclencheurs calendaires (CDC §12.1), exportée
 * séparément de la planification cron pour être testable directement.
 *
 *   27 à 08h00 : rappel préventif à tous les DA non soumis (échéance le 28)
 *   28 à 18h00 : verrouillage de la période + alerte retard aux DA non soumis
 *   29 à 18h00 : alerte retard aux chefs de sections non validées
 *   02 à 08h00 : rappel de clôture au DD si le rapport n'est pas généré
 */
import { db } from "@/lib/db";
import { notifier } from "@/server/notifications/dispatcher";

async function periodeMensuelleCourante() {
  const now = new Date();
  return db.periodeReporting.findFirst({
    where: { type: "MENSUEL", annee: now.getFullYear(), mois: now.getMonth() + 1 },
    include: { rapports: true, validations: { include: { section: true } }, exports: true },
  });
}

async function periodeMensuellePrecedente() {
  const now = new Date();
  let annee = now.getFullYear();
  let mois = now.getMonth(); // 0-indexé -> mois précédent en 1-indexé
  if (mois === 0) {
    annee -= 1;
    mois = 12;
  }
  return db.periodeReporting.findFirst({
    where: { type: "MENSUEL", annee, mois },
    include: { rapports: true, validations: true, exports: true },
  });
}

export async function rappelJ1DA() {
  const periode = await periodeMensuelleCourante();
  if (!periode || periode.statut !== "OUVERTE") return { notifies: 0 };

  const das = await db.user.findMany({ where: { role: "DA", actif: true }, include: { arrondissement: true } });
  let notifies = 0;
  for (const da of das) {
    const soumis = periode.rapports.some((r) => r.arrondissementId === da.arrondissementId && (r.statut === "SOUMIS" || r.statut === "CLOTURE"));
    if (!soumis) {
      await notifier({
        userId: da.id,
        nom: da.nom,
        telephone: da.telephone,
        whatsapp: da.whatsapp,
        declencheur: "RAPPEL_J-1",
        message: `MINEPIA DDEPIA-Menoua : rappel. La soumission des données mensuelles de ${da.arrondissement?.nom ?? "votre arrondissement"} est attendue au plus tard le 28. Merci de finaliser la saisie et de synchroniser.`,
      });
      notifies++;
    }
  }
  return { notifies };
}

export async function verrouillageEtAlerteRetardDA() {
  const periode = await periodeMensuelleCourante();
  if (!periode || periode.statut !== "OUVERTE") return { verrouille: false, notifies: 0 };

  await db.periodeReporting.update({ where: { id: periode.id }, data: { statut: "VERROUILLEE_DA" } });
  await db.auditLog.create({
    data: { action: "VERROUILLAGE_AUTO", entite: "PeriodeReporting", entiteId: periode.id, details: { regle: "28 du mois, 18h00" } },
  });

  const das = await db.user.findMany({ where: { role: "DA", actif: true }, include: { arrondissement: true } });
  let notifies = 0;
  for (const da of das) {
    const rapport = periode.rapports.find((r) => r.arrondissementId === da.arrondissementId);
    if (!rapport || (rapport.statut !== "SOUMIS" && rapport.statut !== "CLOTURE")) {
      await notifier({
        userId: da.id,
        nom: da.nom,
        telephone: da.telephone,
        whatsapp: da.whatsapp,
        declencheur: "RETARD_DA",
        message: `MINEPIA DDEPIA-Menoua : le délai de soumission du rapport mensuel est dépassé. Votre formulaire est verrouillé. Contactez le Délégué Départemental pour un déverrouillage exceptionnel et synchronisez vos données dès que possible.`,
      });
      notifies++;
    }
  }
  return { verrouille: true, notifies };
}

export async function alerteRetardSections() {
  const periode = await periodeMensuelleCourante();
  if (!periode) return { notifies: 0 };

  // Une section qui n'a encore jamais été touchée par son chef n'a pas de
  // ligne ValidationSection (créée à la demande lors de la 1ère validation) :
  // on la crée ici en EN_ATTENTE pour ne pas la laisser passer sous silence.
  const sections = await db.section.findMany();
  for (const s of sections) {
    if (!periode.validations.some((v) => v.sectionId === s.id)) {
      const v = await db.validationSection.create({ data: { periodeId: periode.id, sectionId: s.id, statut: "EN_ATTENTE" } });
      periode.validations.push({ ...v, section: s });
    }
  }

  let notifies = 0;
  for (const v of periode.validations) {
    if (v.statut !== "VALIDE") {
      const chefs = await db.user.findMany({
        where: { sectionId: v.sectionId, actif: true, role: { in: ["CHEF_BAC", "CHEF_SSV", "CHEF_PSA", "CHEF_SPAIH"] } },
      });
      for (const chef of chefs) {
        await notifier({
          userId: chef.id,
          nom: chef.nom,
          telephone: chef.telephone,
          whatsapp: chef.whatsapp,
          declencheur: "RETARD_SECTION",
          message: `MINEPIA DDEPIA-Menoua : la validation sectorielle (${v.section.code}) du mois n'est pas finalisée. Merci de contrôler les données des arrondissements et de transmettre vos analyses au Délégué Départemental.`,
        });
        notifies++;
      }
    }
  }
  return { notifies };
}

export async function rappelClotureDD() {
  const periode = await periodeMensuellePrecedente();
  if (!periode) return { notifies: 0 };

  const rapportGenere = periode.exports.some((e) => e.type === "RAPPORT_DD_DOCX");
  if (rapportGenere) return { notifies: 0 };

  const dds = await db.user.findMany({ where: { role: "DD", actif: true } });
  let notifies = 0;
  for (const dd of dds) {
    await notifier({
      userId: dd.id,
      nom: dd.nom,
      telephone: dd.telephone,
      whatsapp: dd.whatsapp,
      declencheur: "RAPPEL_CLOTURE_DD",
      message: `MINEPIA DDEPIA-Menoua : le rapport départemental du mois précédent n'est pas encore généré. Merci de valider les synthèses et de procéder à la génération.`,
    });
    notifies++;
  }
  return { notifies };
}

// Efface le mois de test de l'épreuve hors ligne et tout ce qui s'y rattache.
import { base } from "../../src/lib/baseDeTravail";
(async () => {
  const db = base;
  for (const p of await db.periodeReporting.findMany({ where: { type: "MENSUEL", annee: 2031 }, select: { id: true } })) {
    const ids = (await db.rapportArrondissement.findMany({ where: { periodeId: p.id }, select: { id: true } })).map((r) => r.id);
    const r = await db.saisieMatrice.findMany({ where: { rapportId: { in: ids } }, select: { fieldCode: true, valeur: true } });
    console.log("SERVEUR :", JSON.stringify(r));
    await db.correction.deleteMany({ where: { OR: [{ saisieMatrice: { rapportId: { in: ids } } }, { saisieNominative: { rapportId: { in: ids } } }, { saisieEvenement: { rapportId: { in: ids } } }] } });
    await db.saisieMatrice.deleteMany({ where: { rapportId: { in: ids } } });
    await db.saisieNominative.deleteMany({ where: { rapportId: { in: ids } } });
    await db.saisieEvenement.deleteMany({ where: { rapportId: { in: ids } } });
    await db.auditLog.deleteMany({ where: { entiteId: { in: ids } } });
    await db.rapportArrondissement.deleteMany({ where: { periodeId: p.id } });
    await db.periodeReporting.delete({ where: { id: p.id } });
  }
  await db.$disconnect();
})();

// Prépare l'épreuve mensuelle hors ligne : un MOIS DE TEST (janvier 2031) et une
// session d'agent forgée (jamais de mot de passe). Imprime « <periodeId> <jeton> ».
import { encode } from "next-auth/jwt";
import { base } from "../../src/lib/baseDeTravail";
(async () => {
  const p = await base.periodeReporting.create({ data: { type: "MENSUEL", annee: 2031, mois: 1, statut: "OUVERTE", dateOuverture: new Date(Date.UTC(2031, 0, 1)), dateLimiteDA: new Date(Date.UTC(2031, 0, 28)), dateLimiteChef: new Date(Date.UTC(2031, 0, 29)), dateLimiteDD: new Date(Date.UTC(2031, 1, 2)) } });
  const u = await base.user.findFirstOrThrow({ where: { role: "AGENT_SAISIE", actif: true }, select: { id: true, username: true, role: true, arrondissementId: true, sectionId: true } });
  const j = await encode({ token: { sub: u.id, id: u.id, name: u.username, role: u.role, username: u.username, arrondissementId: u.arrondissementId, sectionId: u.sectionId, mustChangePassword: false, isDemo: false }, secret: process.env.NEXTAUTH_SECRET!, maxAge: 4 * 3600 });
  process.stdout.write(`${p.id} ${j}`);
  await base.$disconnect();
})();

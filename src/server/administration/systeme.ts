/**
 * L'administration du système (décisions du Délégué, 14 octobre 2026).
 *
 * Le Délégué de la Menoua administre seul le SID EPIA-O, en plus de son rôle de
 * DD : il prépare et allume les départements, remet les identifiants, purge des
 * données d'essai, valide une nouvelle espèce. Ces travaux sont rangés à part
 * de ceux du DD, pour ne pas être faits par erreur depuis un écran courant.
 *
 * Agir sur un AUTRE département ne contourne pas le cloisonnement : chaque
 * opération se déclare dans le département visé (client cloisonné,
 * transaction cloisonnée), exactement comme le ferait son propre DD. Aucun
 * accès privilégié n'est ouvert. L'appelant a vérifié la marque
 * d'administrateur (`assertAdminSysteme`) ; la trace de chaque action est
 * écrite dans SON journal, avec le département visé.
 */
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { PrismaClient, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { clientCloisonne, transactionCloisonnee } from "@/lib/dbCloisonne";
import { composerIdentite } from "@/lib/departement";
import { motDePasseProvisoire } from "@/lib/departement";
import { cleMarqueurPurge, dernierePurge } from "@/lib/marqueurPurge";

export class ErreurAdministration extends Error {
  status = 400;
}

/** Les trois modèles Word mensuels qu'un département doit avoir avant d'être allumé. */
const MODELES = ["rapport_mensuel_DD", "rapport_mensuel_DA", "rapport_mensuel_exact"];

/** Le département visé, lu par son identifiant (`Departement` n'est pas cloisonnée). */
export async function departementVise(departementId: unknown) {
  if (typeof departementId !== "string" || !departementId) throw new ErreurAdministration("Département non précisé.");
  const d = await db.departement.findUnique({ where: { id: departementId } });
  if (!d) throw new ErreurAdministration("Département introuvable.");
  return d;
}

const LIBELLE_ROLE: Record<Role, string> = {
  DD: "Délégué départemental",
  DA: "Délégué d'arrondissement",
  AGENT_SAISIE: "Agent de saisie",
  CHEF_BAC: "Chef du BAC",
  CHEF_SSV: "Chef de la section SSV",
  CHEF_PSA: "Chef de la section PSA",
  CHEF_SPAIH: "Chef de la section SPAIH",
  ADMIN_TECH: "Administrateur technique",
};

/** « Délégué départemental des Bamboutos », « Délégué d'arrondissement de Mbouda ». */
export function fonctionDe(role: Role, departement: { nom: string; nomAvecArticle: string | null }, arrondissement: string | null): string {
  if (role === "DD") return `${LIBELLE_ROLE.DD} ${composerIdentite({ id: "", code: "", ...departement }).nomAvecArticle}`;
  if ((role === "DA" || role === "AGENT_SAISIE") && arrondissement) {
    // « d'Arrondissement » devant une voyelle : « de Mbouda », mais « d'Ebolowa ».
    const de = /^[aeiouyéèêâîôûh]/i.test(arrondissement) ? "d'" : "de ";
    return `${LIBELLE_ROLE[role]} ${de}${arrondissement}`;
  }
  return LIBELLE_ROLE[role];
}

// ---------------------------------------------------------------------------
// L'état des départements
// ---------------------------------------------------------------------------

export interface EtatDepartement {
  id: string;
  code: string;
  nom: string;
  nomAvecArticle: string;
  actif: boolean;
  /** Le département de l'administrateur : on ne peut pas l'éteindre. */
  estLeMien: boolean;
  arrondissements: string[];
  comptes: { total: number; actifs: number; jamaisConnectes: number; parRole: Record<string, number> };
  derniereConnexion: string | null;
  modelesPresents: string[];
  modelesManquants: string[];
  derniereActivite: string | null;
  dernierePurge: string | null;
  /** Ce qui manque pour l'allumer ; vide quand il est prêt. */
  manques: string[];
}

export async function etatDesDepartements(monDepartementId: string | null): Promise<EtatDepartement[]> {
  const departements = await db.departement.findMany({ orderBy: [{ actif: "desc" }, { nom: "asc" }] });
  return Promise.all(
    departements.map(async (d) => {
      const c = clientCloisonne(db, d.id);
      const [arrondissements, comptes, derniereAction] = await Promise.all([
        c.arrondissement.findMany({ orderBy: { ordre: "asc" }, select: { nom: true } }),
        c.user.findMany({ select: { role: true, actif: true, lastLoginAt: true } }),
        c.auditLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      ]);
      const parRole: Record<string, number> = {};
      for (const u of comptes) parRole[u.role] = (parRole[u.role] ?? 0) + 1;
      const derniere = comptes.map((u) => u.lastLoginAt).filter((x): x is Date => x != null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      const modelesPresents = MODELES.filter((m) => fs.existsSync(path.join(process.cwd(), "templates", `${m}_${d.code}.docx`)));
      const modelesManquants = MODELES.filter((m) => !modelesPresents.includes(m));

      const manques: string[] = [];
      if (arrondissements.length === 0) manques.push("aucun arrondissement");
      if (!parRole.DD) manques.push("pas de compte de DD");
      if (modelesManquants.length) manques.push("modèles Word du mensuel manquants");

      return {
        id: d.id,
        code: d.code,
        nom: d.nom,
        nomAvecArticle: composerIdentite(d).nomAvecArticle,
        actif: d.actif,
        estLeMien: d.id === monDepartementId,
        arrondissements: arrondissements.map((a) => a.nom),
        comptes: {
          total: comptes.length,
          actifs: comptes.filter((u) => u.actif).length,
          jamaisConnectes: comptes.filter((u) => !u.lastLoginAt).length,
          parRole,
        },
        derniereConnexion: derniere?.toISOString() ?? null,
        modelesPresents,
        modelesManquants,
        derniereActivite: derniereAction?.createdAt.toISOString() ?? null,
        dernierePurge: await dernierePurge(c, d.code),
        manques,
      };
    })
  );
}

/** Allume ou éteint un département. Le sien ne s'éteint pas : l'administrateur s'enfermerait dehors. */
export async function basculerDepartement(departementId: string, actif: boolean, monDepartementId: string | null) {
  const d = await departementVise(departementId);
  if (!actif && d.id === monDepartementId) {
    throw new ErreurAdministration("Votre propre département ne peut pas être éteint : vous perdriez l'accès au SID.");
  }
  if (actif) {
    const [etat] = (await etatDesDepartements(monDepartementId)).filter((e) => e.id === d.id);
    if (etat.manques.length) {
      throw new ErreurAdministration(`Le département ${etat.nomAvecArticle} n'est pas prêt : ${etat.manques.join(", ")}.`);
    }
  }
  await db.departement.update({ where: { id: d.id }, data: { actif } });
  return d;
}

// ---------------------------------------------------------------------------
// Les identifiants à remettre
// ---------------------------------------------------------------------------

export interface Identifiant {
  fonction: string;
  nom: string;
  username: string;
  motDePasse: string;
}

/**
 * Donne le mot de passe provisoire du département (« BTOS123 », simple à
 * dicter — décision du Délégué, 15 octobre 2026) aux comptes qui ne se sont
 * JAMAIS connectés, et les autorise. Chacun le remplace à sa première
 * connexion. Un compte déjà utilisé n'est jamais touché : son titulaire a
 * choisi son mot de passe, et le lui reprendre se fait compte par compte.
 */
export async function genererIdentifiants(departementId: string, ids?: string[]): Promise<Identifiant[]> {
  const d = await departementVise(departementId);
  return transactionCloisonnee(db, d.id, async (tx) => {
    const comptes = await tx.user.findMany({
      where: { lastLoginAt: null, role: { not: "ADMIN_TECH" }, ...(ids?.length ? { id: { in: ids } } : {}) },
      include: { arrondissement: { select: { nom: true, ordre: true } } },
    });
    // Le DD d'abord, puis les arrondissements dans l'ordre du canevas.
    comptes.sort((a, b) => (a.role === "DD" ? -1 : b.role === "DD" ? 1 : 0) || (a.arrondissement?.ordre ?? 99) - (b.arrondissement?.ordre ?? 99) || a.username.localeCompare(b.username));

    const motDePasse = motDePasseProvisoire(d.code);
    const sortie: Identifiant[] = [];
    for (const u of comptes) {
      await tx.user.update({
        where: { id: u.id },
        data: { passwordHash: await bcrypt.hash(motDePasse, 10), mustChangePassword: true, actif: true },
      });
      sortie.push({ fonction: fonctionDe(u.role, d, u.arrondissement?.nom ?? null), nom: u.nom, username: u.username, motDePasse });
    }
    return sortie;
  });
}

// ---------------------------------------------------------------------------
// Les mots de passe de tous les comptes (demande du Délégué, 27 octobre 2026)
// ---------------------------------------------------------------------------

/** L'ordre d'affichage des fonctions : le DD, les DA, les agents, puis les chefs. */
const ORDRE_ROLE: Role[] = ["DD", "DA", "AGENT_SAISIE", "CHEF_BAC", "CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"];

export interface CompteAdministre {
  id: string;
  nom: string;
  username: string;
  role: Role;
  fonction: string;
  actif: boolean;
  jamaisConnecte: boolean;
  /** Mot de passe provisoire pas encore remplacé par son titulaire. */
  doitChanger: boolean;
  derniereConnexion: string | null;
  /** Le compte de l'administrateur : il ne se réinitialise pas d'ici. */
  estMoi: boolean;
}

/**
 * Les comptes d'un département, lus dans SON cloisonnement. Le compte
 * technique (ADMIN_TECH) n'y figure pas : il ne relève pas du métier.
 */
export async function comptesDuDepartement(departementId: string, monId: string) {
  const d = await departementVise(departementId);
  const c = clientCloisonne(db, d.id);
  const users = await c.user.findMany({
    where: { role: { not: "ADMIN_TECH" } },
    include: { arrondissement: { select: { nom: true, ordre: true } } },
  });
  users.sort(
    (a, b) =>
      ORDRE_ROLE.indexOf(a.role) - ORDRE_ROLE.indexOf(b.role) ||
      (a.arrondissement?.ordre ?? 99) - (b.arrondissement?.ordre ?? 99) ||
      a.username.localeCompare(b.username)
  );
  const comptes: CompteAdministre[] = users.map((u) => ({
    id: u.id,
    nom: u.nom,
    username: u.username,
    role: u.role,
    fonction: fonctionDe(u.role, d, u.arrondissement?.nom ?? null),
    actif: u.actif,
    jamaisConnecte: !u.lastLoginAt,
    doitChanger: u.mustChangePassword,
    derniereConnexion: u.lastLoginAt?.toISOString() ?? null,
    estMoi: u.id === monId,
  }));
  return { departement: { id: d.id, code: d.code, nom: d.nom, nomAvecArticle: composerIdentite(d).nomAvecArticle, actif: d.actif }, motDePasse: motDePasseProvisoire(d.code), comptes };
}

/**
 * Remet le mot de passe provisoire du département (« BTOS123 ») sur les comptes
 * choisis, ou sur tous ses comptes actifs ; chacun devra le changer à sa
 * prochaine connexion. Contrairement aux fiches d'identifiants, cela vaut AUSSI
 * pour un compte déjà utilisé : c'est le remède au mot de passe oublié.
 *
 * Jamais le compte de l'administrateur lui-même (il s'enfermerait dehors), ni le
 * compte technique. Un compte désactivé le reste : on ne rallume rien d'ici.
 */
export async function reinitialiserMotsDePasse(departementId: string, cible: { ids: string[] } | { tous: true }, monId: string) {
  const d = await departementVise(departementId);
  if ("ids" in cible && cible.ids.length === 0) throw new ErreurAdministration("Aucun compte choisi.");
  const motDePasse = motDePasseProvisoire(d.code);
  const passwordHash = await bcrypt.hash(motDePasse, 10);
  const comptes = await transactionCloisonnee(db, d.id, async (tx) => {
    const vises = await tx.user.findMany({
      where: { AND: [{ role: { not: "ADMIN_TECH" } }, { id: { not: monId } }, "ids" in cible ? { id: { in: cible.ids } } : { actif: true }] },
      select: { id: true, username: true, actif: true },
    });
    if (vises.length === 0) throw new ErreurAdministration("Aucun compte à réinitialiser.");
    await tx.user.updateMany({ where: { id: { in: vises.map((u) => u.id) } }, data: { passwordHash, mustChangePassword: true } });
    return vises.sort((a, b) => a.username.localeCompare(b.username));
  });
  return {
    departement: d,
    motDePasse,
    comptes: comptes.map((u) => u.username),
    /** Réinitialisés mais toujours fermés : il faut encore les ouvrir (fiches d'identifiants). */
    desactives: comptes.filter((u) => !u.actif).map((u) => u.username),
  };
}

/**
 * Rouvre un compte désactivé, dans n'importe quel département (demande du
 * Délégué, 27 octobre 2026 : un DD avait désactivé son propre compte et
 * personne ne pouvait le rouvrir). Le mot de passe n'est pas touché : la
 * personne se reconnecte avec le sien ; s'il est oublié, « Réinitialiser ».
 */
export async function reactiverCompte(departementId: string, compteId: unknown, monId: string) {
  const d = await departementVise(departementId);
  if (typeof compteId !== "string" || !compteId) throw new ErreurAdministration("Aucun compte choisi.");
  const compte = await transactionCloisonnee(db, d.id, async (tx) => {
    const u = await tx.user.findFirst({ where: { id: compteId, role: { not: "ADMIN_TECH" } }, select: { id: true, username: true, actif: true } });
    if (!u) throw new ErreurAdministration("Compte introuvable dans ce département.");
    if (u.id === monId) throw new ErreurAdministration("C'est votre propre compte.");
    if (u.actif) throw new ErreurAdministration(`${u.username} est déjà actif.`);
    await tx.user.update({ where: { id: u.id }, data: { actif: true } });
    return u.username;
  });
  return { departement: d, compte };
}

// ---------------------------------------------------------------------------
// Les données d'essai
// ---------------------------------------------------------------------------

export interface DonneesEssai {
  saisies: number;
  rapports: number;
  validations: number;
  syntheses: number;
  corrections: number;
  exports: number;
  notifications: number;
  trimestre: number;
}

export async function compterDonnees(departementId: string): Promise<DonneesEssai> {
  const c = clientCloisonne(db, departementId);
  const [m, n, e, rapports, validations, syntheses, corrections, exports, notifications, canevas, analyses, circuits, rubriques] = await Promise.all([
    c.saisieMatrice.count(),
    c.saisieNominative.count(),
    c.saisieEvenement.count(),
    c.rapportArrondissement.count(),
    c.validationSection.count(),
    c.syntheseSection.count(),
    c.correction.count(),
    c.exportDocument.count(),
    c.notification.count(),
    c.saisieCanevas.count(),
    c.analyseCanevas.count(),
    c.circuitTrimestre.count(),
    c.rubriqueNarrative.count(),
  ]);
  return { saisies: m + n + e, rapports, validations, syntheses, corrections, exports, notifications, trimestre: canevas + analyses + circuits + rubriques };
}

/**
 * Purge les données d'essai d'UN département : saisies du mois et du
 * trimestre, rapports, validations, synthèses, corrections, documents,
 * notifications. Jamais les comptes, arrondissements, établissements,
 * tableaux ni listes de référence.
 *
 * Le marqueur posé ensuite porte le code du département : seuls SES
 * téléphones vident leurs brouillons (voir lib/marqueurPurge.ts).
 */
export async function purgerDonnees(departementId: string, auteurId: string): Promise<DonneesEssai> {
  const d = await departementVise(departementId);
  const avant = await compterDonnees(d.id);
  await transactionCloisonnee(db, d.id, async (tx) => {
    await tx.correction.deleteMany({});
    await tx.syntheseSection.deleteMany({});
    await tx.validationSection.deleteMany({});
    await tx.exportDocument.deleteMany({});
    await tx.notification.deleteMany({});
    await tx.saisieMatrice.deleteMany({});
    await tx.saisieNominative.deleteMany({});
    await tx.saisieEvenement.deleteMany({});
    await tx.rapportArrondissement.deleteMany({});
    await tx.saisieCanevas.deleteMany({});
    await tx.analyseCanevas.deleteMany({});
    await tx.circuitTrimestre.deleteMany({});
    await tx.rubriqueNarrative.deleteMany({});
  });
  const cle = cleMarqueurPurge(d.code);
  const purgeLe = new Date().toISOString();
  await db.configSysteme.upsert({
    where: { cle },
    create: { cle, valeur: purgeLe, modifieParId: auteurId },
    update: { valeur: purgeLe, modifieParId: auteurId },
  });
  return avant;
}

/** Les jeux de démonstration sont tous suffixés « (DÉMO) » par prisma/seed-demo.ts. */
const FILTRE_DEMO = {
  OR: [
    { nom: { contains: "DÉMO", mode: "insensitive" as const } },
    { nom: { contains: "DEMO", mode: "insensitive" as const } },
  ],
};

export async function etablissementsDemo(departementId: string) {
  const c = clientCloisonne(db, departementId);
  const etablissements = await c.etablissement.findMany({
    where: FILTRE_DEMO,
    include: { arrondissement: { select: { nom: true } } },
    orderBy: [{ typeCode: "asc" }, { nom: "asc" }],
  });
  const ids = etablissements.map((e) => e.id);
  const saisiesLiees = ids.length ? await c.saisieNominative.count({ where: { etablissementId: { in: ids } } }) : 0;
  return {
    total: etablissements.length,
    saisiesLiees,
    etablissements: etablissements.map((e) => ({ id: e.id, nom: e.nom, typeCode: e.typeCode, arrondissement: e.arrondissement.nom })),
  };
}

export async function supprimerEtablissementsDemo(departementId: string) {
  const d = await departementVise(departementId);
  const { etablissements, saisiesLiees } = await etablissementsDemo(d.id);
  const ids = etablissements.map((e) => e.id);
  if (ids.length) {
    await transactionCloisonnee(db, d.id, async (tx) => {
      await tx.correction.deleteMany({ where: { saisieNominative: { etablissementId: { in: ids } } } });
      await tx.saisieNominative.deleteMany({ where: { etablissementId: { in: ids } } });
      await tx.etablissement.deleteMany({ where: { id: { in: ids } } });
    });
  }
  return { supprimes: ids.length, saisiesSupprimees: saisiesLiees, noms: etablissements.map((e) => e.nom) };
}

// ---------------------------------------------------------------------------
// Le journal de l'administration
// ---------------------------------------------------------------------------

export const ACTIONS_ADMINISTRATION = [
  "ACTIVATION_DEPARTEMENT",
  "EXTINCTION_DEPARTEMENT",
  "IDENTIFIANTS_GENERES",
  "MOTS_DE_PASSE_REINITIALISES",
  "COMPTE_REACTIVE",
  "PURGE_DONNEES_TEST",
  "SUPPRESSION_ETABLISSEMENTS_DEMO",
  "VALIDATION_REFERENTIEL",
  "REJET_REFERENTIEL",
  "TEXTE_DEPARTEMENT",
  "DEMONSTRATION_REINITIALISEE",
] as const;

/** Trace une action dans le journal de l'administrateur, avec le département visé. */
export async function tracer(
  dbAdmin: PrismaClient,
  auteurId: string,
  action: (typeof ACTIONS_ADMINISTRATION)[number],
  departement: { id: string; code: string; nom: string } | null,
  details: Record<string, unknown> = {}
) {
  await dbAdmin.auditLog.create({
    data: {
      userId: auteurId,
      action,
      entite: departement ? "Departement" : "Systeme",
      entiteId: departement?.id ?? "systeme",
      details: { ...(departement ? { departement: departement.nom, code: departement.code } : {}), ...details } as never,
    },
  });
}

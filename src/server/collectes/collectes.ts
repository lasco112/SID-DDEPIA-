/**
 * LES COLLECTES PONCTUELLES (demande du Délégué, 21 octobre 2026 : « mettre la
 * collecte des données sur les marchés comme activité prioritaire pour
 * demain » — et d'autres petites collectes à l'avenir).
 *
 * Le DD lance une collecte : un questionnaire du registre (marchés, abattoirs,
 * étangs…), des arrondissements, des rôles (agents, DA), deux dates. Ceux qui
 * collectent la voient en tête de leur accueil et reçoivent une notification,
 * puis un rappel chaque matin. Le DD suit l'avancement, relance, clôture.
 *
 * Ce qui est collecté va au REGISTRE des établissements, comme d'habitude : la
 * collecte n'est qu'un cadre et un compteur. L'avancement se lit dans le
 * journal d'activité — chaque fiche ajoutée, complétée ou photographiée
 * pendant la collecte compte, avec son auteur.
 *
 * Rien ici ne touche aux rapports mensuel et trimestriel.
 */
import type { PrismaClient } from "@prisma/client";
import { CODES_ACTEURS, TYPES_ACTEURS } from "@/lib/acteurs";
import { dateAuCameroun, type FicheMarche } from "@/lib/marches";
import { listerArrondissements } from "@/lib/arrondissements";
import { notifierEvenement } from "@/server/notifications/evenements";

export const ROLES_COLLECTEURS = ["DA", "AGENT_SAISIE"] as const;
export const LIBELLES_ROLES: Record<string, string> = { DA: "Délégués d'arrondissement", AGENT_SAISIE: "Agents de saisie" };

/** Les questionnaires disponibles : les types du registre, les marchés en tête. */
export const QUESTIONNAIRES = [...TYPES_ACTEURS]
  .sort((a, b) => Number(b.code === "ETAB_MARCHE") - Number(a.code === "ETAB_MARCHE"))
  .map((t) => ({ code: t.code, libelle: t.pluriel }));

/** Les actions du journal qui comptent comme une fiche faite. */
const ACTIONS_FICHE = ["CREATION_ETABLISSEMENT", "MODIFICATION_ETABLISSEMENT", "PHOTO_ETABLISSEMENT"];

export interface Collecte {
  id: string;
  titre: string;
  consigne: string | null;
  typeCode: string;
  arrondissementIds: string[];
  roles: string[];
  debut: string;
  fin: string;
  prioritaire: boolean;
  clotureeLe: Date | null;
  createdAt: Date;
}

export type EtatCollecte = "a_venir" | "en_cours" | "terminee";

export function etatDe(c: Pick<Collecte, "debut" | "fin" | "clotureeLe">, aujourdhui: string = dateAuCameroun()): EtatCollecte {
  if (c.clotureeLe || aujourdhui > c.fin) return "terminee";
  return aujourdhui < c.debut ? "a_venir" : "en_cours";
}

/** Où mène le bouton « Commencer » : le registre, sur ce questionnaire, prêt à ajouter. */
export const lienDe = (c: Pick<Collecte, "id" | "typeCode">) => `/etablissements?type=${c.typeCode}&collecte=${c.id}`;

/** « mercredi 21 octobre ». */
export const jourEnClair = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

export function periodeEnClair(c: Pick<Collecte, "debut" | "fin">): string {
  return c.debut === c.fin ? `le ${jourEnClair(c.debut)}` : `du ${jourEnClair(c.debut)} au ${jourEnClair(c.fin)}`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateValide = (d: unknown): d is string => typeof d === "string" && DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`));

/** Contrôle ce que le DD envoie pour lancer une collecte. */
export function nettoyerCollecte(
  body: Record<string, unknown>,
  arrondissementsDuDepartement: string[],
  aujourdhui: string = dateAuCameroun()
): { erreur: string } | { data: Omit<Collecte, "id" | "clotureeLe" | "createdAt"> } {
  const titre = typeof body.titre === "string" ? body.titre.trim() : "";
  if (titre.length < 3) return { erreur: "Donnez un titre à la collecte (ex. : Recensement des marchés)." };
  if (titre.length > 120) return { erreur: "Le titre est trop long (120 caractères au plus)." };
  const consigne = typeof body.consigne === "string" && body.consigne.trim() ? body.consigne.trim().slice(0, 600) : null;
  const typeCode = typeof body.typeCode === "string" ? body.typeCode : "";
  if (!CODES_ACTEURS.includes(typeCode)) return { erreur: "Choisissez le questionnaire de la collecte." };
  const arrondissementIds = Array.isArray(body.arrondissementIds) ? Array.from(new Set(body.arrondissementIds.map(String))) : [];
  if (arrondissementIds.some((a) => !arrondissementsDuDepartement.includes(a))) return { erreur: "Un arrondissement choisi n'est pas de votre département." };
  const roles = Array.isArray(body.roles) ? Array.from(new Set(body.roles.map(String))) : [];
  if (!roles.length || roles.some((r) => !(ROLES_COLLECTEURS as readonly string[]).includes(r))) return { erreur: "Choisissez qui collecte : les agents, les DA, ou les deux." };
  if (!dateValide(body.debut) || !dateValide(body.fin)) return { erreur: "Indiquez le premier et le dernier jour de la collecte." };
  if (body.debut > body.fin) return { erreur: "Le dernier jour doit venir après le premier." };
  if (body.fin < aujourdhui) return { erreur: "Le dernier jour est déjà passé." };
  const duree = (Date.parse(`${body.fin}T00:00:00Z`) - Date.parse(`${body.debut}T00:00:00Z`)) / 86_400_000;
  if (duree > 92) return { erreur: "Une collecte ponctuelle dure trois mois au plus." };
  return {
    data: {
      titre,
      consigne,
      typeCode,
      // Tous les arrondissements choisis : on garde la liste vide, qui veut dire « tous ».
      arrondissementIds: arrondissementIds.length === arrondissementsDuDepartement.length ? [] : arrondissementIds,
      roles,
      debut: body.debut,
      fin: body.fin,
      prioritaire: body.prioritaire !== false,
    },
  };
}

/** Le ressort d'une collecte : les arrondissements visés (tous si la liste est vide). */
async function arrondissementsDe(db: PrismaClient, c: Pick<Collecte, "arrondissementIds">) {
  const tous = await listerArrondissements(db);
  return c.arrondissementIds.length ? tous.filter((a) => c.arrondissementIds.includes(a.id)) : tous;
}

/** Ceux qui collectent : comptes actifs, du bon rôle, dans un arrondissement visé. */
async function destinataires(db: PrismaClient, c: Pick<Collecte, "arrondissementIds" | "roles">, seulement?: string[]) {
  const arrs = (await arrondissementsDe(db, c)).map((a) => a.id).filter((id) => !seulement || seulement.includes(id));
  const users = await db.user.findMany({
    where: { actif: true, role: { in: c.roles as never[] }, arrondissementId: { in: arrs } },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

const cleRappel = (id: string, jour: string) => `collecte_rappel_${id}_${jour}`;

/** Lance une collecte et prévient ceux qui collectent. */
export async function lancerCollecte(db: PrismaClient, data: Omit<Collecte, "id" | "clotureeLe" | "createdAt">, auteurId: string) {
  const c = (await db.collecteCampagne.create({ data: { ...data, creeParId: auteurId } })) as Collecte;
  const aujourdhui = dateAuCameroun();
  const ids = await destinataires(db, c);
  const message = `${c.prioritaire ? "Activité prioritaire" : "Nouvelle collecte"} : ${c.titre}, ${periodeEnClair(c)}.${c.consigne ? ` ${c.consigne}` : ""}`;
  const notifies = await notifierEvenement(db, { userIds: ids }, { declencheur: "COLLECTE", message, lien: lienDe(c) });
  // Elle commence aujourd'hui : la notification tient lieu de rappel du matin.
  if (c.debut <= aujourdhui) {
    await db.configSysteme.upsert({ where: { cle: cleRappel(c.id, aujourdhui) }, update: {}, create: { cle: cleRappel(c.id, aujourdhui), valeur: `lancement — ${notifies}` } });
  }
  return { collecte: c, notifies };
}

/** Relance ceux qui collectent — seulement les arrondissements sans aucune fiche, si `retardataires`. */
export async function relancerCollecte(db: PrismaClient, c: Collecte, retardataires: boolean) {
  let seulement: string[] | undefined;
  if (retardataires) {
    const a = await avancement(db, c);
    seulement = a.lignes.filter((l) => l.fiches === 0).map((l) => l.arrondissementId);
    if (!seulement.length) return 0;
  }
  const ids = await destinataires(db, c, seulement);
  return notifierEvenement(db, { userIds: ids }, {
    declencheur: "COLLECTE",
    message: `Rappel du DD — ${c.titre}, ${periodeEnClair(c)} : ${retardataires ? "votre arrondissement n'a encore envoyé aucune fiche." : "pensez à envoyer vos fiches."}`,
    lien: lienDe(c),
  });
}

export interface LigneAvancement {
  arrondissementId: string;
  nom: string;
  /** Fiches ajoutées, complétées ou photographiées pendant la collecte. */
  fiches: number;
  /** Parmi elles : complètes (pour un marché : organisation, jours et position). */
  completes: number;
  avecGps: number;
  avecPhoto: number;
  /** Au registre en tout, pour ce questionnaire (actifs). */
  auRegistre: number;
  auteurs: string[];
  derniere: string | null;
  /** Les fiches, pour le détail. */
  details: { id: string; nom: string; complete: boolean; gps: boolean; photo: boolean }[];
}

/** Les bornes de la collecte, en instants : du premier jour 00h00 au dernier jour 23h59, heure du Cameroun. */
const bornes = (c: Pick<Collecte, "debut" | "fin" | "clotureeLe">) => {
  const fin = new Date(`${c.fin}T23:59:59.999+01:00`);
  return { gte: new Date(`${c.debut}T00:00:00+01:00`), lte: c.clotureeLe && c.clotureeLe < fin ? c.clotureeLe : fin };
};

function estComplete(typeCode: string, e: { latitude: number | null; fiche: unknown }): boolean {
  if (typeCode !== "ETAB_MARCHE") return e.latitude != null;
  const f = (e.fiche as FicheMarche | null) ?? {};
  return Boolean((f.organisation || f.typeMarche) && f.rythme && e.latitude != null);
}

/** L'avancement d'une collecte, arrondissement par arrondissement. */
export async function avancement(db: PrismaClient, c: Collecte, seulementArrondissement?: string) {
  const arrs = (await arrondissementsDe(db, c)).filter((a) => !seulementArrondissement || a.id === seulementArrondissement);
  const journal = await db.auditLog.findMany({
    where: { entite: "Etablissement", action: { in: ACTIONS_FICHE }, createdAt: bornes(c) },
    select: { entiteId: true, userId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const ids = Array.from(new Set(journal.map((j) => j.entiteId).filter((x): x is string => Boolean(x))));
  const [fiches, registre] = await Promise.all([
    db.etablissement.findMany({
      where: { id: { in: ids }, typeCode: c.typeCode, arrondissementId: { in: arrs.map((a) => a.id) } },
      select: { id: true, nom: true, arrondissementId: true, latitude: true, fiche: true, photo: { select: { prisLe: true } } },
    }),
    db.etablissement.groupBy({ by: ["arrondissementId"], where: { typeCode: c.typeCode, actif: true, arrondissementId: { in: arrs.map((a) => a.id) } }, _count: true }),
  ]);
  const parId = new Map(fiches.map((f) => [f.id, f] as const));
  const userIds = Array.from(new Set(journal.filter((j) => j.entiteId && parId.has(j.entiteId) && j.userId).map((j) => j.userId!)));
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nom: true, username: true } });
  const nomDe = new Map(users.map((u) => [u.id, u.nom?.trim() || u.username] as const));

  const lignes: LigneAvancement[] = arrs.map((a) => {
    const ici = fiches.filter((f) => f.arrondissementId === a.id);
    const idsIci = new Set(ici.map((f) => f.id));
    const traces = journal.filter((j) => j.entiteId && idsIci.has(j.entiteId));
    return {
      arrondissementId: a.id,
      nom: a.nom,
      fiches: ici.length,
      completes: ici.filter((f) => estComplete(c.typeCode, f)).length,
      avecGps: ici.filter((f) => f.latitude != null).length,
      avecPhoto: ici.filter((f) => f.photo).length,
      auRegistre: registre.find((r) => r.arrondissementId === a.id)?._count ?? 0,
      auteurs: Array.from(new Set(traces.map((t) => (t.userId ? nomDe.get(t.userId) : null)).filter((x): x is string => Boolean(x)))),
      derniere: traces.length ? traces[traces.length - 1].createdAt.toISOString() : null,
      details: ici.map((f) => ({ id: f.id, nom: f.nom, complete: estComplete(c.typeCode, f), gps: f.latitude != null, photo: Boolean(f.photo) })),
    };
  });
  return {
    lignes,
    total: { fiches: lignes.reduce((s, l) => s + l.fiches, 0), completes: lignes.reduce((s, l) => s + l.completes, 0), arrondissementsActifs: lignes.filter((l) => l.fiches > 0).length },
  };
}

/** Les collectes en cours pour ce profil (un DA, un agent) : celles qui le visent aujourd'hui. */
export async function collectesPour(db: PrismaClient, profil: { role: string; arrondissementId: string | null }, aujourdhui: string = dateAuCameroun()) {
  if (!profil.arrondissementId || !(ROLES_COLLECTEURS as readonly string[]).includes(profil.role)) return [];
  const liste = (await db.collecteCampagne.findMany({
    where: { clotureeLe: null, debut: { lte: aujourdhui }, fin: { gte: aujourdhui }, roles: { has: profil.role } },
    orderBy: [{ prioritaire: "desc" }, { fin: "asc" }],
  })) as Collecte[];
  return liste.filter((c) => !c.arrondissementIds.length || c.arrondissementIds.includes(profil.arrondissementId!));
}

/**
 * Le rappel du matin, chaque jour de la collecte, à partir de 7 h (heure du
 * Cameroun) — une seule fois par jour et par collecte, grâce à un marqueur.
 * Appelé par le planificateur horaire, département par département.
 */
export async function rappelsDuMatin(db: PrismaClient, maintenant: Date = new Date()): Promise<number> {
  const aujourdhui = dateAuCameroun(maintenant);
  // « en-GB » et non « fr-FR », qui écrit « 05 h » : Number("05 h") ne vaut rien.
  const heure = parseInt(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Douala" }).format(maintenant), 10);
  if (!(heure >= 7)) return 0;
  const enCours = (await db.collecteCampagne.findMany({ where: { clotureeLe: null, debut: { lte: aujourdhui }, fin: { gte: aujourdhui } } })) as Collecte[];
  let total = 0;
  for (const c of enCours) {
    const cle = cleRappel(c.id, aujourdhui);
    if (await db.configSysteme.findFirst({ where: { cle } })) continue;
    const dernierJour = c.fin === aujourdhui;
    const n = await notifierEvenement(db, { userIds: await destinataires(db, c) }, {
      declencheur: "COLLECTE",
      message: `${c.prioritaire ? "Activité prioritaire aujourd'hui" : "Collecte en cours"} : ${c.titre}${dernierJour ? " — dernier jour" : `, jusqu'au ${jourEnClair(c.fin)}`}.`,
      lien: lienDe(c),
    });
    await db.configSysteme.upsert({ where: { cle }, update: {}, create: { cle, valeur: `${maintenant.toISOString()} — ${n}` } });
    total += n;
  }
  return total;
}

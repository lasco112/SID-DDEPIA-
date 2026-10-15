/**
 * seed-demo.ts — Jeu de données de démonstration (correction n°10, §10.3)
 * ---------------------------------------------------------------------------
 * Alimente EXCLUSIVEMENT la base DEMO_DATABASE_URL — jamais DATABASE_URL
 * (vérifié explicitement ci-dessous). Ce script EST le mécanisme de
 * réinitialisation (§10.9) : il repart de zéro sur les données
 * transactionnelles à chaque exécution (comptes/rapports/saisies), en
 * gardant les mêmes comptes et le même contenu qu'au premier lancement,
 * pour que "Réinitialiser la démonstration" soit un simple ré-appel de
 * ce script.
 *
 * Structure de démonstration couvrant les 28 tableaux du canevas sur les
 * 6 arrondissements de la Menoua, période MENSUEL juillet 2026, avec des
 * scénarios délibérément variés (voir seedRapports) :
 *   Dschang       — rapport SOUMIS, données complètes
 *   Fokoué        — rapport EN_SAISIE (brouillon incomplet)
 *   Fongo-Tongo   — rapport SOUMIS, plusieurs acteurs par tableau NOMINATIF
 *                    et plusieurs foyers sanitaires le même mois
 *   Nkong-Ni      — rapport REJETE (retourné pour correction, motif renseigné)
 *   Penka-Michel  — rapport CLOTURE (validé, intégré au rapport départemental)
 *   Santchou      — rapport SOUMIS, mais AUCUN événement sanitaire déclaré
 *                    (T31/T32/T33/T35 vides ce mois-ci)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { parseDictionnaire, EVENEMENT_SCHEMAS, type ChampEvenement } from "./seed-lib/parseDictionnaire";
import { NOMINATIF_ETABLISSEMENT_TYPE } from "./seed-lib/nominatifEtablissementTypes";
import { ARRONDISSEMENTS, SECTIONS, GROUPES_REFERENTIELS } from "./seed-lib/referentielsDeBase";
import { clientCloisonne } from "../src/lib/dbCloisonne";

// Ces vérifications ne doivent JAMAIS s'exécuter au simple IMPORT de ce
// fichier : Next.js importe (donc évalue) chaque route API au build pour en
// analyser les types ("Collecting page data"), y compris /api/demo/reinitialiser
// — sur un environnement sans mode démo configuré (DEMO_DATABASE_URL absente,
// cas normal en production), un throw ici ferait échouer le build entier alors
// que rien n'a encore été appelé. Le client est donc construit paresseusement,
// au premier accès réel (voir Proxy ci-dessous) — c'est-à-dire uniquement
// quand reinitialiserDonneesDemo()/seedDemoComplet() sont vraiment invoquées.
const DEMO_URL = process.env.DEMO_DATABASE_URL;

function creerClientDemo(): PrismaClient {
  if (!DEMO_URL) {
    throw new Error("DEMO_DATABASE_URL manquant — le seed de démonstration ne doit jamais retomber sur DATABASE_URL.");
  }
  if (process.env.DATABASE_URL && DEMO_URL === process.env.DATABASE_URL) {
    throw new Error("DEMO_DATABASE_URL est identique à DATABASE_URL : refus de seeder — ces deux bases doivent rester distinctes.");
  }
  return new PrismaClient({ datasources: { db: { url: DEMO_URL } } });
}

/**
 * Le département de départ de la démonstration : la Menoua fictive. Depuis le
 * 15 octobre 2026 (demande du Délégué), CHAQUE département de l'Ouest a aussi
 * sa démonstration, avec ses arrondissements et ses comptes : on y choisit son
 * département, puis sa fonction, puis son arrondissement.
 */
const CODE_DEPARTEMENT_DEMO = "MEN";

/** Le client brut de la base de démonstration : il ne sert qu'à se placer dans un département. */
let brutDemo: PrismaClient | null = null;
function clientBrut(): PrismaClient {
  if (!brutDemo) brutDemo = creerClientDemo();
  return brutDemo;
}

let clientDemo: PrismaClient | null = null;
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    // Jamais de client brut : la base de démonstration porte les mêmes politiques
    // par ligne, et un client qui ne déclare aucun département y voit refuser
    // chacune de ses insertions. C'est ce qui cassait « Réinitialiser » depuis
    // le cloisonnement. Le client est préparé par clientDeLaDemo().
    if (!clientDemo) throw new Error("Client de démonstration non préparé : appeler clientDeLaDemo() d'abord.");
    return (clientDemo as any)[prop];
  },
});

/**
 * Le client de démonstration, cloisonné sur la Menoua — nommée par son CODE :
 * « le premier département par ordre alphabétique » est devenu les Bamboutos
 * le jour où les autres départements de l'Ouest ont été préparés.
 */
async function clientDeLaDemo(): Promise<PrismaClient> {
  if (clientDemo) return clientDemo;
  await entrerDans(CODE_DEPARTEMENT_DEMO);
  return clientDemo!;
}

/** Place le semis dans un département : toutes les écritures qui suivent lui appartiennent. */
async function entrerDans(code: string) {
  const departement = await clientBrut().departement.findUnique({ where: { code } });
  if (!departement) {
    throw new Error(`Département « ${code} » absent de la base de démonstration : appliquer les migrations avant le semis.`);
  }
  clientDemo = clientCloisonne(clientBrut(), departement.id);
  return departement;
}

/** « demo » pour la Menoua (ses comptes d'origine), « demo.bam » pour les Bamboutos. */
function prefixeComptes(code: string): string {
  return code === CODE_DEPARTEMENT_DEMO ? "demo" : `demo.${code.toLowerCase()}`;
}

/** « Fongo-Tongo » → « fongotongo » : la partie d'identifiant d'un arrondissement. */
function slugArrondissement(nom: string): string {
  return nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const MOT_DE_PASSE_DEMO = "Demo!2026";

function slugUnite(raw: string): { code: string; libelle: string } {
  const slug = raw
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return { code: `UNITE_${slug}`, libelle: raw.trim() };
}

/** RNG déterministe (mulberry32 sur un hash de chaîne) : mêmes valeurs à chaque exécution du seed,
 *  pour que "Réinitialiser la démonstration" restaure un jeu de données identique. */
function seededRng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function valeurAleatoire(rng: () => number, typeValeur: string, libelle: string): number {
  const r = rng();
  if (/prix moyen/i.test(libelle)) return Math.round(500 + r * 4500) * 10; // FCFA
  if (typeValeur === "DECIMAL") return Math.round(r * 400 * 100) / 100;
  return Math.round(r * 250);
}

async function seedTerritoireEtSections() {
  for (const a of ARRONDISSEMENTS) await prisma.arrondissement.upsert({ where: { code: a.code }, update: {}, create: a });
  for (const s of SECTIONS) await prisma.section.upsert({ where: { code: s.code }, update: {}, create: s });
}

async function seedReferentiels() {
  for (const g of GROUPES_REFERENTIELS) {
    for (let i = 0; i < g.items.length; i++) {
      const [code, libelle] = g.items[i];
      await prisma.referentielItem.upsert({
        where: { categorie_code: { categorie: g.categorie as any, code } },
        update: {},
        create: { categorie: g.categorie as any, code, libelle, ordre: i },
      });
    }
  }
}

async function seedFormulaires() {
  const tableaux = parseDictionnaire();
  const sections = await prisma.section.findMany();
  const sectionIdByCode = new Map(sections.map((s) => [s.code, s.id]));
  const unitesVues = new Map<string, string>();

  for (const t of tableaux) {
    const sectionId = sectionIdByCode.get(t.sectionCode);
    if (!sectionId) throw new Error(`Section inconnue "${t.sectionCode}" pour ${t.templateCode}`);

    const isEvenement = t.famille === "EVENEMENT";
    const schemaEvenement = isEvenement ? EVENEMENT_SCHEMAS[t.champs[0]?.code ?? ""] : undefined;

    const template = await prisma.formTemplate.upsert({
      where: { code: t.templateCode },
      update: { numero: t.numero, titre: t.titre, type: t.famille, sectionId, ordre: t.ordre, schemaEvenement: schemaEvenement ? (schemaEvenement as any) : undefined },
      create: { code: t.templateCode, numero: t.numero, titre: t.titre, type: t.famille, sectionId, ordre: t.ordre, schemaEvenement: schemaEvenement ? (schemaEvenement as any) : undefined },
    });

    if (isEvenement) continue;

    for (const champ of t.champs) {
      const { code: uniteCode, libelle: uniteLibelle } = slugUnite(champ.unite);
      unitesVues.set(uniteCode, uniteLibelle);
      await prisma.formField.upsert({
        where: { code: champ.code },
        update: { templateId: template.id, libelle: champ.libelle, uniteCode, typeValeur: champ.typeValeur, ordre: champ.ordre, actif: true, disabledAt: null },
        create: { templateId: template.id, code: champ.code, libelle: champ.libelle, uniteCode, typeValeur: champ.typeValeur, ordre: champ.ordre },
      });
    }
  }

  const unitesArr = Array.from(unitesVues.entries());
  for (let i = 0; i < unitesArr.length; i++) {
    const [code, libelle] = unitesArr[i];
    await prisma.referentielItem.upsert({ where: { categorie_code: { categorie: "UNITE", code } }, update: {}, create: { categorie: "UNITE", code, libelle, ordre: i } });
  }
  console.log(`Formulaires : ${tableaux.length} tableaux.`);
}

let empreinteDemo: string | null = null;

/**
 * Comptes de démonstration d'UN département — identifiants et rôles distincts
 * des comptes réels (§10.4) : son DD, ses quatre chefs de section, et pour
 * CHAQUE arrondissement son DA et son agent de saisie / chef de CZV (demande
 * du Délégué, 15 octobre 2026 : on choisit jusqu'à son arrondissement).
 *
 * La Menoua garde ses identifiants d'origine (demo.dd, demo.da.dschang…) ;
 * les autres départements sont préfixés de leur code (demo.bam.da.mbouda).
 */
async function seedComptesDemo(departement: { code: string; nom: string; nomAvecArticle: string | null }) {
  empreinteDemo ??= await bcrypt.hash(MOT_DE_PASSE_DEMO, 10);
  const passwordHash = empreinteDemo;
  const arrondissements = await prisma.arrondissement.findMany({ orderBy: { ordre: "asc" } });
  const sections = await prisma.section.findMany();
  const secByCode = new Map(sections.map((s) => [s.code, s]));
  const p = prefixeComptes(departement.code);
  const article = departement.nomAvecArticle?.trim() || `de ${departement.nom}`;

  const comptes: Array<{ username: string; nom: string; role: string; arrondissementId?: string; sectionCode?: string }> = [
    { username: `${p}.dd`, nom: `Démo — Délégué départemental ${article}`, role: "DD" },
    { username: `${p}.chef.bac`, nom: `Démo — Chef BAC ${article}`, role: "CHEF_BAC", sectionCode: "BAC" },
    { username: `${p}.chef.psa`, nom: `Démo — Chef PSA ${article}`, role: "CHEF_PSA", sectionCode: "PSA" },
    { username: `${p}.chef.ssv`, nom: `Démo — Chef SSV ${article}`, role: "CHEF_SSV", sectionCode: "SSV" },
    { username: `${p}.chef.spaih`, nom: `Démo — Chef SPAIH ${article}`, role: "CHEF_SPAIH", sectionCode: "SPAIH" },
  ];
  if (departement.code === CODE_DEPARTEMENT_DEMO) {
    comptes.push({ username: "demo.admin", nom: "Démo — Administrateur", role: "ADMIN_TECH" });
  }
  for (const a of arrondissements) {
    const s = slugArrondissement(a.nom);
    comptes.push(
      { username: `${p}.da.${s}`, nom: `Démo — DA ${a.nom}`, role: "DA", arrondissementId: a.id },
      { username: `${p}.agent.${s}`, nom: `Démo — Agent de saisie ${a.nom}`, role: "AGENT_SAISIE", arrondissementId: a.id }
    );
  }

  for (const c of comptes) {
    const data: any = {
      username: c.username,
      nom: c.nom,
      passwordHash,
      role: c.role,
      mustChangePassword: false,
      actif: true,
      arrondissementId: c.arrondissementId ?? null,
      sectionId: c.sectionCode ? secByCode.get(c.sectionCode)?.id ?? null : null,
    };
    await prisma.user.upsert({
      where: { username: c.username },
      update: { nom: data.nom, role: data.role, arrondissementId: data.arrondissementId, sectionId: data.sectionId, mustChangePassword: false, actif: true, passwordHash },
      create: data,
    });
  }
  console.log(`${departement.code} : ${comptes.length} comptes de démonstration.`);
}

/** Établissements NOMINATIF — 2 acteurs par arrondissement et par type, sauf Fongo-Tongo (4)
 *  pour illustrer "plusieurs acteurs dans un même arrondissement" (§10.3). */
async function seedEtablissements() {
  const arrondissements = await prisma.arrondissement.findMany();
  const prefixeParType: Record<string, string> = {
    ETAB_COUVOIR: "Couvoir",
    ETAB_FERME_PONTE: "Ferme de ponte",
    ETAB_FERME_CHAIR: "Ferme de chair",
    ETAB_PROVENDERIE: "Provenderie",
  };
  const typesNominatifs = Array.from(new Set(Object.values(NOMINATIF_ETABLISSEMENT_TYPE))).map((typeCode) => ({
    typeCode,
    prefixe: prefixeParType[typeCode],
  }));

  const idsParArrTypeCode = new Map<string, string[]>();
  for (const arr of arrondissements) {
    const nbActeurs = arr.code === "FGT" ? 4 : 2;
    for (const type of typesNominatifs) {
      const ids: string[] = [];
      for (let n = 1; n <= nbActeurs; n++) {
        const nom = `${type.prefixe} ${arr.nom} n°${n} (DÉMO)`;
        const existing = await prisma.etablissement.findFirst({ where: { nom, arrondissementId: arr.id } });
        const etab =
          existing ??
          (await prisma.etablissement.create({
            data: { typeCode: type.typeCode, nom, localite: `${arr.nom} — quartier ${n === 1 ? "Centre" : "Marché"}`, arrondissementId: arr.id, actif: true },
          }));
        ids.push(etab.id);
      }
      idsParArrTypeCode.set(`${arr.code}:${type.typeCode}`, ids);
    }
  }
  console.log("Établissements de démonstration créés (Fongo-Tongo : 4 acteurs par tableau NOMINATIF).");
  return idsParArrTypeCode;
}

/*
 * LE CALENDRIER DE LA DÉMONSTRATION (refait le 14 octobre 2026, pour former
 * les départements qui rejoignent le SID) :
 *
 *   d'avril à septembre 2026 — clos et complets : les six arrondissements
 *     ont transmis, les quatre sections ont validé. Les 2e et 3e trimestres
 *     sont donc calculables : rapport trimestriel, circuit de validation,
 *     analyses et note de situation (qui compare le 3e au 2e) se montrent avec
 *     de vrais chiffres ;
 *   octobre 2026 — le mois en cours, avec des situations variées (voir
 *     SCENARIOS) : c'est là qu'on s'exerce à saisir, transmettre, renvoyer.
 */
const ANNEE_DEMO = 2026;
const MOIS_CLOS = [4, 5, 6, 7, 8, 9];
const MOIS_EN_COURS = 10;

async function seedPeriodes() {
  const periodes = new Map<number, { id: string }>();
  for (const mois of [...MOIS_CLOS, MOIS_EN_COURS]) {
    const clos = mois !== MOIS_EN_COURS;
    const donnees = {
      dateOuverture: new Date(ANNEE_DEMO, mois - 1, 1),
      dateLimiteDA: new Date(ANNEE_DEMO, mois - 1, 28),
      dateLimiteChef: new Date(ANNEE_DEMO, mois - 1, 29),
      dateLimiteDD: new Date(ANNEE_DEMO, mois, 2),
      statut: (clos ? "ARCHIVEE" : "OUVERTE") as "ARCHIVEE" | "OUVERTE",
    };
    const existante = await prisma.periodeReporting.findFirst({ where: { type: "MENSUEL", annee: ANNEE_DEMO, mois } });
    const p = existante
      ? await prisma.periodeReporting.update({ where: { id: existante.id }, data: donnees })
      : await prisma.periodeReporting.create({ data: { type: "MENSUEL", annee: ANNEE_DEMO, mois, ...donnees } });
    periodes.set(mois, { id: p.id });
  }
  return periodes;
}

type ScenarioArr = { code: string; statut: "EN_SAISIE" | "SOUMIS" | "REJETE" | "CLOTURE"; motifRejet?: string };
/** Le mois en cours : un arrondissement de chaque situation. */
const SCENARIOS: ScenarioArr[] = [
  { code: "DSC", statut: "SOUMIS" },
  { code: "FOK", statut: "EN_SAISIE" },
  { code: "FGT", statut: "SOUMIS" },
  { code: "NKN", statut: "REJETE", motifRejet: "Écart important sur les effectifs vaccinés par rapport au mois précédent — merci de vérifier le tableau 3.2 avant renvoi." },
  { code: "PKM", statut: "CLOTURE" },
  { code: "STC", statut: "SOUMIS" },
];

/**
 * Les autres départements reçoivent les mêmes situations, dans l'ordre de leurs
 * arrondissements : transmis, encore en saisie, renvoyé par le DD, validé…
 */
const SITUATIONS_SUIVANTES: Omit<ScenarioArr, "code">[] = [
  { statut: "SOUMIS" },
  { statut: "EN_SAISIE" },
  { statut: "REJETE", motifRejet: "Écart important sur les effectifs vaccinés par rapport au mois précédent — merci de vérifier le tableau 3.2 avant renvoi." },
  { statut: "CLOTURE" },
];

function scenarioDuMoisEnCours(codeDepartement: string, arr: { code: string }, rang: number): ScenarioArr {
  if (codeDepartement === CODE_DEPARTEMENT_DEMO) return SCENARIOS.find((x) => x.code === arr.code) ?? { code: arr.code, statut: "SOUMIS" };
  return { code: arr.code, ...SITUATIONS_SUIVANTES[rang % SITUATIONS_SUIVANTES.length] };
}

async function seedRapports(periodeId: string, mois: number, codeDepartement: string) {
  const arrondissements = await prisma.arrondissement.findMany({ orderBy: { ordre: "asc" } });
  const users = await prisma.user.findMany({ where: { role: "DA" } });
  const userByArrId = new Map(users.map((u) => [u.arrondissementId, u]));
  const enCours = mois === MOIS_EN_COURS;

  const rapportsParCode = new Map<string, { id: string; arrondissementId: string; statut: ScenarioArr["statut"] }>();
  for (let rang = 0; rang < arrondissements.length; rang++) {
    const arr = arrondissements[rang];
    const s: ScenarioArr = enCours ? scenarioDuMoisEnCours(codeDepartement, arr, rang) : { code: arr.code, statut: "CLOTURE" };
    const da = userByArrId.get(arr.id);
    const rapport = await prisma.rapportArrondissement.create({
      data: {
        periodeId,
        arrondissementId: arr.id,
        statut: s.statut,
        soumisParId: s.statut === "EN_SAISIE" ? null : da?.id ?? null,
        dateSoumission: s.statut === "EN_SAISIE" ? null : new Date(ANNEE_DEMO, mois - 1, 8 + (arr.ordre % 6) * 3),
        motifRejet: s.motifRejet ?? null,
      },
    });
    rapportsParCode.set(arr.code, { id: rapport.id, arrondissementId: arr.id, statut: s.statut });
  }
  return rapportsParCode;
}

/**
 * Une valeur qui tient d'un mois à l'autre : une base propre à l'arrondissement
 * et au champ, puis une variation de ±10 % propre au mois. Un cheptel qui
 * sauterait au hasard de 30 à 240 têtes rendrait la note de situation absurde.
 */
function valeurDuMois(arrCode: string, champ: { code: string; typeValeur: string; libelle: string }, mois: number): number {
  const base = valeurAleatoire(seededRng(`${arrCode}:${champ.code}`), champ.typeValeur, champ.libelle);
  const variation = 0.9 + seededRng(`${arrCode}:${champ.code}:${mois}`)() * 0.2;
  const v = base * variation;
  return champ.typeValeur === "DECIMAL" ? Math.round(v * 100) / 100 : Math.round(v);
}

function remplirMatrice(lot: Lot, rapportId: string, fields: { code: string; typeValeur: string; libelle: string }[], arrCode: string, mois: number, incomplet: boolean) {
  const rng = seededRng(`${arrCode}:${rapportId.slice(-6)}:${mois}`);
  const nbAFournir = incomplet ? Math.ceil(fields.length * 0.4) : fields.length;
  const lignes: any[] = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (incomplet && i >= nbAFournir) continue; // brouillon : champs pas encore saisis
    const roll = rng();
    const clientId = `demo-mat-${rapportId}-${f.code}`;
    if (f.typeValeur === "TEXTE") {
      lignes.push({ rapportId, fieldCode: f.code, valeurTexte: roll < 0.5 ? null : `${f.libelle} — ${arrCode} (démonstration)`, nonRenseigne: false, clientId });
      continue;
    }
    if (roll < 0.03) {
      lignes.push({ rapportId, fieldCode: f.code, nonRenseigne: true, motifNonRenseigne: "Donnée non disponible ce mois-ci (démonstration)", clientId });
      continue;
    }
    // Au mois en cours, un zéro réel au premier champ : 0 n'est pas « non renseigné » (§10.3).
    const valeur = i === 0 && mois === MOIS_EN_COURS ? 0 : valeurDuMois(arrCode, f, mois);
    lignes.push({ rapportId, fieldCode: f.code, valeur, nonRenseigne: false, clientId });
  }
  lot.matrice.push(...lignes);
}

function remplirNominatif(lot: Lot, rapportId: string, templateId: string, fields: { code: string; typeValeur: string; libelle: string }[], arrCode: string, mois: number, etablissementIds: string[]) {
  const lignes: any[] = [];
  for (const etabId of etablissementIds) {
    const rng = seededRng(`${arrCode}:${templateId}:${etabId}:${mois}`);
    for (const f of fields) {
      const clientId = `demo-nom-${rapportId}-${etabId}-${f.code}`;
      if (f.typeValeur === "TEXTE") {
        lignes.push({ rapportId, templateId, etablissementId: etabId, fieldCode: f.code, valeurTexte: rng() < 0.4 ? "RAS ce mois-ci (démonstration)" : null, nonRenseigne: false, clientId });
        continue;
      }
      lignes.push({ rapportId, templateId, etablissementId: etabId, fieldCode: f.code, valeur: valeurDuMois(`${arrCode}:${etabId}`, f, mois), nonRenseigne: false, clientId });
    }
  }
  lot.nominative.push(...lignes);
}

function remplirEvenements(
  lot: Lot,
  rapportId: string,
  templateId: string,
  schema: ChampEvenement[],
  arrCode: string,
  mois: number,
  count: number,
  references: Map<string, string[]>,
  forcerAutrePrecision?: { key: string; precision: string }
) {
  const rng = seededRng(`${arrCode}:${templateId}:evt:${mois}`);
  const lignes: any[] = [];
  for (let i = 0; i < count; i++) {
    const payload: Record<string, unknown> = {};
    for (const c of schema) {
      if (c.type === "ref") {
        const codes = references.get(c.ref!) ?? [];
        payload[c.key] = codes[Math.floor(rng() * codes.length)] ?? "";
      } else if (c.type === "entier") {
        payload[c.key] = Math.round(1 + rng() * 60);
      } else if (c.type === "decimal") {
        payload[c.key] = Math.round(rng() * 200 * 100) / 100;
      } else {
        payload[c.key] = `${c.label} — ${arrCode} (démonstration ${i + 1})`;
      }
    }
    if (i === 0 && forcerAutrePrecision) {
      const categorie = schema.find((c) => c.key === forcerAutrePrecision.key)?.ref;
      const autre = (references.get(categorie ?? "") ?? []).find((code) => code.endsWith("_AUTRE"));
      if (autre) {
        payload[forcerAutrePrecision.key] = autre;
        payload[`${forcerAutrePrecision.key}__PRECISION`] = forcerAutrePrecision.precision;
      }
    }
    lignes.push({ clientId: `demo-evt-${rapportId}-${templateId}-${i}`, rapportId, templateId, payload });
  }
  lot.evenements.push(...lignes);
}

async function seedSaisies(mois: number, rapportsParCode: Map<string, { id: string; arrondissementId: string; statut: string }>, etablissements: Map<string, string[]>) {
  const templates = await prisma.formTemplate.findMany({ where: { actif: true }, include: { fields: { where: { actif: true }, orderBy: { ordre: "asc" } } } });
  const refs = await prisma.referentielItem.findMany({ where: { actif: true }, select: { categorie: true, code: true } });
  const references = new Map<string, string[]>();
  for (const r of refs) references.set(r.categorie, [...(references.get(r.categorie) ?? []), r.code]);
  const enCours = mois === MOIS_EN_COURS;
  const lot: Lot = { matrice: [], nominative: [], evenements: [] };

  for (const [arrCode, rapport] of Array.from(rapportsParCode.entries())) {
    // Le rapport encore en saisie au mois en cours (Fokoué pour la Menoua) : un brouillon incomplet.
    const incomplet = enCours && rapport.statut === "EN_SAISIE";
    for (const t of templates) {
      if (t.type === "MATRICE") {
        remplirMatrice(lot, rapport.id, t.fields, arrCode, mois, incomplet);
      } else if (t.type === "NOMINATIF" && !incomplet) {
        const typeCode = NOMINATIF_ETABLISSEMENT_TYPE[t.code];
        remplirNominatif(lot, rapport.id, t.id, t.fields, arrCode, mois, etablissements.get(`${arrCode}:${typeCode}`) ?? []);
      } else if (t.type === "EVENEMENT" && !incomplet) {
        const schema = (t.schemaEvenement as ChampEvenement[] | null) ?? [];
        if (schema.length === 0) continue;
        // Santchou, au mois en cours : aucun événement sanitaire déclaré (§10.3).
        if (enCours && arrCode === "STC" && ["T31", "T32", "T33", "T35"].includes(t.code)) continue;
        // Fongo-Tongo, au mois en cours : plusieurs foyers le même mois (§10.3).
        const count = enCours && arrCode === "FGT" && t.code === "T31" ? 5 : t.code.startsWith("T5") ? 0 : 1 + Math.floor(seededRng(`${arrCode}${t.code}${mois}`)() * 3);
        const forcerAutre = t.code === "T33" ? { key: "maladie", precision: "Suspicion de piroplasmose, prélèvement envoyé au laboratoire régional (démonstration)" } : undefined;
        if (count > 0) remplirEvenements(lot, rapport.id, t.id, schema, arrCode, mois, count, references, forcerAutre);
      }
    }
  }

  // Une écriture groupée par mois, plutôt qu'une par tableau et par
  // arrondissement : huit départements à remplir, sur un petit serveur.
  await ecrireParPaquets(lot.matrice, (data) => prisma.saisieMatrice.createMany({ data }));
  await ecrireParPaquets(lot.nominative, (data) => prisma.saisieNominative.createMany({ data }));
  await ecrireParPaquets(lot.evenements, (data) => prisma.saisieEvenement.createMany({ data }));
}

/** Les saisies d'un mois, préparées avant d'être écrites d'un coup. */
interface Lot {
  matrice: any[];
  nominative: any[];
  evenements: any[];
}

async function ecrireParPaquets(lignes: any[], ecrire: (data: any[]) => Promise<unknown>, taille = 4000) {
  for (let i = 0; i < lignes.length; i += taille) await ecrire(lignes.slice(i, i + taille));
}

async function seedValidationsEtSyntheses(periodeId: string, mois: number) {
  const sections = await prisma.section.findMany();
  const chefs = await prisma.user.findMany({ where: { role: { in: ["CHEF_BAC", "CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"] } } });
  const chefBySection = new Map(chefs.map((c) => [c.sectionId, c]));

  // Au mois en cours, les trois états à la fois : PSA et SPAIH validées, SSV en
  // contrôle, BAC en attente. Les mois clos sont entièrement validés.
  const statutDuMois: Record<string, "VALIDE" | "EN_CONTROLE" | "EN_ATTENTE"> =
    mois === MOIS_EN_COURS ? { PSA: "VALIDE", SPAIH: "VALIDE", SSV: "EN_CONTROLE", BAC: "EN_ATTENTE" } : { PSA: "VALIDE", SPAIH: "VALIDE", SSV: "VALIDE", BAC: "VALIDE" };

  for (const s of sections) {
    const statut = statutDuMois[s.code] ?? "EN_ATTENTE";
    const chef = chefBySection.get(s.id);
    const valide = statut === "VALIDE";
    await prisma.validationSection.create({
      data: { periodeId, sectionId: s.id, statut, valideParId: valide ? chef?.id ?? null : null, dateValidation: valide ? new Date(ANNEE_DEMO, mois - 1, 27) : null },
    });
    if (valide && chef) {
      await prisma.syntheseSection.create({
        data: { periodeId, sectionId: s.id, blocCode: "GENERAL", contenuFinal: `Section ${s.nom} : activité stable dans les arrondissements ce mois-ci (démonstration).`, auteurId: chef.id, valideDD: mois !== MOIS_EN_COURS },
      });
    }
  }
}

/**
 * Vide tout ce que les participants ont pu faire pendant une séance : saisies
 * du mois et du trimestre, rapports, validations, textes, documents produits,
 * notifications. La structure (comptes, arrondissements, tableaux) reste.
 */
async function viderDonneesDemo() {
  await prisma.correction.deleteMany({});
  await prisma.syntheseSection.deleteMany({});
  await prisma.validationSection.deleteMany({});
  await prisma.exportDocument.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.saisieMatrice.deleteMany({});
  await prisma.saisieNominative.deleteMany({});
  await prisma.saisieEvenement.deleteMany({});
  await prisma.rapportArrondissement.deleteMany({});
  await prisma.saisieCanevas.deleteMany({});
  await prisma.analyseCanevas.deleteMany({});
  await prisma.circuitTrimestre.deleteMany({});
  await prisma.rubriqueNarrative.deleteMany({});
  await prisma.texteDepartement.deleteMany({});
}

/** Repère lu par l'administration du système : quand la démonstration a été remise à zéro. */
export const CLE_DEMO_REINITIALISEE = "demo_reinitialisee_le";

/**
 * Réinitialisation des DONNÉES de démonstration (§10.9) — appelée par le
 * bouton « Réinitialiser la démonstration » et par l'administration du système.
 *
 * Ne touche PAS à la structure (arrondissements, sections, référentiels, les 28
 * tableaux et leurs champs) : celle-ci est posée une fois pour toutes par le
 * seed complet ci-dessous. seedFormulaires() lit le dictionnaire .xlsx via
 * XLSX.readFile, ce qui ne fonctionne pas depuis une route Next.js.
 */
export async function reinitialiserDonneesDemo(): Promise<{ departements: number; mois: number; saisies: number; duree: number }> {
  const debut = Date.now();
  // Chaque département de l'Ouest, la Menoua en premier : chacun sa démonstration.
  const departements = (await clientBrut().departement.findMany({ orderBy: { nom: "asc" } })).sort(
    (a, b) => Number(b.code === CODE_DEPARTEMENT_DEMO) - Number(a.code === CODE_DEPARTEMENT_DEMO)
  );
  let saisies = 0;
  let nbMois = 0;
  for (const d of departements) {
    await entrerDans(d.code);
    if ((await prisma.arrondissement.count()) === 0) continue; // département sans arrondissement : rien à montrer
    await viderDonneesDemo();
    const etablissements = await seedEtablissements();
    await seedComptesDemo(d);
    const periodes = await seedPeriodes();
    nbMois = periodes.size;
    for (const [mois, periode] of Array.from(periodes.entries())) {
      const rapports = await seedRapports(periode.id, mois, d.code);
      await seedSaisies(mois, rapports, etablissements);
      await seedValidationsEtSyntheses(periode.id, mois);
    }
    saisies += (await prisma.saisieMatrice.count()) + (await prisma.saisieNominative.count()) + (await prisma.saisieEvenement.count());
  }
  await entrerDans(CODE_DEPARTEMENT_DEMO);
  const le = new Date().toISOString();
  await prisma.configSysteme.upsert({ where: { cle: CLE_DEMO_REINITIALISEE }, create: { cle: CLE_DEMO_REINITIALISEE, valeur: le }, update: { valeur: le } });
  console.log(`Démonstration prête : ${departements.length} départements, ${nbMois} mois, ${saisies} saisies.`);
  return { departements: departements.length, mois: nbMois, saisies, duree: Date.now() - debut };
}

/** Seed complet (CLI uniquement) : structure + données. */
export async function seedDemoComplet(): Promise<void> {
  if (!DEMO_URL) {
    throw new Error("DEMO_DATABASE_URL manquant — le seed de démonstration ne doit jamais retomber sur DATABASE_URL.");
  }
  console.log(`Seed DÉMONSTRATION — base : ${DEMO_URL.replace(/:[^:@]+@/, ":***@")}`);

  /*
   * La base de démonstration reçoit les mêmes migrations, donc les mêmes
   * politiques et le même déclencheur : sans département déclaré, chaque
   * insertion est refusée. Le client est cloisonné sur la Menoua, nommée par
   * son code (voir clientDeLaDemo).
   */
  await clientDeLaDemo();
  console.log(`Département du semis : ${CODE_DEPARTEMENT_DEMO}`);

  await seedTerritoireEtSections();
  await seedReferentiels();
  await seedFormulaires();
  await reinitialiserDonneesDemo();
  console.log("Seed de démonstration terminé.");
}

// Exécution directe (`npx tsx prisma/seed-demo.ts` / `npm run seed:demo`) uniquement —
// ce bloc ne s'exécute jamais quand le fichier est importé par l'application.
const cheminAppelant = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (cheminAppelant.endsWith("seed-demo.ts") || cheminAppelant.endsWith("seed-demo.js")) {
  seedDemoComplet()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (clientDemo) await clientDemo.$disconnect();
    });
}

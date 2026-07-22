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

const DEMO_URL = process.env.DEMO_DATABASE_URL;
if (!DEMO_URL) {
  throw new Error("DEMO_DATABASE_URL manquant — le seed de démonstration ne doit jamais retomber sur DATABASE_URL.");
}
if (process.env.DATABASE_URL && DEMO_URL === process.env.DATABASE_URL) {
  throw new Error("DEMO_DATABASE_URL est identique à DATABASE_URL : refus de seeder — ces deux bases doivent rester distinctes.");
}

const prisma = new PrismaClient({ datasources: { db: { url: DEMO_URL } } });

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

/** Comptes de démonstration — identifiants et rôles distincts des comptes réels (§10.4). */
async function seedComptesDemo() {
  const passwordHash = await bcrypt.hash(MOT_DE_PASSE_DEMO, 10);
  const arrondissements = await prisma.arrondissement.findMany();
  const sections = await prisma.section.findMany();
  const arrByCode = new Map(arrondissements.map((a) => [a.code, a]));
  const secByCode = new Map(sections.map((s) => [s.code, s]));

  const comptes: Array<{ username: string; nom: string; role: string; arrondissementCode?: string; sectionCode?: string }> = [
    { username: "demo.dd", nom: "Démo — Délégué Départemental", role: "DD" },
    { username: "demo.admin", nom: "Démo — Administrateur", role: "ADMIN_TECH" },
    { username: "demo.chef.bac", nom: "Démo — Chef BAC", role: "CHEF_BAC", sectionCode: "BAC" },
    { username: "demo.chef.psa", nom: "Démo — Chef Productions Animales", role: "CHEF_PSA", sectionCode: "PSA" },
    { username: "demo.chef.ssv", nom: "Démo — Chef Services Vétérinaires", role: "CHEF_SSV", sectionCode: "SSV" },
    { username: "demo.chef.spaih", nom: "Démo — Chef Pêches/Aquaculture", role: "CHEF_SPAIH", sectionCode: "SPAIH" },
    { username: "demo.da.dschang", nom: "Démo — DA Dschang", role: "DA", arrondissementCode: "DSC" },
    { username: "demo.da.fokoue", nom: "Démo — DA Fokoué", role: "DA", arrondissementCode: "FOK" },
    { username: "demo.da.fongotongo", nom: "Démo — DA Fongo-Tongo", role: "DA", arrondissementCode: "FGT" },
    { username: "demo.da.nkongni", nom: "Démo — DA Nkong-Ni", role: "DA", arrondissementCode: "NKN" },
    { username: "demo.da.penkamichel", nom: "Démo — DA Penka-Michel", role: "DA", arrondissementCode: "PKM" },
    { username: "demo.da.santchou", nom: "Démo — DA Santchou", role: "DA", arrondissementCode: "STC" },
  ];

  for (const c of comptes) {
    const data: any = {
      username: c.username,
      nom: c.nom,
      passwordHash,
      role: c.role,
      mustChangePassword: false,
      actif: true,
      arrondissementId: c.arrondissementCode ? arrByCode.get(c.arrondissementCode)?.id ?? null : null,
      sectionId: c.sectionCode ? secByCode.get(c.sectionCode)?.id ?? null : null,
    };
    await prisma.user.upsert({
      where: { username: c.username },
      update: { nom: data.nom, role: data.role, arrondissementId: data.arrondissementId, sectionId: data.sectionId, mustChangePassword: false, actif: true, passwordHash },
      create: data,
    });
  }
  console.log(`${comptes.length} comptes de démonstration créés (mot de passe : ${MOT_DE_PASSE_DEMO}).`);
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

async function seedPeriode() {
  const annee = 2026;
  const mois = 7;
  let periode = await prisma.periodeReporting.findFirst({ where: { type: "MENSUEL", annee, mois } });
  if (!periode) {
    periode = await prisma.periodeReporting.create({
      data: {
        type: "MENSUEL",
        annee,
        mois,
        dateOuverture: new Date(annee, mois - 1, 1),
        dateLimiteDA: new Date(annee, mois - 1, 28),
        dateLimiteChef: new Date(annee, mois - 1, 29),
        dateLimiteDD: new Date(annee, mois, 2),
        statut: "OUVERTE",
      },
    });
  }
  return periode;
}

type ScenarioArr = { code: string; statut: "EN_SAISIE" | "SOUMIS" | "REJETE" | "CLOTURE"; motifRejet?: string };
const SCENARIOS: ScenarioArr[] = [
  { code: "DSC", statut: "SOUMIS" },
  { code: "FOK", statut: "EN_SAISIE" },
  { code: "FGT", statut: "SOUMIS" },
  { code: "NKN", statut: "REJETE", motifRejet: "Écart important sur les effectifs vaccinés par rapport au mois précédent — merci de vérifier le tableau 3.2 avant renvoi." },
  { code: "PKM", statut: "CLOTURE" },
  { code: "STC", statut: "SOUMIS" },
];

async function seedRapports(periodeId: string) {
  const arrondissements = await prisma.arrondissement.findMany();
  const arrByCode = new Map(arrondissements.map((a) => [a.code, a]));
  const users = await prisma.user.findMany({ where: { role: "DA" } });
  const userByArrId = new Map(users.map((u) => [u.arrondissementId, u]));

  const rapportsParCode = new Map<string, { id: string; arrondissementId: string }>();
  for (const s of SCENARIOS) {
    const arr = arrByCode.get(s.code)!;
    const da = userByArrId.get(arr.id);
    const rapport = await prisma.rapportArrondissement.upsert({
      where: { periodeId_arrondissementId: { periodeId, arrondissementId: arr.id } },
      update: {
        statut: s.statut,
        soumisParId: s.statut === "EN_SAISIE" ? null : da?.id ?? null,
        dateSoumission: s.statut === "EN_SAISIE" ? null : new Date(2026, 6, 10 + Math.floor(Math.random() * 5)),
        motifRejet: s.motifRejet ?? null,
      },
      create: {
        periodeId,
        arrondissementId: arr.id,
        statut: s.statut,
        soumisParId: s.statut === "EN_SAISIE" ? null : da?.id ?? null,
        dateSoumission: s.statut === "EN_SAISIE" ? null : new Date(2026, 6, 10),
        motifRejet: s.motifRejet ?? null,
      },
    });
    rapportsParCode.set(s.code, { id: rapport.id, arrondissementId: arr.id });
  }
  return rapportsParCode;
}

async function viderSaisiesExistantes(rapportIds: string[]) {
  await prisma.saisieMatrice.deleteMany({ where: { rapportId: { in: rapportIds } } });
  await prisma.saisieNominative.deleteMany({ where: { rapportId: { in: rapportIds } } });
  await prisma.saisieEvenement.deleteMany({ where: { rapportId: { in: rapportIds } } });
}

async function remplirMatrice(rapportId: string, templateId: string, arrCode: string, incomplet: boolean) {
  const fields = await prisma.formField.findMany({ where: { templateId, actif: true } });
  const rng = seededRng(`${arrCode}:${templateId}`);
  const nbAFournir = incomplet ? Math.ceil(fields.length * 0.4) : fields.length;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (incomplet && i >= nbAFournir) continue; // brouillon : champs non encore saisis (absence de ligne, pas nonRenseigne)
    const roll = rng();
    if (f.typeValeur === "TEXTE") {
      const valeurTexte = roll < 0.5 ? null : `${f.libelle} — ${arrCode} (démonstration)`;
      await prisma.saisieMatrice.upsert({
        where: { rapportId_fieldCode: { rapportId, fieldCode: f.code } },
        update: { valeurTexte, nonRenseigne: false },
        create: { rapportId, fieldCode: f.code, valeurTexte, nonRenseigne: false, clientId: `demo-mat-${rapportId}-${f.code}` },
      });
      continue;
    }
    if (roll < 0.05) {
      await prisma.saisieMatrice.upsert({
        where: { rapportId_fieldCode: { rapportId, fieldCode: f.code } },
        update: { valeur: null, nonRenseigne: true, motifNonRenseigne: "Donnée non disponible ce mois-ci (démonstration)" },
        create: { rapportId, fieldCode: f.code, nonRenseigne: true, motifNonRenseigne: "Donnée non disponible ce mois-ci (démonstration)", clientId: `demo-mat-${rapportId}-${f.code}` },
      });
      continue;
    }
    // Une valeur réellement nulle (zéro) pour le premier champ numérique de chaque tableau, afin
    // d'illustrer explicitement 0 ≠ non-renseigné (§10.3 — cas particulier demandé par le DD).
    const valeur = i === 0 ? 0 : valeurAleatoire(rng, f.typeValeur, f.libelle);
    await prisma.saisieMatrice.upsert({
      where: { rapportId_fieldCode: { rapportId, fieldCode: f.code } },
      update: { valeur, nonRenseigne: false, motifNonRenseigne: null },
      create: { rapportId, fieldCode: f.code, valeur, nonRenseigne: false, clientId: `demo-mat-${rapportId}-${f.code}` },
    });
  }
}

async function remplirNominatif(rapportId: string, templateId: string, arrCode: string, etablissementIds: string[]) {
  const fields = await prisma.formField.findMany({ where: { templateId, actif: true } });
  for (const etabId of etablissementIds) {
    const rng = seededRng(`${arrCode}:${templateId}:${etabId}`);
    for (const f of fields) {
      if (f.typeValeur === "TEXTE") {
        const valeurTexte = rng() < 0.4 ? "RAS ce mois-ci (démonstration)" : null;
        await prisma.saisieNominative.upsert({
          where: { rapportId_etablissementId_fieldCode: { rapportId, etablissementId: etabId, fieldCode: f.code } },
          update: { valeurTexte, nonRenseigne: false },
          create: { rapportId, templateId, etablissementId: etabId, fieldCode: f.code, valeurTexte, nonRenseigne: false, clientId: `demo-nom-${rapportId}-${etabId}-${f.code}` },
        });
        continue;
      }
      const valeur = valeurAleatoire(rng, f.typeValeur, f.libelle);
      await prisma.saisieNominative.upsert({
        where: { rapportId_etablissementId_fieldCode: { rapportId, etablissementId: etabId, fieldCode: f.code } },
        update: { valeur, nonRenseigne: false },
        create: { rapportId, templateId, etablissementId: etabId, fieldCode: f.code, valeur, nonRenseigne: false, clientId: `demo-nom-${rapportId}-${etabId}-${f.code}` },
      });
    }
  }
}

async function tirerRefCode(categorie: string, rng: () => number): Promise<string> {
  const items = await prisma.referentielItem.findMany({ where: { categorie: categorie as any, actif: true } });
  return items[Math.floor(rng() * items.length)]?.code ?? "";
}

async function remplirEvenements(
  rapportId: string,
  templateId: string,
  schema: ChampEvenement[],
  arrCode: string,
  count: number,
  forcerAutrePrecision?: { key: string; precision: string }
) {
  const rng = seededRng(`${arrCode}:${templateId}:evt`);
  for (let i = 0; i < count; i++) {
    const payload: Record<string, unknown> = {};
    for (const c of schema) {
      if (c.type === "ref") {
        payload[c.key] = await tirerRefCode(c.ref!, rng);
      } else if (c.type === "entier") {
        payload[c.key] = Math.round(1 + rng() * 60);
      } else if (c.type === "decimal") {
        payload[c.key] = Math.round(rng() * 200 * 100) / 100;
      } else {
        payload[c.key] = `${c.label} — ${arrCode} (démonstration ${i + 1})`;
      }
    }
    if (i === 0 && forcerAutrePrecision) {
      const autreCode = (await prisma.referentielItem.findFirst({
        where: { code: { endsWith: "_AUTRE" }, categorie: schema.find((c) => c.key === forcerAutrePrecision.key)?.ref as any },
      }))?.code;
      if (autreCode) {
        payload[forcerAutrePrecision.key] = autreCode;
        payload[`${forcerAutrePrecision.key}__PRECISION`] = forcerAutrePrecision.precision;
      }
    }
    await prisma.saisieEvenement.create({
      data: { clientId: `demo-evt-${rapportId}-${templateId}-${i}`, rapportId, templateId, payload: payload as any },
    });
  }
}

async function seedSaisies(rapportsParCode: Map<string, { id: string; arrondissementId: string }>, etablissements: Map<string, string[]>) {
  await viderSaisiesExistantes(Array.from(rapportsParCode.values()).map((r) => r.id));

  const templates = await prisma.formTemplate.findMany({ where: { actif: true } });

  for (const [arrCode, rapport] of Array.from(rapportsParCode.entries())) {
    const incomplet = arrCode === "FOK";
    for (const t of templates) {
      if (t.type === "MATRICE") {
        await remplirMatrice(rapport.id, t.id, arrCode, incomplet);
      } else if (t.type === "NOMINATIF" && !incomplet) {
        const typeCode = NOMINATIF_ETABLISSEMENT_TYPE[t.code];
        const ids = etablissements.get(`${arrCode}:${typeCode}`) ?? [];
        await remplirNominatif(rapport.id, t.id, arrCode, ids);
      } else if (t.type === "EVENEMENT" && !incomplet) {
        const schema = (t.schemaEvenement as ChampEvenement[] | null) ?? [];
        if (schema.length === 0) continue;

        // Santchou : aucun événement sanitaire déclaré ce mois-ci (§10.3, cas particulier).
        if (arrCode === "STC" && ["T31", "T32", "T33", "T35"].includes(t.code)) continue;

        // Fongo-Tongo : plusieurs foyers sanitaires le même mois (§10.3).
        const count = arrCode === "FGT" && t.code === "T31" ? 5 : t.code.startsWith("T5") ? 0 : 2 + Math.floor(seededRng(arrCode + t.code)() * 2);

        const forcerAutre = t.code === "T33" ? { key: "maladie", precision: "Suspicion de piroplasmose, prélèvement envoyé au laboratoire régional (démonstration)" } : undefined;
        if (count > 0) await remplirEvenements(rapport.id, t.id, schema, arrCode, count, forcerAutre);
      }
    }
  }
  console.log("Saisies de démonstration générées pour les 28 tableaux (hors Fokoué, brouillon incomplet).");
}

async function seedValidationsEtSyntheses(periodeId: string) {
  const sections = await prisma.section.findMany();
  const chefs = await prisma.user.findMany({ where: { role: { in: ["CHEF_BAC", "CHEF_PSA", "CHEF_SSV", "CHEF_SPAIH"] } } });
  const chefBySection = new Map(chefs.map((c) => [c.sectionId, c]));

  // PSA et SPAIH déjà validées, SSV en cours de contrôle, BAC en attente — pour montrer les 3 états à la fois.
  const statutParCode: Record<string, "VALIDE" | "EN_CONTROLE" | "EN_ATTENTE"> = {
    PSA: "VALIDE",
    SPAIH: "VALIDE",
    SSV: "EN_CONTROLE",
    BAC: "EN_ATTENTE",
  };

  for (const s of sections) {
    const statut = statutParCode[s.code] ?? "EN_ATTENTE";
    const chef = chefBySection.get(s.id);
    await prisma.validationSection.upsert({
      where: { periodeId_sectionId: { periodeId, sectionId: s.id } },
      update: { statut, valideParId: statut === "VALIDE" ? chef?.id ?? null : null, dateValidation: statut === "VALIDE" ? new Date(2026, 6, 26) : null },
      create: { periodeId, sectionId: s.id, statut, valideParId: statut === "VALIDE" ? chef?.id ?? null : null, dateValidation: statut === "VALIDE" ? new Date(2026, 6, 26) : null },
    });

    if (statut === "VALIDE" && chef) {
      const texte = `Section ${s.nom} : activité stable sur les 6 arrondissements ce mois-ci (démonstration).`;
      await prisma.syntheseSection.upsert({
        where: { periodeId_sectionId_blocCode: { periodeId, sectionId: s.id, blocCode: "GENERAL" } },
        update: { contenuFinal: texte, valideDD: false },
        create: { periodeId, sectionId: s.id, blocCode: "GENERAL", contenuFinal: texte, auteurId: chef.id, valideDD: false },
      });
    }
  }
  console.log("Validations de sections : PSA et SPAIH validées, SSV en contrôle, BAC en attente.");
}

/**
 * Réinitialisation des DONNÉES de démonstration (§10.9) — appelée par la route
 * API /api/demo/reinitialiser (bouton "Réinitialiser la démonstration").
 *
 * Ne touche PAS à la structure (arrondissements, sections, référentiels, les 28
 * tableaux et leurs champs) : celle-ci est posée une fois pour toutes par le
 * seed complet ci-dessous et ne change jamais pendant une démonstration. Cette
 * séparation n'est pas cosmétique : seedFormulaires() lit le dictionnaire .xlsx
 * via XLSX.readFile, ce qui ne fonctionne pas depuis une route Next.js (le
 * fichier n'est pas accessible au bundle serveur). Restaurer uniquement les
 * données transactionnelles est donc à la fois plus sûr et beaucoup plus rapide.
 */
export async function reinitialiserDonneesDemo(): Promise<void> {
  const etablissements = await seedEtablissements();
  await seedComptesDemo();
  const periode = await seedPeriode();
  const rapports = await seedRapports(periode.id);
  await seedSaisies(rapports, etablissements);
  await seedValidationsEtSyntheses(periode.id);
}

/** Seed complet (CLI uniquement) : structure + données. */
export async function seedDemoComplet(): Promise<void> {
  console.log(`Seed DÉMONSTRATION — base : ${DEMO_URL!.replace(/:[^:@]+@/, ":***@")}`);
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
      await prisma.$disconnect();
    });
}

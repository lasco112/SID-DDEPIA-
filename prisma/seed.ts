/**
 * seed.ts — Seed généralisé aux 28 tableaux du canevas mensuel DDEPIA-Menoua
 * ---------------------------------------------------------------------------
 * Source de vérité : prisma/data/DICO_DONNEES_CANEVAS_MENSUEL_MENOUA.xlsx,
 * le dictionnaire de données validé par le DD (402 champs, codes stables
 * figés — voir prisma/seed-lib/parseDictionnaire.ts).
 *
 * Ce script crée : territoire, sections, référentiels de démarrage (espèces,
 * maladies, vaccins, actes vétérinaires, motifs de saisie, types
 * d'établissement, unités), les 28 FormTemplate + leurs FormField (familles
 * MATRICE/NOMINATIF) ou schemaEvenement (famille EVENEMENT), un registre
 * d'établissements DE DÉMONSTRATION (à remplacer par le registre réel — CDC
 * §B.5.3), les comptes de test et une période mensuelle ouverte.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { parseDictionnaire, EVENEMENT_SCHEMAS } from "./seed-lib/parseDictionnaire";
import { NOMINATIF_ETABLISSEMENT_TYPE } from "./seed-lib/nominatifEtablissementTypes";

const prisma = new PrismaClient();

function slugUnite(raw: string): { code: string; libelle: string } {
  const slug = raw
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // retire les accents
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return { code: `UNITE_${slug}`, libelle: raw.trim() };
}

async function seedTerritoireEtSections() {
  const arrondissements = [
    { code: "DSC", nom: "Dschang", ordre: 1 },
    { code: "FOK", nom: "Fokoué", ordre: 2 },
    { code: "FGT", nom: "Fongo-Tongo", ordre: 3 },
    { code: "NKN", nom: "Nkong-Ni", ordre: 4 },
    { code: "PKM", nom: "Penka-Michel", ordre: 5 },
    { code: "STC", nom: "Santchou", ordre: 6 },
  ];
  for (const a of arrondissements) {
    await prisma.arrondissement.upsert({ where: { code: a.code }, update: {}, create: a });
  }

  const sections = [
    { code: "BAC", nom: "Bureau des Affaires Communes", ordre: 1 },
    { code: "PSA", nom: "Productions et Statistiques Animales", ordre: 2 },
    { code: "SSV", nom: "Services Vétérinaires", ordre: 3 },
    { code: "SPAIH", nom: "Pêches, Aquaculture et Industries Halieutiques", ordre: 4 },
  ];
  for (const s of sections) {
    await prisma.section.upsert({ where: { code: s.code }, update: {}, create: s });
  }

  return { arrondissements, sections };
}

async function seedReferentiels() {
  const especes = [
    ["ESP_BOVIN", "Bovins"], ["ESP_OVIN", "Ovins"], ["ESP_CAPRIN", "Caprins"],
    ["ESP_PORCIN", "Porcins"], ["ESP_CAMELIN", "Camelins"], ["ESP_ASIN", "Asins"],
    ["ESP_EQUIN", "Equins"], ["ESP_CANIN", "Canins"], ["ESP_LAPIN", "Lapins"],
    ["ESP_AULACODE", "Aulacodes"], ["ESP_FELIN", "Félins"], ["ESP_COBAYE", "Cobayes"],
    ["ESP_PRIMATE", "Primates"],
  ] as const;

  const maladies = [
    ["MAL_PPR", "Peste des petits ruminants"],
    ["MAL_FIEVRE_APHTEUSE", "Fièvre aphteuse"],
    ["MAL_PESTE_PORCINE_AFRICAINE", "Peste porcine africaine"],
    ["MAL_NEWCASTLE", "Maladie de Newcastle"],
    ["MAL_CHARBON_BACTERIDIEN", "Charbon bactéridien"],
    ["MAL_PASTEURELLOSE", "Pasteurellose"],
    ["MAL_RAGE", "Rage"],
    ["MAL_TRYPANOSOMOSE", "Trypanosomose"],
    ["MAL_DERMATOSE_NODULAIRE", "Dermatose nodulaire contagieuse"],
    ["MAL_CLAVELEE", "Clavelée"],
    ["MAL_COLIBACILLOSE_AVIAIRE", "Colibacillose aviaire"],
    ["MAL_COCCIDIOSE", "Coccidiose"],
    ["MAL_GUMBORO", "Maladie de Gumboro"],
    ["MAL_AUTRE", "Autre maladie"],
  ] as const;

  const vaccins = [
    ["VAC_PPR", "Vaccin PPR"],
    ["VAC_NEWCASTLE", "Vaccin Newcastle"],
    ["VAC_CHARBON_BACTERIDIEN", "Vaccin charbon bactéridien"],
    ["VAC_PASTEURELLOSE", "Vaccin pasteurellose"],
    ["VAC_RAGE", "Vaccin antirabique"],
    ["VAC_GUMBORO", "Vaccin Gumboro"],
    ["VAC_CLAVELEE", "Vaccin clavelée"],
  ] as const;

  const actesVeterinaires = [
    ["ACTE_CONSULTATION", "Consultation"],
    ["ACTE_DEPARASITAGE", "Déparasitage"],
    ["ACTE_CASTRATION", "Castration"],
    ["ACTE_VACCINATION_PRIVEE", "Vaccination (privé)"],
    ["ACTE_CHIRURGIE", "Chirurgie"],
    ["ACTE_VELAGE_ASSISTE", "Vêlage assisté"],
    ["ACTE_AUTRE", "Autre acte"],
  ] as const;

  const motifsSaisie = [
    ["MOTIF_TUBERCULOSE", "Tuberculose"],
    ["MOTIF_CYSTICERCOSE", "Cysticercose"],
    ["MOTIF_DISTOMATOSE", "Distomatose"],
    ["MOTIF_PUTREFACTION", "Putréfaction"],
    ["MOTIF_ABCES_GENERALISE", "Abcès généralisé"],
    ["MOTIF_CACHEXIE", "Cachexie"],
    ["MOTIF_AUTRE", "Autre motif"],
  ] as const;

  const typesEtablissement = [
    ["ETAB_COUVOIR", "Couvoir"],
    ["ETAB_FERME_PONTE", "Ferme de ponte"],
    ["ETAB_FERME_CHAIR", "Ferme de poulets de chair"],
    ["ETAB_PROVENDERIE", "Provenderie"],
    ["ETAB_ABATTOIR", "Abattoir"],
    ["ETAB_AIRE_ABATTAGE", "Aire d'abattage aménagée"],
    ["ETAB_MARCHE", "Marché à bétail"],
    ["ETAB_ETANG", "Étang piscicole"],
    ["ETAB_CLINIQUE_PRIVEE", "Clinique vétérinaire privée"],
  ] as const;

  const groupes: Array<{ categorie: string; items: readonly (readonly [string, string])[] }> = [
    { categorie: "ESPECE", items: especes },
    { categorie: "MALADIE", items: maladies },
    { categorie: "VACCIN", items: vaccins },
    { categorie: "ACTE_VETERINAIRE", items: actesVeterinaires },
    { categorie: "MOTIF_SAISIE", items: motifsSaisie },
    { categorie: "TYPE_ETABLISSEMENT", items: typesEtablissement },
  ];

  for (const g of groupes) {
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
  const unitesVues = new Map<string, string>(); // code -> libelle

  for (const t of tableaux) {
    const sectionId = sectionIdByCode.get(t.sectionCode);
    if (!sectionId) {
      throw new Error(`Section inconnue "${t.sectionCode}" pour le tableau ${t.templateCode}`);
    }

    const isEvenement = t.famille === "EVENEMENT";
    const schemaEvenement = isEvenement
      ? EVENEMENT_SCHEMAS[t.champs[0]?.code ?? ""]
      : undefined;
    if (isEvenement && !schemaEvenement) {
      throw new Error(`Schéma EVENEMENT manquant pour ${t.templateCode} (${t.champs[0]?.code})`);
    }

    const template = await prisma.formTemplate.upsert({
      where: { code: t.templateCode },
      update: {
        numero: t.numero,
        titre: t.titre,
        type: t.famille,
        sectionId,
        ordre: t.ordre,
        schemaEvenement: schemaEvenement ? (schemaEvenement as any) : undefined,
      },
      create: {
        code: t.templateCode,
        numero: t.numero,
        titre: t.titre,
        type: t.famille,
        sectionId,
        ordre: t.ordre,
        schemaEvenement: schemaEvenement ? (schemaEvenement as any) : undefined,
      },
    });

    if (isEvenement) continue; // pas de FormField : la structure vit dans schemaEvenement

    const codesActuels = new Set<string>();
    for (const champ of t.champs) {
      const { code: uniteCode, libelle: uniteLibelle } = slugUnite(champ.unite);
      unitesVues.set(uniteCode, uniteLibelle);
      codesActuels.add(champ.code);

      await prisma.formField.upsert({
        where: { code: champ.code },
        update: {
          templateId: template.id,
          libelle: champ.libelle,
          uniteCode,
          typeValeur: champ.typeValeur,
          ordre: champ.ordre,
          actif: true,
          disabledAt: null,
        },
        create: {
          templateId: template.id,
          code: champ.code,
          libelle: champ.libelle,
          uniteCode,
          typeValeur: champ.typeValeur,
          ordre: champ.ordre,
        },
      });
    }

    // Codes stables retirés du dictionnaire (ex. correction de structure) :
    // désactivés, jamais supprimés (§A.7 règle 1 et 8).
    const obsoletes = await prisma.formField.findMany({
      where: { templateId: template.id, actif: true, code: { notIn: Array.from(codesActuels) } },
    });
    for (const champ of obsoletes) {
      await prisma.formField.update({ where: { id: champ.id }, data: { actif: false, disabledAt: new Date() } });
      await prisma.auditLog.create({
        data: {
          action: "DESACTIVATION_CHAMP_SEED",
          entite: "FormField",
          entiteId: champ.id,
          details: { code: champ.code, raison: "Retiré du dictionnaire de données lors du reseed" },
        },
      });
      console.log(`Champ désactivé (retiré du dictionnaire) : ${champ.code}`);
    }
  }

  const unitesArr = Array.from(unitesVues.entries());
  for (let i = 0; i < unitesArr.length; i++) {
    const [code, libelle] = unitesArr[i];
    await prisma.referentielItem.upsert({
      where: { categorie_code: { categorie: "UNITE", code } },
      update: {},
      create: { categorie: "UNITE", code, libelle, ordre: i },
    });
  }

  console.log(`Formulaires : ${tableaux.length} tableaux (${tableaux.filter(t => t.famille !== "EVENEMENT").reduce((n, t) => n + t.champs.length, 0)} champs MATRICE/NOMINATIF, ${tableaux.filter(t => t.famille === "EVENEMENT").length} EVENEMENT), ${unitesVues.size} unités.`);
}

/**
 * Registre d'établissements DE DÉMONSTRATION — 2 par arrondissement pour
 * chacun des 4 types nominatifs du dictionnaire (T13 couvoir, T14 ferme de
 * ponte, T15 ferme de chair, T23 provenderie). À REMPLACER par le registre
 * réel fourni par le DD (CDC §B.5.3, nom/type/localité/propriétaire réels).
 */
async function seedEtablissementsDemo() {
  const arrondissements = await prisma.arrondissement.findMany();
  const prefixeParType: Record<string, string> = {
    ETAB_COUVOIR: "Couvoir",
    ETAB_FERME_PONTE: "Ferme de ponte",
    ETAB_FERME_CHAIR: "Ferme de chair",
    ETAB_PROVENDERIE: "Provenderie",
  };
  const typesNominatifs = Array.from(new Set(Object.values(NOMINATIF_ETABLISSEMENT_TYPE))).map(
    (typeCode) => ({ typeCode, prefixe: prefixeParType[typeCode] })
  );

  for (const arr of arrondissements) {
    for (const type of typesNominatifs) {
      for (let n = 1; n <= 2; n++) {
        const nom = `${type.prefixe} ${arr.nom} n°${n} (DÉMO)`;
        const existing = await prisma.etablissement.findFirst({
          where: { nom, arrondissementId: arr.id },
        });
        if (!existing) {
          await prisma.etablissement.create({
            data: {
              typeCode: type.typeCode,
              nom,
              localite: arr.nom,
              arrondissementId: arr.id,
              actif: true,
            },
          });
        }
      }
    }
  }
  console.log("Établissements DÉMO créés (à remplacer par le registre réel).");
}

async function seedUtilisateurs() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const users = [
    { username: "admin.tech", nom: "Admin Technique", role: "ADMIN_TECH" },
    { username: "dd.menoua", nom: "Délégué Départemental", role: "DD" },
    { username: "da.dschang", nom: "DA Dschang", role: "DA", arrondissementCode: "DSC" },
    { username: "da.fokoue", nom: "DA Fokoué", role: "DA", arrondissementCode: "FOK" },
    { username: "da.fongotongo", nom: "DA Fongo-Tongo", role: "DA", arrondissementCode: "FGT" },
    { username: "da.nkongni", nom: "DA Nkong-Ni", role: "DA", arrondissementCode: "NKN" },
    { username: "da.penkamichel", nom: "DA Penka-Michel", role: "DA", arrondissementCode: "PKM" },
    { username: "da.santchou", nom: "DA Santchou", role: "DA", arrondissementCode: "STC" },
    { username: "chef.bac", nom: "Chef BAC", role: "CHEF_BAC", sectionCode: "BAC" },
    { username: "chef.psa", nom: "Chef PSA", role: "CHEF_PSA", sectionCode: "PSA" },
    { username: "chef.ssv", nom: "Chef SSV", role: "CHEF_SSV", sectionCode: "SSV" },
    { username: "chef.spaih", nom: "Chef SPAIH", role: "CHEF_SPAIH", sectionCode: "SPAIH" },
  ] as const;

  for (const u of users) {
    const data: any = {
      username: u.username,
      nom: u.nom,
      passwordHash,
      role: u.role,
      mustChangePassword: true,
      actif: true,
    };
    if ("arrondissementCode" in u) {
      const arr = await prisma.arrondissement.findUnique({ where: { code: u.arrondissementCode } });
      if (arr) data.arrondissementId = arr.id;
    }
    if ("sectionCode" in u) {
      const sec = await prisma.section.findUnique({ where: { code: u.sectionCode } });
      if (sec) data.sectionId = sec.id;
    }
    // update: on rafraîchit le hash/role/rattachement à chaque seed (mais pas
    // mustChangePassword/actif, pour ne pas écraser un changement de mot de
    // passe ou une désactivation déjà faits en prod).
    await prisma.user.upsert({
      where: { username: u.username },
      update: { nom: data.nom, role: data.role, arrondissementId: data.arrondissementId ?? null, sectionId: data.sectionId ?? null },
      create: data,
    });
  }
  console.log(`${users.length} comptes de test créés (mot de passe initial : password123).`);
}

async function seedPeriodeOuverte() {
  const now = new Date();
  const annee = now.getFullYear();
  const mois = now.getMonth() + 1;

  let periode = await prisma.periodeReporting.findFirst({ where: { type: "MENSUEL", annee, mois } });
  if (!periode) {
    periode = await prisma.periodeReporting.create({
      data: {
        type: "MENSUEL",
        annee,
        mois,
        dateOuverture: now,
        dateLimiteDA: new Date(annee, mois - 1, 28),
        dateLimiteChef: new Date(annee, mois - 1, 29),
        dateLimiteDD: new Date(annee, mois, 2),
        statut: "OUVERTE",
      },
    });
    console.log(`Période ${mois}/${annee} ouverte.`);
  }

  // Une ligne ValidationSection par section dès l'ouverture (même si la
  // période existait déjà) : sans elle, une section jamais touchée par son
  // chef échapperait aux alertes de retard.
  const sections = await prisma.section.findMany();
  for (const s of sections) {
    await prisma.validationSection.upsert({
      where: { periodeId_sectionId: { periodeId: periode.id, sectionId: s.id } },
      update: {},
      create: { periodeId: periode.id, sectionId: s.id, statut: "EN_ATTENTE" },
    });
  }
}

async function main() {
  console.log("Seeding SID DDEPIA-Menoua...");
  await seedTerritoireEtSections();
  await seedReferentiels();
  await seedFormulaires();
  await seedEtablissementsDemo();
  await seedUtilisateurs();
  await seedPeriodeOuverte();
  console.log("Seed terminé.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

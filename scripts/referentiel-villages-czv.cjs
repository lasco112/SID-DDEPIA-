/**
 * Le découpage MINEPIA de l'Ouest : CZV et villages couverts, par arrondissement
 * (fichier remis par le Délégué le 4 novembre 2026 :
 * docs/referentiels/Villages couverts par les CCZV Ouest 2026.xlsx).
 *
 * Produit, à partir du fichier Excel :
 *   - referentiels/villages_czv_ouest_2026.json : la liste nettoyée, lisible ;
 *   - la migration SQL qui l'inscrit dans la base (idempotente : la rejouer
 *     après une mise à jour du fichier ne crée aucun doublon).
 *
 * Usage : node scripts/referentiel-villages-czv.cjs <fichier.xlsx> <migration.sql>
 *
 * Aucun rapprochement « au jugé » : chaque « DAEPIA de … » du fichier est
 * relié à SON code d'arrondissement par la table ci-dessous. Une ligne qui ne
 * s'y trouve pas arrête le script.
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const DEPARTEMENTS = {
  BAMBOUTOS: "BAM",
  "HAUT-NKAM": "HNK",
  "HAUTS-PLATEAUX": "HPL",
  "KOUNG-KHI": "KKH",
  MENOUA: "MEN",
  MIFI: "MIF",
  NDE: "NDE",
  NOUN: "NOU",
};

/** « DAEPIA de … » du fichier → code de l'arrondissement dans le SID. */
const ARRONDISSEMENTS = {
  "BAM|Mbouda": "MBD", "BAM|Galim": "GLM", "BAM|Babadjou": "BBJ", "BAM|Batcham": "BTC",
  "HNK|Bafang": "BFG", "HNK|Banka": "BNK", "HNK|Bana": "BNA", "HNK|Bakou": "BKU", "HNK|Bandja": "BDJ", "HNK|Kekem": "KKM", "HNK|Banwa": "BNW",
  "HPL|Baham": "BHM", "HPL|Bamendjou": "BMJ", "HPL|Bangou": "BGU", "HPL|Batié": "BTE",
  "KKH|Poumegne": "PMG", "KKH|Bayangam": "BYG", "KKH|Djebem": "DJB",
  "MEN|Dschang": "DSC", "MEN|Kong-ni": "NKN", "MEN|Penka Michel": "PKM", "MEN|FongoTongo": "FGT", "MEN|Santchou": "STC", "MEN|Fokoué": "FOK",
  "MIF|Bafoussam 1er": "BFA", "MIF|Bafoussam 2ème": "BFB", "MIF|Bafoussam 3ème": "BFC",
  "NDE|Bangangté": "BGT", "NDE|Bazou": "BZU", "NDE|Tonga": "TNG", "NDE|Bassamba": "BSB",
  "NOU|Foumban": "FMB", "NOU|Njimon": "NJM", "NOU|Koutaba": "KTB", "NOU|Foumbot": "FBT", "NOU|Kouoptamo": "KPT",
  "NOU|Malentouen": "MLT", "NOU|Massangam": "MSG", "NOU|Magba": "MGB", "NOU|Bangourain": "BGR",
};

const propre = (x) => String(x ?? "").replace(/\s+/g, " ").trim();
const slug = (x) =>
  propre(x)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
const sql = (x) => `'${String(x).replace(/'/g, "''")}'`;

const [fichier, sortieSql] = process.argv.slice(2);
if (!fichier || !sortieSql) {
  console.error("Usage : node scripts/referentiel-villages-czv.cjs <fichier.xlsx> <migration.sql>");
  process.exit(1);
}

const wb = XLSX.readFile(fichier);
const lignes = XLSX.utils.sheet_to_json(wb.Sheets["Villages couverts par les CCZV"], { header: 1, defval: "" }).slice(1);

/** dep → arr → czv → villages (dans l'ordre du fichier). */
const arbre = new Map();
let vides = 0;
let doublons = 0;
for (const r of lignes) {
  const [depLib, arrLib, czv, village] = r.slice(0, 4).map(propre);
  if (!depLib && !arrLib && !czv && !village) {
    vides++;
    continue;
  }
  const dep = DEPARTEMENTS[depLib];
  const arr = ARRONDISSEMENTS[`${dep}|${arrLib.replace(/^DAEPIA de\s+/i, "")}`];
  if (!dep || !arr || !czv || !village) throw new Error(`Ligne non reconnue : ${JSON.stringify(r)}`);
  const cle = `${dep}|${arr}`;
  if (!arbre.has(cle)) arbre.set(cle, new Map());
  const centres = arbre.get(cle);
  if (!centres.has(czv)) centres.set(czv, []);
  const liste = centres.get(czv);
  if (liste.some((v) => slug(v) === slug(village))) {
    doublons++;
    continue;
  }
  liste.push(village);
}

const json = [];
const valeursCentres = [];
const valeursVillages = [];
for (const [cle, centres] of arbre) {
  const [dep, arr] = cle.split("|");
  let ordreCentre = 0;
  for (const [czv, villages] of centres) {
    const idCentre = `czv_${arr.toLowerCase()}_${slug(czv.replace(/^CZV\s+/i, ""))}`;
    valeursCentres.push(`(${sql(dep)}, ${sql(arr)}, ${sql(idCentre)}, ${sql(czv)}, ${++ordreCentre})`);
    villages.forEach((v, i) => {
      const idVillage = `${idCentre.replace(/^czv_/, "vil_")}_${slug(v)}`;
      valeursVillages.push(`(${sql(dep)}, ${sql(idCentre)}, ${sql(idVillage)}, ${sql(v)}, ${i + 1})`);
    });
    json.push({ departement: dep, arrondissement: arr, centre: { id: idCentre, nom: czv }, villages });
  }
}

const racine = path.join(__dirname, "..");
fs.mkdirSync(path.join(racine, "referentiels"), { recursive: true });
fs.writeFileSync(path.join(racine, "referentiels", "villages_czv_ouest_2026.json"), JSON.stringify(json, null, 1) + "\n");

const migration = `-- ============================================================================
-- Les CZV et les villages qu'ils couvrent, pour toute la région de l'Ouest
-- (découpage MINEPIA 2026, fichier remis par le Délégué le 4 novembre 2026 :
-- docs/referentiels/Villages couverts par les CCZV Ouest 2026.xlsx).
-- Fichier PRODUIT par scripts/referentiel-villages-czv.cjs : ne pas l'éditer à
-- la main, régénérer.
--
-- Sert à rattacher un établissement à son CZV et à son village. La « localité »
-- de l'établissement reste remplie (avec le nom du village) : rien de ce qui
-- l'utilise ne change.
--
-- Migration ADDITIVE : deux tables nouvelles, trois colonnes facultatives sur
-- "Etablissement". Aucune donnée existante n'est modifiée ; l'ancien code
-- ignore tout cela. Les lignes sont rattachées aux arrondissements par leur
-- CODE (MBD, GLM…) : un arrondissement absent d'une base (démonstration
-- partielle) ne reçoit simplement rien.
--
-- ${valeursCentres.length} CZV, ${valeursVillages.length} villages ; ${vides} lignes vides et ${doublons} doublon(s) écartés du fichier.
--
-- Retour arrière :
--   ALTER TABLE "Etablissement" DROP COLUMN "centreId", DROP COLUMN "villageId", DROP COLUMN "villageAutre";
--   DROP TABLE "Village"; DROP TABLE "CentreZootechnique";
-- ============================================================================

CREATE TABLE IF NOT EXISTS "CentreZootechnique" (
    "departementId" TEXT,
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "arrondissementId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "CentreZootechnique_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CentreZootechnique_arrondissementId_idx" ON "CentreZootechnique"("arrondissementId");

CREATE TABLE IF NOT EXISTS "Village" (
    "departementId" TEXT,
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "centreId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Village_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Village_centreId_idx" ON "Village"("centreId");

ALTER TABLE "Etablissement" ADD COLUMN IF NOT EXISTS "centreId" TEXT;
ALTER TABLE "Etablissement" ADD COLUMN IF NOT EXISTS "villageId" TEXT;
ALTER TABLE "Etablissement" ADD COLUMN IF NOT EXISTS "villageAutre" TEXT;

ALTER TABLE "CentreZootechnique" ADD CONSTRAINT "CentreZootechnique_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CentreZootechnique" ADD CONSTRAINT "CentreZootechnique_arrondissementId_fkey"
    FOREIGN KEY ("arrondissementId") REFERENCES "Arrondissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Village" ADD CONSTRAINT "Village_departementId_fkey"
    FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Village" ADD CONSTRAINT "Village_centreId_fkey"
    FOREIGN KEY ("centreId") REFERENCES "CentreZootechnique"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Etablissement" ADD CONSTRAINT "Etablissement_centreId_fkey"
    FOREIGN KEY ("centreId") REFERENCES "CentreZootechnique"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Etablissement" ADD CONSTRAINT "Etablissement_villageId_fkey"
    FOREIGN KEY ("villageId") REFERENCES "Village"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cloisonnement par département, comme toutes les tables métier.
ALTER TABLE "CentreZootechnique" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CentreZootechnique_departement" ON "CentreZootechnique";
CREATE POLICY "CentreZootechnique_departement" ON "CentreZootechnique"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));
DROP TRIGGER IF EXISTS "CentreZootechnique_departement_insert" ON "CentreZootechnique";
CREATE TRIGGER "CentreZootechnique_departement_insert"
  BEFORE INSERT ON "CentreZootechnique"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();

ALTER TABLE "Village" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Village_departement" ON "Village";
CREATE POLICY "Village_departement" ON "Village"
  USING ("departementId" = current_setting('app.departement_id', true))
  WITH CHECK ("departementId" = current_setting('app.departement_id', true));
DROP TRIGGER IF EXISTS "Village_departement_insert" ON "Village";
CREATE TRIGGER "Village_departement_insert"
  BEFORE INSERT ON "Village"
  FOR EACH ROW EXECUTE FUNCTION public.poser_departement();

-- Les lignes, département par département, chacun sous SON cloisonnement.
DO $$
DECLARE
  d RECORD;
BEGIN
  FOR d IN SELECT id, code FROM "Departement" LOOP
    PERFORM set_config('app.departement_id', d.id, true);

    INSERT INTO "CentreZootechnique" ("departementId", "id", "nom", "arrondissementId", "ordre")
    SELECT d.id, v.id, v.nom, a.id, v.ordre
      FROM (VALUES
${valeursCentres.map((v) => "        " + v).join(",\n")}
      ) AS v(dep, arr, id, nom, ordre)
      JOIN "Arrondissement" a ON a.code = v.arr AND a."departementId" = d.id
     WHERE v.dep = d.code
    ON CONFLICT ("id") DO UPDATE SET "nom" = EXCLUDED."nom", "ordre" = EXCLUDED."ordre";

    INSERT INTO "Village" ("departementId", "id", "nom", "centreId", "ordre")
    SELECT d.id, v.id, v.nom, c.id, v.ordre
      FROM (VALUES
${valeursVillages.map((v) => "        " + v).join(",\n")}
      ) AS v(dep, centre, id, nom, ordre)
      JOIN "CentreZootechnique" c ON c.id = v.centre AND c."departementId" = d.id
     WHERE v.dep = d.code
    ON CONFLICT ("id") DO UPDATE SET "nom" = EXCLUDED."nom", "ordre" = EXCLUDED."ordre";
  END LOOP;
END
$$;
`;
fs.mkdirSync(path.dirname(sortieSql), { recursive: true });
fs.writeFileSync(sortieSql, migration);
console.log(`${valeursCentres.length} CZV, ${valeursVillages.length} villages ; ${vides} lignes vides, ${doublons} doublon(s) écartés.`);

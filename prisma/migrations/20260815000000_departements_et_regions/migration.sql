-- ============================================================================
-- Departement et Region : l unite de cloisonnement du SID.
--
-- Toute donnee du SID appartient a un et un seul departement. La colonne
-- "departementId" est DENORMALISEE a dessein sur 19 tables : les politiques de
-- securite par ligne comparent alors une colonne, pas une jointure -- et une
-- politique qui doit lire une autre table protegee se mord la queue.
--
-- MIGRATION ADDITIVE. La colonne est NULLABLE et porte une VALEUR PAR DEFAUT :
-- pendant les quelques secondes ou l ancien code tourne encore contre le
-- nouveau schema, ses INSERT n indiquent aucun departement et doivent tout de
-- meme aboutir. Un NOT NULL ici ferait echouer une saisie d agent au moment
-- meme du deploiement. Le resserrement viendra dans une migration ulterieure,
-- une fois le nouveau code en place partout.
-- ============================================================================

-- AlterTable
ALTER TABLE "AbonnementPush" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "Arrondissement" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "AssignationSaisie" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "Correction" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "DemandeAide" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "Etablissement" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "ExportDocument" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "PeriodeReporting" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "PointSIG" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "RapportArrondissement" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "RubriqueNarrative" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "SaisieEvenement" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "SaisieMatrice" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "SaisieNominative" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "SyntheseSection" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "departementId" TEXT;

-- AlterTable
ALTER TABLE "ValidationSection" ADD COLUMN     "departementId" TEXT;

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Departement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,

    CONSTRAINT "Departement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Departement_code_key" ON "Departement"("code");

-- CreateIndex
CREATE INDEX "Departement_regionId_idx" ON "Departement"("regionId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Departement" ADD CONSTRAINT "Departement_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Arrondissement" ADD CONSTRAINT "Arrondissement_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etablissement" ADD CONSTRAINT "Etablissement_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodeReporting" ADD CONSTRAINT "PeriodeReporting_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignationSaisie" ADD CONSTRAINT "AssignationSaisie_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RapportArrondissement" ADD CONSTRAINT "RapportArrondissement_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationSection" ADD CONSTRAINT "ValidationSection_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieMatrice" ADD CONSTRAINT "SaisieMatrice_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieNominative" ADD CONSTRAINT "SaisieNominative_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieEvenement" ADD CONSTRAINT "SaisieEvenement_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubriqueNarrative" ADD CONSTRAINT "RubriqueNarrative_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheseSection" ADD CONSTRAINT "SyntheseSection_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportDocument" ADD CONSTRAINT "ExportDocument_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonnementPush" ADD CONSTRAINT "AbonnementPush_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointSIG" ADD CONSTRAINT "PointSIG_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemandeAide" ADD CONSTRAINT "DemandeAide_departementId_fkey" FOREIGN KEY ("departementId") REFERENCES "Departement"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ----------------------------------------------------------------------------
-- Rattachement de l existant.
--
-- Le SID ne sert aujourd hui qu un departement : la Menoua, region de l Ouest.
-- Toutes les lignes deja en base lui appartiennent. Les identifiants sont
-- FIXES et non aleatoires : une valeur par defaut doit pouvoir les citer, et
-- rejouer cette migration sur un autre environnement doit donner les memes.
-- ----------------------------------------------------------------------------
INSERT INTO "Region" ("id", "code", "nom")
     VALUES ('reg_ouest', 'OU', 'Ouest')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Departement" ("id", "code", "nom", "regionId")
     VALUES ('dep_menoua', 'MEN', 'Menoua', 'reg_ouest')
ON CONFLICT ("id") DO NOTHING;

UPDATE "Arrondissement" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "Arrondissement" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "PeriodeReporting" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "PeriodeReporting" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "User" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "User" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "Etablissement" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "Etablissement" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "AssignationSaisie" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "AssignationSaisie" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "RapportArrondissement" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "RapportArrondissement" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "ValidationSection" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "ValidationSection" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "SaisieMatrice" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "SaisieMatrice" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "SaisieNominative" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "SaisieNominative" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "SaisieEvenement" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "SaisieEvenement" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "Correction" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "Correction" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "RubriqueNarrative" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "RubriqueNarrative" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "SyntheseSection" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "SyntheseSection" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "ExportDocument" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "ExportDocument" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "Notification" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "Notification" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "AbonnementPush" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "AbonnementPush" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "PointSIG" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "PointSIG" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "AuditLog" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';
UPDATE "DemandeAide" SET "departementId" = 'dep_menoua' WHERE "departementId" IS NULL;
ALTER TABLE "DemandeAide" ALTER COLUMN "departementId" SET DEFAULT 'dep_menoua';

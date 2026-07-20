-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DD', 'DA', 'CHEF_BAC', 'CHEF_SSV', 'CHEF_PSA', 'CHEF_SPAIH', 'ADMIN_TECH');

-- CreateEnum
CREATE TYPE "CategorieReferentiel" AS ENUM ('ESPECE', 'VOLAILLE', 'CATEGORIE_ANIMALE', 'MALADIE', 'VACCIN', 'ACTE_VETERINAIRE', 'MOTIF_SAISIE', 'ESPECE_HALIEUTIQUE', 'UNITE', 'TYPE_ETABLISSEMENT', 'TYPE_POINT_SIG');

-- CreateEnum
CREATE TYPE "TypeTableau" AS ENUM ('MATRICE', 'NOMINATIF', 'EVENEMENT');

-- CreateEnum
CREATE TYPE "TypePeriode" AS ENUM ('MENSUEL', 'TRIMESTRIEL', 'SEMESTRIEL', 'ANNUEL');

-- CreateEnum
CREATE TYPE "StatutPeriode" AS ENUM ('OUVERTE', 'VERROUILLEE_DA', 'VALIDEE_DD', 'ARCHIVEE');

-- CreateEnum
CREATE TYPE "StatutRapportDA" AS ENUM ('EN_SAISIE', 'SOUMIS', 'REJETE', 'CLOTURE');

-- CreateEnum
CREATE TYPE "StatutValidationSection" AS ENUM ('EN_ATTENTE', 'EN_CONTROLE', 'VALIDE', 'REJETE');

-- CreateEnum
CREATE TYPE "TypeAggregation" AS ENUM ('SOMME', 'MOYENNE', 'DERNIERE_VALEUR', 'COMPTAGE');

-- CreateEnum
CREATE TYPE "TypeExport" AS ENUM ('RAPPORT_DA_DOCX', 'RAPPORT_DD_DOCX', 'RAPPORT_DD_PDF', 'PPT_TRIMESTRIEL', 'EXPORT_DREPIA_XLSX', 'EXPORT_DREPIA_DOCX', 'EXPORT_SIG_GEOJSON');

-- CreateEnum
CREATE TYPE "CanalNotification" AS ENUM ('SMS', 'WHATSAPP', 'IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "StatutNotification" AS ENUM ('EN_ATTENTE', 'ENVOYE', 'ECHEC', 'REESSAI');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "fonction" TEXT,
    "telephone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "role" "Role" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "arrondissementId" TEXT,
    "sectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Arrondissement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "geometry" geometry(MultiPolygon, 4326),

    CONSTRAINT "Arrondissement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferentielItem" (
    "id" TEXT NOT NULL,
    "categorie" "CategorieReferentiel" NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "libelleEn" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "ReferentielItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "type" "TypeTableau" NOT NULL,
    "sectionId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "schemaEvenement" JSONB,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "uniteCode" TEXT,
    "typeValeur" TEXT NOT NULL DEFAULT 'ENTIER',
    "ordre" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etablissement" (
    "id" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "localite" TEXT NOT NULL,
    "arrondissementId" TEXT NOT NULL,
    "proprietaire" TEXT,
    "telephone" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "geom" geometry(Point, 4326),
    "sourceGPS" TEXT,
    "dateCollecteGPS" TIMESTAMP(3),
    "precisionGPS" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Etablissement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodeReporting" (
    "id" TEXT NOT NULL,
    "type" "TypePeriode" NOT NULL,
    "annee" INTEGER NOT NULL,
    "mois" INTEGER,
    "trimestre" INTEGER,
    "semestre" INTEGER,
    "dateOuverture" TIMESTAMP(3) NOT NULL,
    "dateLimiteDA" TIMESTAMP(3) NOT NULL,
    "dateLimiteChef" TIMESTAMP(3) NOT NULL,
    "dateLimiteDD" TIMESTAMP(3) NOT NULL,
    "statut" "StatutPeriode" NOT NULL DEFAULT 'OUVERTE',

    CONSTRAINT "PeriodeReporting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RapportArrondissement" (
    "id" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "arrondissementId" TEXT NOT NULL,
    "statut" "StatutRapportDA" NOT NULL DEFAULT 'EN_SAISIE',
    "soumisParId" TEXT,
    "dateSoumission" TIMESTAMP(3),
    "motifRejet" TEXT,
    "deverrouillePar" TEXT,
    "motifDeverrouillage" TEXT,
    "dateDeverrouillage" TIMESTAMP(3),

    CONSTRAINT "RapportArrondissement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationSection" (
    "id" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "statut" "StatutValidationSection" NOT NULL DEFAULT 'EN_ATTENTE',
    "valideParId" TEXT,
    "dateValidation" TIMESTAMP(3),

    CONSTRAINT "ValidationSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaisieMatrice" (
    "id" TEXT NOT NULL,
    "rapportId" TEXT NOT NULL,
    "fieldCode" TEXT NOT NULL,
    "valeur" DECIMAL(14,3),
    "nonRenseigne" BOOLEAN NOT NULL DEFAULT false,
    "motifNonRenseigne" TEXT,
    "clientId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaisieMatrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaisieNominative" (
    "id" TEXT NOT NULL,
    "rapportId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "etablissementId" TEXT NOT NULL,
    "fieldCode" TEXT NOT NULL,
    "valeur" DECIMAL(14,3),
    "valeurTexte" TEXT,
    "nonRenseigne" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaisieNominative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaisieEvenement" (
    "id" TEXT NOT NULL,
    "rapportId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "clientId" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaisieEvenement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Correction" (
    "id" TEXT NOT NULL,
    "saisieMatriceId" TEXT,
    "saisieNominativeId" TEXT,
    "saisieEvenementId" TEXT,
    "valeurAvant" TEXT NOT NULL,
    "valeurApres" TEXT NOT NULL,
    "motif" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Correction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyntheseSection" (
    "id" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "blocCode" TEXT,
    "brouillonIA" TEXT,
    "promptIA" TEXT,
    "contenuFinal" TEXT,
    "auteurId" TEXT,
    "valideDD" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyntheseSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MappingRapport" (
    "id" TEXT NOT NULL,
    "docTag" TEXT NOT NULL,
    "documentCible" TEXT NOT NULL,
    "templateId" TEXT,
    "fieldCodes" TEXT[],
    "arrondissementCode" TEXT,
    "aggregation" "TypeAggregation" NOT NULL DEFAULT 'SOMME',
    "calculeEcartN1" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MappingRapport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportDocument" (
    "id" TEXT NOT NULL,
    "type" "TypeExport" NOT NULL,
    "periodeId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "cheminFichier" TEXT NOT NULL,
    "hashSha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExportDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "destinataireId" TEXT NOT NULL,
    "canal" "CanalNotification" NOT NULL,
    "message" TEXT NOT NULL,
    "declencheur" TEXT NOT NULL,
    "statut" "StatutNotification" NOT NULL DEFAULT 'EN_ATTENTE',
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "erreur" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointSIG" (
    "id" TEXT NOT NULL,
    "typeCode" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "arrondissementId" TEXT NOT NULL,
    "geom" geometry(Point, 4326) NOT NULL,
    "source" TEXT NOT NULL,
    "dateCollecte" TIMESTAMP(3) NOT NULL,
    "agentCollecteur" TEXT NOT NULL,
    "precision" DOUBLE PRECISION,
    "observation" TEXT,
    "valide" BOOLEAN NOT NULL DEFAULT false,
    "periodeRef" TEXT,

    CONSTRAINT "PointSIG_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entite" TEXT,
    "entiteId" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_actif_idx" ON "User"("role", "actif");

-- CreateIndex
CREATE UNIQUE INDEX "Arrondissement_code_key" ON "Arrondissement"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Section_code_key" ON "Section"("code");

-- CreateIndex
CREATE INDEX "ReferentielItem_categorie_actif_idx" ON "ReferentielItem"("categorie", "actif");

-- CreateIndex
CREATE UNIQUE INDEX "ReferentielItem_categorie_code_key" ON "ReferentielItem"("categorie", "code");

-- CreateIndex
CREATE UNIQUE INDEX "FormTemplate_code_key" ON "FormTemplate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FormField_code_key" ON "FormField"("code");

-- CreateIndex
CREATE INDEX "FormField_templateId_actif_idx" ON "FormField"("templateId", "actif");

-- CreateIndex
CREATE INDEX "Etablissement_arrondissementId_typeCode_actif_idx" ON "Etablissement"("arrondissementId", "typeCode", "actif");

-- CreateIndex
CREATE INDEX "PeriodeReporting_statut_dateLimiteDA_idx" ON "PeriodeReporting"("statut", "dateLimiteDA");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodeReporting_type_annee_mois_trimestre_semestre_key" ON "PeriodeReporting"("type", "annee", "mois", "trimestre", "semestre");

-- CreateIndex
CREATE INDEX "RapportArrondissement_statut_idx" ON "RapportArrondissement"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "RapportArrondissement_periodeId_arrondissementId_key" ON "RapportArrondissement"("periodeId", "arrondissementId");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationSection_periodeId_sectionId_key" ON "ValidationSection"("periodeId", "sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "SaisieMatrice_clientId_key" ON "SaisieMatrice"("clientId");

-- CreateIndex
CREATE INDEX "SaisieMatrice_fieldCode_idx" ON "SaisieMatrice"("fieldCode");

-- CreateIndex
CREATE UNIQUE INDEX "SaisieMatrice_rapportId_fieldCode_key" ON "SaisieMatrice"("rapportId", "fieldCode");

-- CreateIndex
CREATE UNIQUE INDEX "SaisieNominative_clientId_key" ON "SaisieNominative"("clientId");

-- CreateIndex
CREATE INDEX "SaisieNominative_templateId_etablissementId_idx" ON "SaisieNominative"("templateId", "etablissementId");

-- CreateIndex
CREATE UNIQUE INDEX "SaisieNominative_rapportId_etablissementId_fieldCode_key" ON "SaisieNominative"("rapportId", "etablissementId", "fieldCode");

-- CreateIndex
CREATE UNIQUE INDEX "SaisieEvenement_clientId_key" ON "SaisieEvenement"("clientId");

-- CreateIndex
CREATE INDEX "SaisieEvenement_templateId_idx" ON "SaisieEvenement"("templateId");

-- CreateIndex
CREATE INDEX "Correction_auteurId_createdAt_idx" ON "Correction"("auteurId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyntheseSection_periodeId_sectionId_blocCode_key" ON "SyntheseSection"("periodeId", "sectionId", "blocCode");

-- CreateIndex
CREATE UNIQUE INDEX "MappingRapport_docTag_key" ON "MappingRapport"("docTag");

-- CreateIndex
CREATE INDEX "MappingRapport_documentCible_idx" ON "MappingRapport"("documentCible");

-- CreateIndex
CREATE INDEX "ExportDocument_periodeId_type_idx" ON "ExportDocument"("periodeId", "type");

-- CreateIndex
CREATE INDEX "Notification_statut_createdAt_idx" ON "Notification"("statut", "createdAt");

-- CreateIndex
CREATE INDEX "PointSIG_typeCode_arrondissementId_idx" ON "PointSIG"("typeCode", "arrondissementId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_arrondissementId_fkey" FOREIGN KEY ("arrondissementId") REFERENCES "Arrondissement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormTemplate" ADD CONSTRAINT "FormTemplate_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Etablissement" ADD CONSTRAINT "Etablissement_arrondissementId_fkey" FOREIGN KEY ("arrondissementId") REFERENCES "Arrondissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RapportArrondissement" ADD CONSTRAINT "RapportArrondissement_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "PeriodeReporting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RapportArrondissement" ADD CONSTRAINT "RapportArrondissement_arrondissementId_fkey" FOREIGN KEY ("arrondissementId") REFERENCES "Arrondissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RapportArrondissement" ADD CONSTRAINT "RapportArrondissement_soumisParId_fkey" FOREIGN KEY ("soumisParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationSection" ADD CONSTRAINT "ValidationSection_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "PeriodeReporting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationSection" ADD CONSTRAINT "ValidationSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ValidationSection" ADD CONSTRAINT "ValidationSection_valideParId_fkey" FOREIGN KEY ("valideParId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieMatrice" ADD CONSTRAINT "SaisieMatrice_rapportId_fkey" FOREIGN KEY ("rapportId") REFERENCES "RapportArrondissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieMatrice" ADD CONSTRAINT "SaisieMatrice_fieldCode_fkey" FOREIGN KEY ("fieldCode") REFERENCES "FormField"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieNominative" ADD CONSTRAINT "SaisieNominative_rapportId_fkey" FOREIGN KEY ("rapportId") REFERENCES "RapportArrondissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieNominative" ADD CONSTRAINT "SaisieNominative_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieNominative" ADD CONSTRAINT "SaisieNominative_etablissementId_fkey" FOREIGN KEY ("etablissementId") REFERENCES "Etablissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieNominative" ADD CONSTRAINT "SaisieNominative_fieldCode_fkey" FOREIGN KEY ("fieldCode") REFERENCES "FormField"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieEvenement" ADD CONSTRAINT "SaisieEvenement_rapportId_fkey" FOREIGN KEY ("rapportId") REFERENCES "RapportArrondissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaisieEvenement" ADD CONSTRAINT "SaisieEvenement_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_saisieMatriceId_fkey" FOREIGN KEY ("saisieMatriceId") REFERENCES "SaisieMatrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_saisieNominativeId_fkey" FOREIGN KEY ("saisieNominativeId") REFERENCES "SaisieNominative"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_saisieEvenementId_fkey" FOREIGN KEY ("saisieEvenementId") REFERENCES "SaisieEvenement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Correction" ADD CONSTRAINT "Correction_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheseSection" ADD CONSTRAINT "SyntheseSection_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "PeriodeReporting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheseSection" ADD CONSTRAINT "SyntheseSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheseSection" ADD CONSTRAINT "SyntheseSection_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MappingRapport" ADD CONSTRAINT "MappingRapport_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportDocument" ADD CONSTRAINT "ExportDocument_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "PeriodeReporting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportDocument" ADD CONSTRAINT "ExportDocument_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_destinataireId_fkey" FOREIGN KEY ("destinataireId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointSIG" ADD CONSTRAINT "PointSIG_arrondissementId_fkey" FOREIGN KEY ("arrondissementId") REFERENCES "Arrondissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

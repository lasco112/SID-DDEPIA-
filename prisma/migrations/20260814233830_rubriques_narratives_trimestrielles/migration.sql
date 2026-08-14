-- CreateTable
CREATE TABLE "RubriqueNarrative" (
    "id" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "arrondissementId" TEXT,
    "cle" TEXT NOT NULL,
    "contenu" TEXT,
    "brouillonIA" TEXT,
    "auteurId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RubriqueNarrative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RubriqueNarrative_periodeId_arrondissementId_idx" ON "RubriqueNarrative"("periodeId", "arrondissementId");

-- CreateIndex
CREATE UNIQUE INDEX "RubriqueNarrative_periodeId_arrondissementId_cle_key" ON "RubriqueNarrative"("periodeId", "arrondissementId", "cle");

-- AddForeignKey
ALTER TABLE "RubriqueNarrative" ADD CONSTRAINT "RubriqueNarrative_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "PeriodeReporting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubriqueNarrative" ADD CONSTRAINT "RubriqueNarrative_arrondissementId_fkey" FOREIGN KEY ("arrondissementId") REFERENCES "Arrondissement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubriqueNarrative" ADD CONSTRAINT "RubriqueNarrative_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Unicite reelle des rubriques departementales.
--
-- En PostgreSQL, deux NULL sont DISTINCTS : l'index unique genere ci-dessus sur
-- ("periodeId","arrondissementId","cle") ne protege donc PAS les rubriques du
-- rapport departemental, ou "arrondissementId" vaut NULL. Sans l'index partiel
-- ci-dessous, le meme trimestre pouvait porter deux introductions
-- departementales differentes, et le rapport en prenait une au hasard.
--
-- Prisma ne sait pas declarer d'index partiel : il est ecrit ici a la main, et
-- ne sera pas regenere. Ne pas le retirer.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX "RubriqueNarrative_departementale_key"
  ON "RubriqueNarrative"("periodeId", "cle")
  WHERE "arrondissementId" IS NULL;

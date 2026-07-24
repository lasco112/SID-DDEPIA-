-- CreateTable
CREATE TABLE "AssignationSaisie" (
    "id" TEXT NOT NULL,
    "periodeId" TEXT NOT NULL,
    "arrondissementId" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "agentId" TEXT,
    "assignePar" TEXT NOT NULL,
    "assigneLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignationSaisie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssignationSaisie_periodeId_arrondissementId_templateCode_key" ON "AssignationSaisie"("periodeId", "arrondissementId", "templateCode");

-- AddForeignKey
ALTER TABLE "AssignationSaisie" ADD CONSTRAINT "AssignationSaisie_periodeId_fkey" FOREIGN KEY ("periodeId") REFERENCES "PeriodeReporting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignationSaisie" ADD CONSTRAINT "AssignationSaisie_arrondissementId_fkey" FOREIGN KEY ("arrondissementId") REFERENCES "Arrondissement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignationSaisie" ADD CONSTRAINT "AssignationSaisie_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignationSaisie" ADD CONSTRAINT "AssignationSaisie_assignePar_fkey" FOREIGN KEY ("assignePar") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
